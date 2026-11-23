import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { DEFAULT_SETTINGS, getSettings, onSettingsSaved, saveSettings, type Settings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { DriveError, downloadJson, findSyncFile, getFileMeta, uploadJson } from './drive';
import { driveConfigured, fetchEmail, forgetToken, GoogleAuthError, onSharedTokenChange, requestToken, revokeToken, storedToken, type AccessToken } from './google';
import { onLibraryStreamingChanged } from '../db/streaming';
import { libraryStreaming, mergePayloads, pickSynced, sameContent, type SyncPayload } from './merge';

export type SyncStatus = 'off' | 'idle' | 'pending' | 'syncing' | 'needs-auth' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncAt: number;
  error?: string;
}

let state: SyncState = { status: 'off', lastSyncAt: 0 };
const subscribers = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn());
};

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    () => state,
  );
}

/**
 * Changes are batched: the first unsynced change starts this timer, and everything changed before
 * it fires goes up in one sync (later changes don't push it back). Pending changes are also flushed
 * when the tab is hidden or closed. This keeps Drive calls far below Google's per-user limits.
 */
export const SYNC_BATCH_MS = 2 * 60_000;
/** Coming back to the tab after this long pulls changes made on other devices. */
const REFRESH_AFTER_MS = 2 * 60_000;

let token: AccessToken | null = null;
let fileId: string | undefined;
/** What the Drive file held after our last sync, so an unchanged file isn't downloaded again. */
let remoteCopy: { modifiedTime: string; payload: SyncPayload | null } | null = null;
let applyingRemote = false;
/** Local changes not yet in Drive. */
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;

const validToken = () => (token && token.expiresAt > Date.now() + 60_000 ? token : (token = storedToken()));

async function localPayload(): Promise<SyncPayload> {
  const s = await getSettings();
  const items = await db.items.toArray();
  const streaming = libraryStreaming(await db.streaming.toArray(), items);
  const people = await db.people.toArray();
  return { app: 'MovieMango', version: 1, savedAt: Date.now(), items, lists: await db.lists.toArray(), streaming, ...(people.length ? { people } : {}), settings: pickSynced(s), settingsUpdatedAt: s.settingsUpdatedAt };
}

/** With key sync off, keys are neither read from nor written to Drive (and any old copy there is removed). */
function withoutKeys<T extends SyncPayload | null>(p: T): T {
  if (!p) return p;
  const { tmdbToken: _t, geminiKey: _g, ...settings } = p.settings ?? {};
  return { ...p, settings };
}

async function applyLocally(merged: SyncPayload) {
  applyingRemote = true;
  try {
    await db.transaction('rw', db.items, db.lists, db.streaming, db.people, async () => {
      await db.items.bulkPut(merged.items);
      await db.lists.bulkPut(merged.lists);
      if (merged.streaming?.length) await db.streaming.bulkPut(merged.streaming);
      if (merged.people?.length) await db.people.bulkPut(merged.people);
    });
    await saveSettings({ ...merged.settings, settingsUpdatedAt: merged.settingsUpdatedAt }, { fromSync: true });
  } finally {
    applyingRemote = false;
  }
}

/**
 * Pulls the Drive copy, merges both ways, writes locally and uploads if anything changed.
 * At most three calls: file metadata, a download only if the file changed since our last sync,
 * and an upload only if the merge changed it.
 */
async function doSync(t: AccessToken, opts: { keepalive?: boolean } = {}): Promise<{ restoredItems: number; restoredLists: number; hadRemote: boolean }> {
  dirty = false;
  let meta = fileId ? await getFileMeta(t.token, fileId) : null;
  if (!meta) meta = await findSyncFile(t.token);
  fileId = meta?.id;
  const remote = !meta
    ? null
    : remoteCopy?.modifiedTime === meta.modifiedTime
      ? remoteCopy.payload
      : await downloadJson<SyncPayload>(t.token, meta.id).catch(() => null);
  const { driveSyncKeys } = await getSettings();
  const local = driveSyncKeys ? await localPayload() : withoutKeys(await localPayload());
  const merged = mergePayloads(local, remote?.app === 'MovieMango' ? (driveSyncKeys ? remote : withoutKeys(remote)) : null);
  const newFromRemote = merged.items.length - local.items.length;
  if (!sameContent(local, merged)) await applyLocally(merged);
  if (!sameContent(remote, merged)) {
    const saved = await uploadJson(t.token, merged, fileId, opts);
    fileId = saved.id;
    remoteCopy = { modifiedTime: saved.modifiedTime, payload: merged };
  } else if (meta) remoteCopy = { modifiedTime: meta.modifiedTime, payload: remote };
  const lastSyncAt = Date.now();
  await saveSettings({ lastSyncAt }, { fromSync: true });
  // Changes made while this sync ran are waiting for the next batch.
  set({ status: dirty ? 'pending' : 'idle', lastSyncAt, error: undefined });
  return { restoredItems: Math.max(0, newFromRemote), restoredLists: Math.max(0, merged.lists.length - local.lists.length), hadRemote: !!remote };
}

async function guarded<T>(fn: (t: AccessToken) => Promise<T>): Promise<T | undefined> {
  const wasDirty = dirty;
  const t = validToken();
  if (!t) {
    set({ status: 'needs-auth' });
    return undefined;
  }
  set({ status: 'syncing' });
  try {
    return await fn(t);
  } catch (e) {
    // Keep unsynced changes for the next try.
    dirty ||= wasDirty;
    if (e instanceof DriveError && e.status === 401) {
      token = null;
      forgetToken();
      set({ status: 'needs-auth' });
    } else {
      set({ status: 'error', error: (e as Error).message });
      // Try again in the next batch window.
      if (dirty) void getSettings().then((s) => s.driveAutoSync && startBatch());
    }
    return undefined;
  }
}

/** Sync now if we have a token; otherwise mark that the user needs to reconnect. One sync at a time. */
export function syncNow(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (state.status === 'off') return Promise.resolve();
  clearTimeout(timer);
  timer = undefined;
  running ??= guarded((t) => doSync(t, opts))
    .then(() => undefined)
    .finally(() => (running = null));
  return running;
}

/** Starts the batch timer unless one is already waiting. */
function startBatch() {
  if (!timer) timer = setTimeout(() => void syncNow(), SYNC_BATCH_MS);
}

/** Marks a local change. With auto-sync on it joins the current batch; off, it only shows as pending. */
export function scheduleSync() {
  if (state.status === 'off' || applyingRemote) return;
  dirty = true;
  if (state.status !== 'needs-auth' && state.status !== 'syncing') set({ status: 'pending' });
  void getSettings().then((s) => s.driveAutoSync && startBatch());
}

/**
 * Interactive: opens Google's sign-in popup (call from a click), then pulls any existing
 * MovieMango data from Drive and merges it with this device.
 */
export async function connectDrive(opts: { fresh?: boolean } = {}) {
  const s = await getSettings();
  try {
    token = await requestToken({ fresh: opts.fresh ?? !s.driveConnected, hint: s.driveEmail });
  } catch (e) {
    if (e instanceof GoogleAuthError) trackEvent('drive_connect_failed', { kind: e.kind });
    throw e;
  }
  const email = (await fetchEmail(token.token).catch(() => '')) || s.driveEmail;
  await saveSettings({ driveConnected: true, driveEmail: email }, { fromSync: true });
  set({ status: 'syncing', lastSyncAt: s.lastSyncAt });
  const result = await doSync(token).catch((e: Error) => {
    set({ status: 'error', error: e.message });
    throw e;
  });
  trackEvent('drive_connected', { restored: result.hadRemote });
  return { email, ...result };
}

/** Interactive reconnect after the hour-long token expired. */
export async function reconnectDrive() {
  const s = await getSettings();
  token = await requestToken({ hint: s.driveEmail });
  await syncNow();
}

/** After a failed quiet renewal, wait this long before trying again (e.g. on the next app resume). */
const SILENT_RETRY_MS = 5 * 60_000;
let lastSilentAt = 0;
/** Another tab of this browser tried a quiet renewal this recently: don't pile on (it will share the token if it worked). */
const SILENT_SHARED_MS = 30_000;
const SILENT_SHARED_KEY = 'mm.driveSilentAt';

function otherTabTriedLately(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SILENT_SHARED_KEY) ?? 0) < SILENT_SHARED_MS;
  } catch {
    return false;
  }
}

function markSilentTry() {
  lastSilentAt = Date.now();
  try {
    localStorage.setItem(SILENT_SHARED_KEY, String(lastSilentAt));
  } catch {
    /* storage unavailable */
  }
}

/**
 * When the hour-long token has lapsed, try to renew it without any screen (browser tab or installed app), so the
 * user doesn't have to press "Reconnect". It never interrupts: if Google or the browser needs a tap, the
 * "Reconnect Drive" chip stays and the user signs in when they choose to. Returns true if signed in.
 * Needs the user to have connected Drive before and `driveAutoReconnect` on.
 */
export async function silentReconnect(): Promise<boolean> {
  if (!driveConfigured() || state.status === 'off') return false;
  const s = await getSettings();
  if (!s.driveConnected || !s.driveAutoReconnect) return false;
  if (validToken()) {
    // A token from another tab arrived while this one was waiting for a sign-in.
    if (state.status === 'needs-auth') await syncNow();
    return true;
  }
  if (Date.now() - lastSilentAt < SILENT_RETRY_MS || otherTabTriedLately()) return false;
  markSilentTry();
  try {
    token = await requestToken({ silent: true, hint: s.driveEmail });
  } catch {
    trackEvent('drive_silent_reconnect', { ok: false });
    set({ status: 'needs-auth' });
    return false;
  }
  trackEvent('drive_silent_reconnect', { ok: true });
  await syncNow();
  return true;
}

/** Forgets everything about the connection in this tab (memory only; the caller handles settings and storage). */
function dropConnection() {
  token = null;
  fileId = undefined;
  remoteCopy = null;
  dirty = false;
  clearTimeout(timer);
  timer = undefined;
}

export async function disconnectDrive() {
  const t = token?.token ?? storedToken()?.token;
  // Settings first: other tabs read them when the cleared token reaches them, to tell a disconnect from an expiry.
  await saveSettings({ driveConnected: false, driveEmail: '' }, { fromSync: true });
  await revokeToken(t);
  dropConnection();
  set({ status: 'off' });
}

/** Settings as another tab last saved them: this tab's in-memory copy may not have heard yet. */
async function freshSettings(): Promise<Settings> {
  const row = await db.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

/**
 * Another tab of this browser saved or cleared the shared token. A tab waiting at "Reconnect Drive" becomes
 * connected, and a tab whose Drive was disconnected elsewhere goes quiet. At most one sync, only if something
 * is waiting or the data is stale, after a short random delay, so several tabs don't hit Drive together.
 */
async function onSharedToken(t: AccessToken | null) {
  if (state.status === 'off') return;
  const s = await freshSettings();
  if (!s.driveConnected) {
    dropConnection();
    set({ status: 'off' });
    return;
  }
  if (!t) {
    token = null;
    if (state.status !== 'syncing') set({ status: 'needs-auth' });
    return;
  }
  if (!token || token.expiresAt <= t.expiresAt) token = t;
  if (state.status !== 'needs-auth') return;
  set({ status: dirty ? 'pending' : 'idle' });
  if (!s.driveAutoSync) return;
  setTimeout(async () => {
    // The tab that signed in has usually just synced; look at when, so this one needn't.
    const now = await freshSettings();
    if (dirty || Date.now() - Math.max(state.lastSyncAt, now.lastSyncAt ?? 0) > REFRESH_AFTER_MS) void syncNow();
  }, Math.random() * 2000);
}

let started = false;

/** Wires change listeners and does an initial sync when a token from this browser is still valid. */
export async function startSync() {
  if (started || !driveConfigured()) return;
  started = true;
  const s = await getSettings();
  set({ status: s.driveConnected ? (validToken() ? 'idle' : 'needs-auth') : 'off', lastSyncAt: s.lastSyncAt });
  const onChange = () => scheduleSync();
  for (const table of [db.items, db.lists, db.people]) {
    table.hook('creating', onChange);
    table.hook('updating', onChange);
    table.hook('deleting', onChange);
  }
  onSettingsSaved((changedSynced) => changedSynced && scheduleSync());
  onLibraryStreamingChanged(onChange);
  const whenAuto = (fn: () => void) => void getSettings().then((now) => now.driveAutoSync && now.driveConnected && fn());
  // Leaving: send what's waiting now rather than at the end of the batch window.
  const flush = () => dirty && whenAuto(() => void syncNow({ keepalive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    // Back after a while: pick up changes made on other devices.
    else if (state.status === 'needs-auth') void silentReconnect();
    else if (Date.now() - state.lastSyncAt > REFRESH_AFTER_MS && validToken()) whenAuto(() => void syncNow());
  });
  window.addEventListener('pagehide', flush);
  onSharedTokenChange((t) => void onSharedToken(t));
  if (s.driveConnected && s.driveAutoSync && validToken()) void syncNow();
  else if (s.driveConnected) void silentReconnect();
}

/** Called after onboarding/connect so the status reflects the new connection. */
export function markConnected() {
  if (state.status === 'off') set({ status: 'idle' });
}
