import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/api/http';
import { getWatchProviders } from '../src/api/tmdb';
import { db } from '../src/db';
import { setUserNotes } from '../src/db/items';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings } from '../src/db/settings';
import { checkMany, checkStreaming, migrateStreamSeen, onLibraryStreamingChanged, pruneStreaming, recordStreaming, resetStreamingQueue } from '../src/db/streaming';
import { applyView } from '../src/lib/listView';
import { clampBytes, cleanNotes, cleanWatchLink, linkHost } from '../src/lib/notes';
import { availabilityFrom } from '../src/lib/providers';
import { badgeServices, isNewRow, matchesStream, needsCheck, nextRow, streamCounts, type StreamingRow } from '../src/lib/streaming';
import type { UserItem } from '../src/lib/types';
import { mergePayloads, type SyncPayload } from '../src/sync/merge';

let carriers: Record<number, string[]> = {};
let failNext: Error | null = null;

vi.mock('../src/api/tmdb', async (original) => ({
  ...(await original<typeof import('../src/api/tmdb')>()),
  getWatchProviders: vi.fn(async (_type: string, id: number) => {
    if (failNext) throw failNext;
    return { IN: { flatrate: (carriers[id] ?? []).map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: `/${p}.png` })) } };
  }),
}));

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 1);
const item = (id: number, lists = ['watchlist'], extra: Partial<UserItem> = {}): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [], lists, addedAt: 0, updatedAt: id, ...extra });
const row = (key: string, keys: string[], at = T, first = at): StreamingRow => ({ key, services: keys.map((k) => ({ key: k, since: at })), firstCheckedAt: first, checkedAt: at, updatedAt: at });
const avail = (names: string[]) => availabilityFrom({ flatrate: names.map((n, i) => ({ provider_id: i, provider_name: n, logo_path: `/${n}.png` })) });

describe('streaming rows (pure)', () => {
  it('orders services, drops unknown ones, and keeps when each was first seen', () => {
    const a = nextRow(undefined, 'movie:1', [{ key: 'prime' }, { key: 'netflix', logo: '/n.png' }, { key: 'nope' }], T);
    expect(a.services).toEqual([
      { key: 'netflix', logo: '/n.png', since: T },
      { key: 'prime', since: T },
    ]);
    const b = nextRow(a, 'movie:1', [{ key: 'netflix' }, { key: 'zee5' }], T + DAY);
    expect(b.services).toEqual([
      { key: 'netflix', logo: '/n.png', since: T },
      { key: 'zee5', since: T + DAY },
    ]);
    expect(b).toMatchObject({ firstCheckedAt: T, checkedAt: T + DAY, updatedAt: T + DAY });
  });

  it('decides when to check: library titles keep their first answer, browse titles expire after 2 days', () => {
    const r = row('movie:1', ['netflix'], T);
    expect(needsCheck(undefined, true, T)).toBe(true);
    expect(needsCheck(r, true, T + 30 * DAY)).toBe(false);
    expect(needsCheck(r, false, T + DAY)).toBe(false);
    expect(needsCheck(r, false, T + 3 * DAY)).toBe(true);
    expect(needsCheck(r, true, T + 3 * DAY, 2 * DAY)).toBe(true);
  });

  it('shows my services first on the badge, others only when none of mine', () => {
    const mine = ['netflix', 'prime'];
    expect(badgeServices(row('k', ['netflix', 'prime', 'jiohotstar']), mine)).toMatchObject({ shown: [{ key: 'netflix' }, { key: 'prime' }], more: 0 });
    expect(badgeServices(row('k', ['zee5', 'sonyliv', 'aha']), mine)).toMatchObject({ shown: [{ key: 'zee5' }, { key: 'sonyliv' }], more: 1 });
    expect(badgeServices(row('k', []), mine).shown).toEqual([]);
  });

  it('marks an arrival on one of my services as new for a week', () => {
    const r: StreamingRow = { ...row('k', ['netflix'], T), services: [{ key: 'netflix', since: T + DAY }] };
    expect(isNewRow(r, ['netflix'], T + 2 * DAY)).toBe(true);
    expect(isNewRow(r, ['prime'], T + 2 * DAY)).toBe(false);
    expect(isNewRow(r, ['netflix'], T + 9 * DAY)).toBe(false);
    expect(isNewRow(row('k', ['netflix']), ['netflix'], T)).toBe(false); // there at the first check
  });

  it('filters and counts a list by where it streams', () => {
    const items = [item(1), item(2), item(3), item(4), item(-9)];
    const rows = new Map([
      ['movie:1', row('movie:1', ['netflix'])],
      ['movie:2', row('movie:2', ['zee5'])],
      ['movie:3', row('movie:3', [])],
    ]);
    const mine = ['netflix', 'prime'];
    expect(matchesStream(rows.get('movie:2'), 'mine', mine)).toBe(false);
    expect(matchesStream(undefined, 'none', mine)).toBeUndefined();
    expect(streamCounts(items, rows, mine)).toEqual({ mine: 1, none: 1, byService: { netflix: 1, zee5: 1 }, unknown: 1, custom: 1 });
    const view = (service: string) => applyView(items, { type: 'all', sort: 'title', service }, '', { rows, mine }).map((i) => i.tmdbId);
    expect(view('mine')).toEqual([1]);
    expect(view('zee5')).toEqual([2]);
    expect(view('none')).toEqual([3]); // unchecked and custom titles aren't counted as "not streaming"
  });

  it('finds titles by your notes', () => {
    const items = [item(1, ['watchlist'], { notes: 'Amma recommended' }), item(2)];
    expect(applyView(items, { type: 'all', sort: 'added' }, 'amma').map((i) => i.tmdbId)).toEqual([1]);
  });
});

describe('streaming store and checker', () => {
  beforeEach(async () => {
    vi.mocked(getWatchProviders).mockClear();
    failNext = null;
    resetStreamingQueue();
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings({ ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32) });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());

  it('checks a title once and reuses the saved answer for library titles', async () => {
    carriers = { 1: ['Netflix'] };
    await db.items.put(item(1));
    expect((await checkStreaming({ type: 'movie', tmdbId: 1 }))?.services.map((s) => s.key)).toEqual(['netflix']);
    vi.setSystemTime(T + 40 * DAY);
    await checkStreaming({ type: 'movie', tmdbId: 1 });
    expect(getWatchProviders).toHaveBeenCalledTimes(1);
    // "Check again" goes to TMDB, skipping caches.
    await checkStreaming({ type: 'movie', tmdbId: 1 }, { fresh: true });
    expect(getWatchProviders).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getWatchProviders).mock.calls[1][2]).toEqual({ fresh: true });
  });

  it('re-checks titles outside the library after 2 days, and shares one request per title', async () => {
    carriers = { 2: ['Zee5'] };
    await Promise.all([checkStreaming({ type: 'movie', tmdbId: 2 }), checkStreaming({ type: 'movie', tmdbId: 2 })]);
    expect(getWatchProviders).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T + 3 * DAY);
    await checkStreaming({ type: 'movie', tmdbId: 2 });
    expect(getWatchProviders).toHaveBeenCalledTimes(2);
  });

  it('keeps saved info when TMDB fails, and never checks custom titles', async () => {
    carriers = { 3: ['Netflix'] };
    await db.items.put(item(3));
    const first = await checkStreaming({ type: 'movie', tmdbId: 3 });
    failNext = new HttpError(429, 'slow down');
    vi.setSystemTime(T + DAY);
    expect(await checkStreaming({ type: 'movie', tmdbId: 3 }, { fresh: true })).toEqual(first);
    expect(await checkStreaming({ type: 'movie', tmdbId: -4 })).toBeUndefined();
    expect(getWatchProviders).toHaveBeenCalledTimes(2);
  });

  it('refreshes many titles and counts the ones that changed', async () => {
    carriers = { 1: ['Netflix'], 2: ['Netflix'] };
    await db.items.bulkPut([item(1), item(2)]);
    await checkMany([item(1), item(2)]);
    carriers = { 1: ['Netflix'], 2: ['Amazon Prime Video'] };
    vi.setSystemTime(T + DAY);
    const progress: number[] = [];
    expect(await checkMany([item(1), item(2)], { fresh: true, onProgress: (d) => progress.push(d) })).toEqual({ changed: 1, failed: 0 });
    expect(progress).toEqual([0, 1, 2]);
    failNext = new HttpError(503, 'down');
    vi.setSystemTime(T + 2 * DAY);
    expect(await checkMany([item(1)], { fresh: true })).toEqual({ changed: 0, failed: 1 });
  });

  it('takes free data from a title page only when it changed, and tells sync only about library titles', async () => {
    const synced = vi.fn();
    const off = onLibraryStreamingChanged(synced);
    await db.items.put(item(5));
    const a = await recordStreaming('movie:5', avail(['Netflix']), { checked: false });
    vi.setSystemTime(T + DAY);
    const b = await recordStreaming('movie:5', avail(['Netflix']), { checked: false });
    expect(b.checkedAt).toBe(a.checkedAt);
    await recordStreaming('movie:6', avail(['Netflix']), { checked: false }); // not saved: stays local
    expect(synced).toHaveBeenCalledTimes(1);
    off();
  });

  it('prunes old rows for titles outside the library, and moves Home’s old record over', async () => {
    await db.items.put(item(1));
    await db.streaming.bulkPut([row('movie:1', ['netflix'], T - 60 * DAY), row('movie:2', ['netflix'], T - 60 * DAY), row('movie:3', ['netflix'], T)]);
    await pruneStreaming(T);
    expect((await db.streaming.toArray()).map((r) => r.key).sort()).toEqual(['movie:1', 'movie:3']);

    await db.kv.put({ key: 'streamSeen', value: { 'movie:7': { keys: ['prime'], newAt: T - DAY }, 'movie:1': { keys: [] } } });
    await migrateStreamSeen();
    expect(await db.kv.get('streamSeen')).toBeUndefined();
    const moved = await db.streaming.get('movie:7');
    expect(moved).toMatchObject({ checkedAt: 0, services: [{ key: 'prime', since: T - DAY }] });
    expect(isNewRow(moved, ['prime'], T)).toBe(true);
    expect((await db.streaming.get('movie:1'))?.services.map((s) => s.key)).toEqual(['netflix']); // existing rows win
  });
});

describe('streaming info in Drive sync', () => {
  const payload = (p: Partial<SyncPayload>): SyncPayload => ({ app: 'MovieMango', version: 1, savedAt: 0, items: [], lists: [], settings: {}, settingsUpdatedAt: 0, ...p });

  it('merges newest-wins and keeps only titles still in the library', () => {
    const local = payload({ items: [item(1), item(2, [], { updatedAt: 50 })], streaming: [row('movie:1', ['netflix'], 10), row('movie:2', ['zee5'], 10)] });
    const remote = payload({ items: [item(1)], streaming: [row('movie:1', ['prime'], 20)] });
    const m = mergePayloads(local, remote);
    expect(m.streaming?.map((r) => [r.key, r.services.map((s) => s.key)])).toEqual([['movie:1', ['prime']]]);
    // An older app version sends no streaming info: ours is kept.
    expect(mergePayloads(local, payload({ items: [item(1)] })).streaming?.map((r) => r.key)).toEqual(['movie:1']);
  });
});

describe('your link and notes', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('cleans links and caps notes at 1 KB without splitting a letter', () => {
    expect(cleanWatchLink('youtube.com/watch?v=1')).toBe('https://youtube.com/watch?v=1');
    expect(cleanWatchLink('javascript:alert(1)')).toBeUndefined();
    expect(cleanWatchLink(`https://e.com/${'a'.repeat(2100)}`)).toBeUndefined();
    expect(linkHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(clampBytes('அஆ', 5)).toBe('அ');
    expect(cleanNotes('  hi\r\nthere  ')).toBe('hi\nthere');
    expect(cleanNotes('   ')).toBeUndefined();
  });

  it('saves them, adding an unsaved title to the Watchlist so they are kept', async () => {
    const snap = { type: 'movie' as const, tmdbId: 11, title: 'T11', genreIds: [] };
    const { item: a, added } = await setUserNotes(snap, { notes: 'Watch with Amma', watchLink: 'youtube.com/x' });
    expect(added).toBe(true);
    expect(a).toMatchObject({ lists: ['watchlist'], notes: 'Watch with Amma', watchLink: 'https://youtube.com/x' });
    const { item: b, added: again } = await setUserNotes(snap, { watchLink: '' });
    expect(again).toBe(false);
    expect(b.watchLink).toBeUndefined();
    expect(b.notes).toBe('Watch with Amma');
  });
});
