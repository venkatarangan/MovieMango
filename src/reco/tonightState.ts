import { useEffect, useSyncExternalStore } from 'react';
import { db, onCacheReset } from '../db';
import type { Settings } from '../db/settings';
import { serviceByKey, type Availability } from '../lib/providers';
import { itemKey, type UserItem } from '../lib/types';
import { defaultMinutes } from './moods';
import { planTonight, type Pick, type TonightInput, type TonightResult } from './tonight';

/**
 * Tonight's choices and its last run, shared by the Tonight page and Home's "Feeling lucky". One
 * copy lives in memory (so coming back to a page is instant, never empty) and one in IndexedDB
 * (so it survives a reload or a closed tab). Both pages read the same run, so sorting a pick on
 * one shows on the other. It is never synced to Drive.
 */

const KEY = 'tonight';
/** Choices and picks are dropped after this long without use, so a new evening starts fresh. */
export const STATE_TTL_MS = 6 * 3600_000;
/** Runs nobody asked for (opening Home or Tonight) are lighter: fewer titles looked at, fewer kept. */
const AUTO_RUN = { enrich: 16, total: 12 };

export interface StoredRun {
  result: TonightResult;
  /** Picks acted on in Tonight (`movie:123`). Home also hides what the library says is done. */
  hidden: string[];
  at: number;
  /** `user`: they pressed Find. `auto`: made on opening Home or Tonight, without AI. */
  by: 'user' | 'auto';
  /** Which AI chose the picks, for the header. */
  engineLabel?: string;
  /** Settings the run was made for; a run for other services or languages is not shown. */
  sig: string;
}

export interface TonightState {
  input: TonightInput;
  run?: StoredRun;
  updatedAt: number;
}

interface Snapshot {
  loaded: boolean;
  state: TonightState;
  /** An automatic run is in progress. */
  busy: boolean;
  error?: unknown;
}

export const freshInput = (): TonightInput => ({ minutes: defaultMinutes(), discovery: 'new', audience: 'solo', type: 'either' });
const freshState = (): TonightState => ({ input: freshInput(), updatedAt: Date.now() });

export const pickKey = (p: Pick) => itemKey(p.snap.type, p.snap.tmdbId);

/** What makes a run's picks specific to the person: change any and the old picks no longer fit. */
export const settingsSig = (s: Settings) => JSON.stringify([s.region, [...s.services].sort(), [...s.languages].sort(), s.showAllRatings]);

/** A service has a function (its search link), which IndexedDB can't store: keep its key and look it up on load. */
type StoredPick = Omit<Pick, 'availability'> & { availability: (Omit<Availability, 'service'> & { service: string })[] };
type StoredState = Omit<TonightState, 'run'> & { run?: Omit<StoredRun, 'result'> & { result: Omit<TonightResult, 'picks'> & { picks: StoredPick[] } } };

export function packState(state: TonightState): StoredState {
  const { run, ...rest } = state;
  if (!run) return rest;
  const picks = run.result.picks.map((p) => ({ ...p, availability: p.availability.map((a) => ({ ...a, service: a.service.key })) }));
  return { ...rest, run: { ...run, result: { ...run.result, picks } } };
}

export function unpackState(saved: StoredState): TonightState {
  const { run, ...rest } = saved;
  if (!run) return rest;
  const picks = run.result.picks.map((p) => ({
    ...p,
    availability: p.availability.flatMap((a) => {
      const service = serviceByKey(a.service);
      return service ? [{ ...a, service }] : [];
    }),
  }));
  return { ...rest, run: { ...run, result: { ...run.result, picks } } };
}

let snap: Snapshot = { loaded: false, state: freshState(), busy: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;
/** The signature an automatic run last failed for, so a failing network doesn't retry in a loop. */
let failedSig: string | undefined;

function set(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn());
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;
function persistSoon() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flushTonightState, 300);
}

/** Writes the state now (the page is about to go away, or a run just finished). */
export function flushTonightState() {
  clearTimeout(writeTimer);
  if (!snap.loaded) return;
  void db.kv.put({ key: KEY, value: packState(snap.state) }).catch((e) => import.meta.env.DEV && console.warn('Could not save Tonight state', e));
}

function change(next: TonightState) {
  set({ state: { ...next, updatedAt: Date.now() } });
  persistSoon();
}

/** Reads the saved state once. Safe to call from anywhere, any number of times. */
export function loadTonightState(): Promise<void> {
  if (snap.loaded) return Promise.resolve();
  loading ??= (async () => {
    let state = freshState();
    try {
      const saved = (await db.kv.get(KEY))?.value as StoredState | undefined;
      if (saved?.input && Date.now() - saved.updatedAt < STATE_TTL_MS) {
        const restored = unpackState(saved);
        state = { ...restored, input: { ...freshInput(), ...restored.input } };
      }
    } catch {
      /* storage unavailable: start fresh */
    }
    set({ loaded: true, state });
  })();
  return loading;
}

// Leaving the page (or switching away on a phone) saves the latest state straight away.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushTonightState);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushTonightState());
}

// A new database connection (tests) or "Clear cache" forgets the memory copy; the next read reloads it.
onCacheReset(() => {
  clearTimeout(writeTimer);
  loading = undefined;
  failedSig = undefined;
  snap = { loaded: false, state: freshState(), busy: false };
  listeners.forEach((fn) => fn());
});

/** The run, if it is still fresh and was made for the person's current services and languages. */
export function validRun(state: TonightState, settings: Settings, now = Date.now()): StoredRun | undefined {
  const run = state.run;
  return run && now - run.at < STATE_TTL_MS && run.sig === settingsSig(settings) ? run : undefined;
}

/**
 * Keys of picks to leave out: acted on in Tonight, or done in the library since (watched, 👍, ❤️,
 * 👎, or newly saved to the watchlist). A pick that was on the watchlist already stays until acted on.
 */
export function hiddenKeys(run: StoredRun, items: UserItem[]): Set<string> {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const hidden = new Set(run.hidden);
  for (const p of run.result.picks) {
    const item = byKey.get(pickKey(p));
    if (item && (item.lists.includes('watched') || item.rating === 'dislike' || (item.lists.includes('watchlist') && !p.onWatchlist))) hidden.add(pickKey(p));
  }
  return hidden;
}

/** The picks still to act on, best first. */
export function openPicks(run: StoredRun, items: UserItem[]): Pick[] {
  const hidden = hiddenKeys(run, items);
  return run.result.picks.filter((p) => !hidden.has(pickKey(p)));
}

export function setTonightInput(input: TonightInput) {
  change({ ...snap.state, input });
}

export function setTonightRun(run: StoredRun) {
  failedSig = undefined;
  change({ ...snap.state, run });
  flushTonightState();
}

/** Hides a pick that was acted on, or brings it back (Undo). */
export function setPickHidden(key: string, on: boolean) {
  const run = snap.state.run;
  if (!run) return;
  const hidden = on ? [...new Set([...run.hidden, key])] : run.hidden.filter((k) => k !== key);
  change({ ...snap.state, run: { ...run, hidden } });
}

/**
 * Makes sure there is a fresh run: if not, builds one without AI from the saved choices, with the
 * same pipeline (and TMDB cache) as the Tonight button. Does nothing if one exists or is on its way.
 */
let autoRun: Promise<void> | undefined;
export function ensureTonightRun(settings: Settings): Promise<void> {
  const sig = settingsSig(settings);
  if (autoRun || !snap.loaded || validRun(snap.state, settings) || failedSig === sig || !settings.tmdbToken) return autoRun ?? Promise.resolve();
  set({ busy: true, error: undefined });
  autoRun = (async () => {
    try {
      const input = snap.state.input;
      const result = await planTonight(input, settings, await db.items.toArray(), null, undefined, AUTO_RUN);
      // Someone pressed Find while this ran: theirs wins.
      if (validRun(snap.state, settings)) return;
      setTonightRun({ result, hidden: [], at: Date.now(), by: 'auto', sig });
    } catch (error) {
      failedSig = sig;
      set({ error });
    } finally {
      autoRun = undefined;
      set({ busy: false });
    }
  })();
  return autoRun;
}

/** Forget a failed attempt so the next visit tries again. */
export function retryTonightRun() {
  failedSig = undefined;
  set({ error: undefined });
}

/** The current state, outside React. */
export const getTonightState = () => snap.state;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Live Tonight state. Loads it on first use; `loaded` is false until then. */
export function useTonightState(): Snapshot {
  const s = useSyncExternalStore(subscribe, () => snap);
  useEffect(() => {
    if (!s.loaded) void loadTonightState();
  }, [s.loaded]);
  return s;
}
