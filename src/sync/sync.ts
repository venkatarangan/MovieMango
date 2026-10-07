import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { getSettings, onSettingsSaved, saveSettings } from '../db/settings';
import { trackEvent } from '../lib/analytics';
import { DriveError, downloadJson, findSyncFile, getFileMeta, uploadJson } from './drive';
import { driveConfigured, fetchEmail, forgetToken, GoogleAuthError, requestToken, revokeToken, storedToken, type AccessToken } from './google';
import { mergePayloads, pickSynced, sameContent, type SyncPayload } from './merge';

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
  return { app: 'MovieMango', version: 1, savedAt: Date.now(), items: await db.items.toArray(), lists: await db.lists.toArray(), settings: pickSynced(s), settingsUpdatedAt: s.settingsUpdatedAt };
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
    await db.transaction('rw', db.items, db.lists, async () => {
      await db.items.bulkPut(merged.items);
      await db.lists.bulkPut(merged.lists);
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

export async function disconnectDrive() {
  await revokeToken(token?.token ?? storedToken()?.token);
  token = null;
  fileId = undefined;
  remoteCopy = null;
  dirty = false;
  clearTimeout(timer);
  timer = undefined;
  await saveSettings({ driveConnected: false, driveEmail: '' }, { fromSync: true });
  set({ status: 'off' });
}

let started = false;

/** Wires change listeners and does an initial sync when a token from this tab is still valid. */
export async function startSync() {
  if (started || !driveConfigured()) return;
  started = true;
  const s = await getSettings();
  set({ status: s.driveConnected ? (validToken() ? 'idle' : 'needs-auth') : 'off', lastSyncAt: s.lastSyncAt });
  const onChange = () => scheduleSync();
  for (const table of [db.items, db.lists]) {
    table.hook('creating', onChange);
    table.hook('updating', onChange);
    table.hook('deleting', onChange);
  }
  onSettingsSaved((changedSynced) => changedSynced && scheduleSync());
  const whenAuto = (fn: () => void) => void getSettings().then((now) => now.driveAutoSync && now.driveConnected && fn());
  // Leaving: send what's waiting now rather than at the end of the batch window.
  const flush = () => dirty && whenAuto(() => void syncNow({ keepalive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    // Back after a while: pick up changes made on other devices.
    else if (Date.now() - state.lastSyncAt > REFRESH_AFTER_MS && validToken()) whenAuto(() => void syncNow());
  });
  window.addEventListener('pagehide', flush);
  if (s.driveConnected && s.driveAutoSync && validToken()) void syncNow();
}

/** Called after onboarding/connect so the status reflects the new connection. */
export function markConnected() {
  if (state.status === 'off') set({ status: 'idle' });
}
