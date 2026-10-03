import { db, onCacheReset, type TitleRow } from '../db';
import { DAY } from './http';

/**
 * Recent-titles store: full TMDB details for the last RECENT_MAX titles viewed or fetched, LRU by last access.
 * Lives in its own Dexie table so the general cache prune never evicts it. A session Map sits in front of it.
 */
export const RECENT_MAX = 100;
/** Watch-provider availability older than this is refreshed in the background (the old copy is served meanwhile). */
export const PROVIDERS_FRESH_MS = 2 * DAY;
/** Core metadata (title, credits, genres, poster…) is served this long before a full refetch. */
export const CORE_FRESH_MS = 30 * DAY;
/** …or this long for titles that still change: running TV shows, unreleased or recent movies. */
export const ACTIVE_CORE_FRESH_MS = 7 * DAY;
/** Don't rewrite `accessedAt` more often than this per title. */
const TOUCH_EVERY_MS = 60_000;

const ACTIVE_TV = new Set(['Returning Series', 'In Production', 'Planned', 'Pilot']);

/** How long a details response's core metadata stays fresh. */
export function coreFreshMs(data: unknown, now = Date.now()): number {
  const d = data as { status?: string; release_date?: string; first_air_date?: string; name?: string; title?: string };
  if (d.status && ACTIVE_TV.has(d.status)) return ACTIVE_CORE_FRESH_MS;
  if (d.release_date !== undefined || d.title !== undefined) {
    if (d.status && d.status !== 'Released') return ACTIVE_CORE_FRESH_MS;
    const released = d.release_date ? Date.parse(d.release_date) : NaN;
    if (!Number.isNaN(released) && now - released < 120 * DAY) return ACTIVE_CORE_FRESH_MS;
  }
  return CORE_FRESH_MS;
}

const memory = new Map<string, TitleRow>();
onCacheReset(() => memory.clear());

function keep(row: TitleRow) {
  memory.delete(row.key);
  memory.set(row.key, row);
  if (memory.size > RECENT_MAX * 2) memory.delete(memory.keys().next().value!);
}

/** Reads a stored title (memory first). Doesn't count as an access; see `touchRecent`. */
export async function readRecent(key: string): Promise<TitleRow | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  const row = await db.titles.get(key).catch(() => undefined);
  if (row) keep(row);
  return row;
}

/** Marks a title as just used, for LRU. Cheap: writes at most once a minute per title. */
export function touchRecent(row: TitleRow, now = Date.now()) {
  if (now - row.accessedAt < TOUCH_EVERY_MS) return;
  const next = { ...row, accessedAt: now };
  keep(next);
  void db.titles.update(row.key, { accessedAt: now }).catch(() => undefined);
}

let trimming: Promise<void> = Promise.resolve();
async function trim() {
  const count = await db.titles.count();
  if (count <= RECENT_MAX) return;
  const old = await db.titles.orderBy('accessedAt').limit(count - RECENT_MAX).primaryKeys();
  await db.titles.bulkDelete(old);
  for (const k of old) memory.delete(k);
}

/** Stores or replaces a title, then evicts the least recently used beyond RECENT_MAX. */
export async function saveRecent(row: TitleRow) {
  keep(row);
  await db.titles.put(row).catch(() => undefined);
  trimming = trimming.then(trim).catch(() => undefined); // serialised, so concurrent saves can't overshoot the cap
  await trimming;
}
