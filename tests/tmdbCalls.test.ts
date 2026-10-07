import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import { getDetails } from '../src/api/tmdb';
import { planTonight, type TonightInput } from '../src/reco/tonight';
import type { UserItem } from '../src/lib/types';

// Counts real TMDB requests for a typical Tonight run (movie, 3 loved seeds, mocked TMDB).

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const item = (id: number) => ({ id, title: `T${id}`, genre_ids: [53], original_language: 'ta', release_date: '2019-01-01', vote_average: 7.5, vote_count: 900, poster_path: '/p.jpg', overview: 'o' });
const page = (ids: number[]) => ({ page: 1, total_pages: 1, total_results: ids.length, results: ids.map(item) });
const providers = (id: number) => ({ results: { IN: { link: 'https://jw', flatrate: [{ provider_id: 8, provider_name: id % 2 ? 'Some Other' : 'Netflix', logo_path: '' }] } } });

let calls: string[] = [];
function fakeFetch(url: string): Response {
  const u = new URL(url);
  if (u.hostname !== 'api.themoviedb.org') return json([]);
  const p = u.pathname.replace('/3', '');
  if (p.startsWith('/discover/')) calls.push('discover');
  else if (p.startsWith('/watch/providers/')) calls.push('catalogue');
  else if (p.endsWith('/recommendations')) calls.push('recommendations');
  else if (p.endsWith('/watch/providers')) calls.push('title-providers');
  else calls.push('details');
  if (p.startsWith('/watch/providers/')) return json({ results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '' }] });
  if (p.startsWith('/discover/tv')) return json(page([]));
  if (p.startsWith('/discover/movie')) {
    const genreShift = (u.searchParams.get('with_genres') ?? '').length * 3;
    const off = (Number(u.searchParams.get('page') ?? 1) - 1) * 20 + (u.searchParams.get('sort_by')?.includes('vote_average') ? 40 : 0) + genreShift;
    return json(page(Array.from({ length: 20 }, (_, i) => 100 + i + off)));
  }
  const rec = p.match(/^\/movie\/(\d+)\/recommendations$/);
  if (rec) return json(page([1, 2, 3, 4, 5].map((i) => Number(rec[1]) * 10 + i)));
  const wp = p.match(/^\/movie\/(\d+)\/watch\/providers$/);
  if (wp) return json({ id: Number(wp[1]), ...providers(Number(wp[1])) });
  const m = p.match(/^\/movie\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    return json({
      ...item(id),
      genres: [{ id: 53, name: 'Thriller' }],
      runtime: 100,
      status: 'Released',
      'watch/providers': providers(id),
      release_dates: { results: [{ iso_3166_1: 'IN', release_dates: [{ certification: 'UA' }] }] },
      credits: { cast: [], crew: [] },
      keywords: { keywords: [] },
      recommendations: page([1, 2, 3, 4, 5].map((i) => id * 10 + i)),
    });
  }
  return new Response('not found', { status: 404 });
}

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix'], languages: ['ta'], useMangoidiots: false };
const seeds: UserItem[] = [900, 901, 902].map((id, i) => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `Seed ${id}`, genreIds: [53], originalLanguage: 'ta', lists: ['watched'], rating: 'love', addedAt: i, updatedAt: i }));
const input: TonightInput = { minutes: 120, want: 'thrill', discovery: 'new', audience: 'solo', type: 'movie' };

const realNow = Date.now.bind(Date);
let offset = 0;
const settle = async () => {
  // Let background refreshes finish before counting.
  let last = -1;
  while (last !== calls.length) {
    last = calls.length;
    await new Promise((r) => setTimeout(r, 300));
  }
};
const reload = async () => {
  db.close();
  await db.open();
  resetSettingsCache();
};
const summary = () => {
  const by: Record<string, number> = {};
  for (const c of calls) by[c] = (by[c] ?? 0) + 1;
  return { total: calls.length, ...by };
};
async function measure(label: string, run: () => Promise<unknown>) {
  calls = [];
  await run();
  await settle();
  const s = summary();
  console.log(`[tmdb calls] ${label}: ${JSON.stringify(s)}`);
  return s;
}

describe('TMDB call counts for a typical Tonight run', () => {
  beforeEach(async () => {
    offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeFetch(url)));
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
  });
  afterEach(() => vi.restoreAllMocks());

  it('measures a run after browsing the seed titles', { timeout: 60_000 }, async () => {
    await Promise.all(seeds.map((s) => getDetails('movie', s.tmdbId)));
    const s = await measure('after viewing the 3 seeds', () => planTonight(input, settings, seeds, null));
    expect(s.total).toBeGreaterThan(0);
  });

  it('measures cold, warm, reload, browse-then-plan and later runs', { timeout: 120_000 }, async () => {
    const cold = await measure('cold run', () => planTonight(input, settings, seeds, null));
    const warm = await measure('same session, same run', () => planTonight(input, settings, seeds, null));
    const other = await measure('same session, other mood', () => planTonight({ ...input, want: 'laugh' }, settings, seeds, null));
    await reload();
    const reloaded = await measure('after reload, same run', () => planTonight(input, settings, seeds, null));
    offset = 4 * 24 * 3600_000;
    await reload();
    const later = await measure('4 days later', () => planTonight(input, settings, seeds, null));
    offset = 31 * 24 * 3600_000;
    await reload();
    const month = await measure('31 days later', () => planTonight(input, settings, seeds, null));
    expect(cold.total).toBeGreaterThan(0);
    expect(warm.total).toBe(0);
    expect(reloaded.total).toBe(0);
    expect(other.total).toBeLessThan(cold.total);
    expect(later.total).toBeLessThanOrEqual(month.total);
  });
});
