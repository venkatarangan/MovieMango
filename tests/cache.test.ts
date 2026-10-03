import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, pruneCache } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings } from '../src/db/settings';
import { cached, clearMemoryCache, DAY, HttpError } from '../src/api/http';
import { RECENT_MAX, readRecent, saveRecent } from '../src/api/recent';
import { discover, getDetails, getRecommendations, getWatchProviders, seasonTtl, tmdbCacheKey } from '../src/api/tmdb';

const realNow = Date.now.bind(Date);
let offset = 0;
const later = (ms: number) => (offset += ms);
const flush = () => new Promise((r) => setTimeout(r, 50));

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
let mode: 'ok' | 'down' | '429' = 'ok';
let providerName = 'Netflix';
const urls: string[] = [];
function fakeTmdb(url: string): Response {
  urls.push(url);
  if (mode === 'down') throw new TypeError('Failed to fetch');
  if (mode === '429') return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
  const p = new URL(url).pathname.replace('/3', '');
  const providers = { results: { IN: { flatrate: [{ provider_id: 8, provider_name: providerName, logo_path: '' }] } } };
  if (p.endsWith('/watch/providers')) return json({ id: 1, ...providers });
  if (p.startsWith('/discover/') || p.endsWith('/recommendations')) return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
  const m = p.match(/^\/(movie|tv)\/(\d+)$/);
  if (m)
    return json({
      id: Number(m[2]),
      title: `T${m[2]}`,
      release_date: '2015-01-01',
      status: 'Released',
      genres: [],
      'watch/providers': providers,
      recommendations: { page: 1, total_pages: 1, total_results: 1, results: [{ id: 7, title: 'Rec' }] },
    });
  return new Response('nope', { status: 404 });
}
const calls = (part: string) => urls.filter((u) => new URL(u).pathname.endsWith(part)).length;

beforeEach(async () => {
  offset = 0;
  mode = 'ok';
  providerName = 'Netflix';
  urls.length = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeTmdb(url)));
  await db.delete();
  await db.open(); // also clears the session memory layer
  resetSettingsCache();
  await saveSettings({ ...DEFAULT_SETTINGS, tmdbToken: 'x'.repeat(32) });
});
afterEach(() => vi.restoreAllMocks());

describe('cached(): session memory, stale fallback, SWR', () => {
  it('serves repeat reads from memory without touching IndexedDB or the network', async () => {
    const load = vi.fn(async () => 'v1');
    expect(await cached('k', DAY, load)).toBe('v1');
    const get = vi.spyOn(db.cache, 'get');
    expect(await cached('k', DAY, load)).toBe('v1');
    expect(get).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    // After a reload (memory gone) the IndexedDB row is used, still without the network.
    clearMemoryCache();
    expect(await cached('k', DAY, load)).toBe('v1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one load between concurrent callers', async () => {
    const load = vi.fn(async () => 'v');
    await Promise.all([cached('c', DAY, load), cached('c', DAY, load), cached('c', DAY, load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns the stale value when the refresh is rate-limited or the network is down, then cools down', async () => {
    await cached('s', DAY, async () => 'old');
    later(2 * DAY);
    const limited = vi.fn(async () => {
      throw new HttpError(429, 'Too many requests');
    });
    expect(await cached('s', DAY, limited)).toBe('old');
    expect(await cached('s', DAY, limited)).toBe('old'); // within the cool-down: no second attempt
    expect(limited).toHaveBeenCalledTimes(1);
    later(10 * 60_000);
    clearMemoryCache();
    expect(await cached('s', DAY, async () => Promise.reject(new TypeError('Failed to fetch')))).toBe('old');
  });

  it('still throws real errors (404, auth) and errors with no cached copy', async () => {
    await cached('e', DAY, async () => 'old');
    later(2 * DAY);
    await expect(cached('e', DAY, async () => Promise.reject(new HttpError(404, 'gone')))).rejects.toThrow('gone');
    await expect(cached('none', DAY, async () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toThrow();
  });

  it('serves stale data offline without trying the network', async () => {
    await cached('o', DAY, async () => 'old');
    later(2 * DAY);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const load = vi.fn(async () => 'new');
    expect(await cached('o', DAY, load)).toBe('old');
    expect(load).not.toHaveBeenCalled();
  });

  it('stale-while-revalidate: returns the old value at once and refreshes in the background', async () => {
    await cached('w', DAY, async () => 'old', { swrMs: 3 * DAY });
    later(2 * DAY);
    const load = vi.fn(async () => 'new');
    expect(await cached('w', DAY, load, { swrMs: 3 * DAY })).toBe('old');
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cached('w', DAY, load, { swrMs: 3 * DAY })).toBe('new');
    expect((await db.cache.get('w'))?.value).toBe('new');
    // Beyond the SWR window the refresh blocks.
    later(10 * DAY);
    expect(await cached('w', DAY, async () => 'newest', { swrMs: 3 * DAY })).toBe('newest');
  });

  it('pruneCache keeps recently expired rows for fallback and never touches recent titles', async () => {
    await db.cache.bulkPut([
      { key: 'fresh', value: 1, expires: Date.now() + DAY },
      { key: 'stale', value: 2, expires: Date.now() - 2 * DAY },
      { key: 'ancient', value: 3, expires: Date.now() - 40 * DAY },
    ]);
    await saveRecent({ key: 'movie:1', data: {}, fetchedAt: 0, providersAt: 0, accessedAt: 0 });
    await pruneCache();
    expect((await db.cache.toCollection().primaryKeys()).sort()).toEqual(['fresh', 'stale']);
    expect(await db.titles.count()).toBe(1);
  });

  it('Settings → Clear cache also empties memory and the recent titles', async () => {
    await cached('m', DAY, async () => 'v');
    await getDetails('movie', 1);
    await db.cache.clear();
    await flush();
    expect(await db.titles.count()).toBe(0);
    const load = vi.fn(async () => 'v2');
    expect(await cached('m', DAY, load)).toBe('v2');
  });
});

describe('TMDB cache keys', () => {
  it('ignore param order, empty values and id-list order', () => {
    const a = tmdbCacheKey('/discover/movie', { with_original_language: 'ta|hi', page: 1, sort_by: 'popularity.desc', without_genres: undefined });
    const b = tmdbCacheKey('/discover/movie', { sort_by: 'popularity.desc', page: '1', with_original_language: 'hi|ta', without_genres: '' });
    expect(a).toBe(b);
    expect(tmdbCacheKey('/search/multi', { query: 'b,a' })).not.toBe(tmdbCacheKey('/search/multi', { query: 'a,b' }));
  });

  it('equivalent discover calls share one request', async () => {
    await discover('movie', { with_watch_providers: '8|119', with_original_language: 'ta|hi' });
    await discover('movie', { with_original_language: 'hi|ta', with_watch_providers: '119|8' });
    expect(calls('/discover/movie')).toBe(1);
  });
});

describe('recent titles store', () => {
  it(`keeps at most ${RECENT_MAX} titles, evicting the least recently used`, async () => {
    for (let i = 0; i < RECENT_MAX + 5; i++) await saveRecent({ key: `movie:${i}`, data: { id: i }, fetchedAt: 0, providersAt: 0, accessedAt: 1000 + i });
    expect(await db.titles.count()).toBe(RECENT_MAX);
    for (let i = 0; i < 5; i++) expect(await db.titles.get(`movie:${i}`)).toBeUndefined();
    expect(await db.titles.get(`movie:${RECENT_MAX + 4}`)).toBeDefined();
  });

  it('getDetails reads from the store across reloads, touching it for LRU', async () => {
    await getDetails('movie', 5);
    const before = (await db.titles.get('movie:5'))!.accessedAt;
    db.close();
    await db.open(); // simulate a reload: memory gone, IndexedDB kept
    later(5 * 60_000);
    const d = await getDetails('movie', 5);
    expect(d.title).toBe('T5');
    expect(calls('/movie/5')).toBe(1);
    await flush();
    expect((await db.titles.get('movie:5'))!.accessedAt).toBeGreaterThan(before);
  });

  it('refreshes stale watch providers in the background (SWR), not the whole title', async () => {
    await getDetails('movie', 9);
    later(3 * DAY);
    providerName = 'Amazon Prime Video';
    const d = await getDetails('movie', 9);
    expect(d['watch/providers']?.results.IN.flatrate?.[0].provider_name).toBe('Netflix'); // old copy served at once
    await flush();
    expect(calls('/movie/9')).toBe(1);
    expect(calls('/movie/9/watch/providers')).toBe(1);
    const again = await getDetails('movie', 9);
    expect(again['watch/providers']?.results.IN.flatrate?.[0].provider_name).toBe('Amazon Prime Video');
    expect(calls('/movie/9/watch/providers')).toBe(1);
  });

  it('refetches core details after 30 days, falling back to the old copy when TMDB is down', async () => {
    await getDetails('movie', 3);
    later(31 * DAY);
    mode = 'down';
    expect((await getDetails('movie', 3)).title).toBe('T3');
    mode = 'ok';
    later(10 * 60_000);
    await getDetails('movie', 3);
    expect(calls('/movie/3')).toBe(3); // first fetch, failed attempt, refetch
  });

  it('falls back to stored details on 429', { timeout: 20_000 }, async () => {
    await getDetails('movie', 4);
    later(31 * DAY);
    mode = '429';
    expect((await getDetails('movie', 4)).title).toBe('T4');
  });

  it('getRecommendations page 1 comes from stored details', async () => {
    await getDetails('movie', 6);
    const recs = await getRecommendations('movie', 6);
    expect(recs.results[0].title).toBe('Rec');
    expect(calls('/recommendations')).toBe(0);
    await getRecommendations('movie', 99);
    expect(calls('/recommendations')).toBe(1);
  });

  it('getWatchProviders uses the store when fresh and one small request otherwise', async () => {
    await getDetails('movie', 8);
    expect((await getWatchProviders('movie', 8)).IN.flatrate?.[0].provider_name).toBe('Netflix');
    expect(calls('/watch/providers')).toBe(0);
    await getWatchProviders('movie', 77); // not in the store
    await getWatchProviders('movie', 77);
    expect(calls('/movie/77/watch/providers')).toBe(1);
    later(3 * DAY);
    providerName = 'JioHotstar';
    expect((await getWatchProviders('movie', 8)).IN.flatrate?.[0].provider_name).toBe('JioHotstar');
    expect(((await readRecent('movie:8'))!.data as { 'watch/providers': { results: { IN: { flatrate: { provider_name: string }[] } } } })['watch/providers'].results.IN.flatrate[0].provider_name).toBe('JioHotstar');
  });

  it('keeps finished TV seasons longer than airing ones', () => {
    const now = Date.parse('2026-10-01');
    expect(seasonTtl({ episodes: [{ episode_number: 1, name: 'a', air_date: '2024-01-01' }] }, now)).toBe(30 * DAY);
    expect(seasonTtl({ episodes: [{ episode_number: 1, name: 'a', air_date: '2026-09-25' }] }, now)).toBe(DAY);
    expect(seasonTtl({ episodes: [{ episode_number: 1, name: 'a' }] }, now)).toBe(DAY);
  });
});

describe('schema upgrade', () => {
  it('v1 databases open as v2 with their data intact', async () => {
    db.close();
    await Dexie.delete('moviemango');
    const v1 = new Dexie('moviemango');
    v1.version(1).stores({ items: 'key, type, updatedAt', lists: 'id, updatedAt', kv: 'key', cache: 'key, expires' });
    await v1.table('items').put({ key: 'movie:1', title: 'Kept', type: 'movie', updatedAt: 1 });
    await v1.table('cache').put({ key: 'c', value: 1, expires: Date.now() + DAY });
    v1.close();
    await db.open();
    expect(db.verno).toBe(2);
    expect((await db.items.get('movie:1'))?.title).toBe('Kept');
    expect(await db.cache.count()).toBe(1);
    expect(await db.titles.count()).toBe(0);
  });
});
