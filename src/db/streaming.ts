import { getWatchProviders } from '../api/tmdb';
import { isOffline, isTransientError } from '../api/http';
import { availabilityFrom, type Availability } from '../lib/providers';
import { needsCheck, nextRow, sameServices, STREAMING_FRESH_MS, type FoundService, type StreamingRow } from '../lib/streaming';
import { isCustom, isSaved, itemKey, type TitleSnapshot } from '../lib/types';
import { db } from './index';
import { getSettings } from './settings';

/**
 * The one place that asks TMDB where a title streams, and the store of the answers.
 * Library titles keep their first answer until the user taps "check again" (or Home's watchlist row
 * re-checks, or a title page brings fresh data). Browse titles are re-checked after 2 days.
 * All checks share one queue: 3 at a time, a short gap between starts, and a pause after 429/5xx.
 */

const savedListeners = new Set<() => void>();
/** Called when info for a title in the library changed (Drive sync listens). */
export function onLibraryStreamingChanged(fn: () => void) {
  savedListeners.add(fn);
  return () => savedListeners.delete(fn);
}

const found = (list: Availability[]): FoundService[] => list.map((a) => ({ key: a.service.key, logo: a.logoPath || undefined }));

async function savedKey(key: string) {
  return isSaved(await db.items.get(key).catch(() => undefined));
}

/**
 * Saves what a check (or a title page) found. `checked: false` means free data from elsewhere: it's
 * written only when the services changed or nothing was saved yet, so viewing a title doesn't re-sync it.
 */
export async function recordStreaming(key: string, availability: Availability[], opts: { checked: boolean; now?: number }): Promise<StreamingRow> {
  const now = opts.now ?? Date.now();
  const list = found(availability);
  const prev = await db.streaming.get(key).catch(() => undefined);
  if (!opts.checked && prev && sameServices(prev, list)) return prev;
  const row = nextRow(prev, key, list, now);
  await db.streaming.put(row).catch(() => undefined);
  if (await savedKey(key)) savedListeners.forEach((fn) => fn());
  return row;
}

// ---------------------------------------------------------------- queue

const MAX_ACTIVE = 3;
let gapMs = import.meta.env.MODE === 'test' ? 0 : 200;
let pauseMs = 30_000;
/** Tests only: no pacing. */
export function setStreamingQueueTiming(t: { gapMs?: number; pauseMs?: number }) {
  gapMs = t.gapMs ?? gapMs;
  pauseMs = t.pauseMs ?? pauseMs;
}

interface Job {
  run: () => Promise<void>;
  signal?: AbortSignal;
}
const waiting: Job[] = [];
let active = 0;
let lastStart = 0;
let pausedUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const inflight = new Map<string, Promise<StreamingRow | undefined>>();

function pump() {
  while (active < MAX_ACTIVE && waiting.length) {
    const now = Date.now();
    const wait = Math.max(lastStart + gapMs, pausedUntil) - now;
    if (wait > 0) {
      if (!timer) timer = setTimeout(() => ((timer = undefined), pump()), wait);
      return;
    }
    const job = waiting.shift()!;
    active++;
    lastStart = now;
    void job.run().finally(() => {
      active--;
      pump();
    });
  }
}

export class CheckSkipped extends Error {}

/**
 * Where a title streams: saved info when it's good enough, otherwise one queued TMDB check.
 * `fresh` skips every cache (the refresh button); `maxAgeMs` re-checks rows older than that (Home);
 * an aborted `signal` drops the check if it hasn't started (posters scrolled away).
 * Resolves undefined for custom titles, or when the check failed and nothing was saved.
 */
export async function checkStreaming(snap: Pick<TitleSnapshot, 'type' | 'tmdbId'>, opts: { fresh?: boolean; maxAgeMs?: number; signal?: AbortSignal } = {}): Promise<StreamingRow | undefined> {
  if (isCustom(snap)) return undefined;
  const key = itemKey(snap.type, snap.tmdbId);
  const prev = await db.streaming.get(key).catch(() => undefined);
  if (!opts.fresh && !needsCheck(prev, await savedKey(key), Date.now(), opts.maxAgeMs)) return prev;
  if (isOffline() || opts.signal?.aborted) return prev;
  const running = inflight.get(key);
  if (running) return running;
  const p = new Promise<StreamingRow | undefined>((resolve) => {
    const job: Job = {
      signal: opts.signal,
      run: async () => {
        try {
          const { region } = await getSettings();
          const results = await getWatchProviders(snap.type, snap.tmdbId, { fresh: opts.fresh });
          resolve(await recordStreaming(key, availabilityFrom(results[region]), { checked: true }));
        } catch (e) {
          if (isTransientError(e)) pausedUntil = Date.now() + pauseMs;
          resolve(prev);
        }
      },
    };
    waiting.push(job);
    opts.signal?.addEventListener('abort', () => {
      const i = waiting.indexOf(job);
      if (i >= 0) {
        waiting.splice(i, 1);
        resolve(prev);
      }
    });
    pump();
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Checks many titles through the queue, reporting progress. Returns how many changed services. */
export async function checkMany(snaps: Pick<TitleSnapshot, 'type' | 'tmdbId'>[], opts: { fresh?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<{ changed: number; failed: number }> {
  let done = 0;
  let changed = 0;
  let failed = 0;
  const total = snaps.length;
  opts.onProgress?.(0, total);
  await Promise.all(
    snaps.map(async (s) => {
      const key = itemKey(s.type, s.tmdbId);
      const before = await db.streaming.get(key).catch(() => undefined);
      const after = await checkStreaming(s, { fresh: opts.fresh });
      // A fresh check that worked always has a new checkedAt; a failed one hands back the old row.
      const ok = !!after && (!opts.fresh || !before || after.checkedAt !== before.checkedAt);
      if (!ok) failed++;
      else if (before && !sameServices(before, after!.services)) changed++;
      opts.onProgress?.(++done, total);
    }),
  );
  return { changed, failed };
}

/**
 * Housekeeping: rows for titles not in the library that are old enough to be re-checked anyway.
 * Library rows are kept (they sync); they're dropped from Drive when the title leaves the library.
 */
export async function pruneStreaming(now = Date.now()) {
  const old = await db.streaming.where('checkedAt').below(now - 15 * STREAMING_FRESH_MS).toArray();
  if (!old.length) return;
  const items = await db.items.bulkGet(old.map((r) => r.key));
  await db.streaming.bulkDelete(old.filter((_, i) => !isSaved(items[i])).map((r) => r.key));
}

/** Tests only. */
export function resetStreamingQueue() {
  waiting.length = 0;
  inflight.clear();
  active = 0;
  lastStart = 0;
  pausedUntil = 0;
  clearTimeout(timer);
  timer = undefined;
}

/**
 * One-time move of Home's old per-device record (kv 'streamSeen': { keys, newAt } per title) into the
 * streaming table. checkedAt 0 makes Home check those titles again; a recent arrival stays "New".
 */
export async function migrateStreamSeen() {
  const old = (await db.kv.get('streamSeen').catch(() => undefined))?.value as Record<string, { keys: string[]; newAt?: number }> | undefined;
  if (!old) return;
  const have = new Set(await db.streaming.toCollection().primaryKeys());
  const rows: StreamingRow[] = Object.entries(old)
    .filter(([key]) => !have.has(key))
    .map(([key, s]) => ({ key, services: s.keys.map((k) => ({ key: k, since: s.newAt ?? 0 })), firstCheckedAt: 0, checkedAt: 0, updatedAt: 0 }));
  await db.streaming.bulkPut(rows);
  await db.kv.delete('streamSeen');
}
