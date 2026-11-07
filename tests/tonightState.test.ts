import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import type { UserItem } from '../src/lib/types';
import type { Pick } from '../src/reco/tonight';
import {
  ensureTonightRun,
  flushTonightState,
  getTonightState,
  hiddenKeys,
  loadTonightState,
  openPicks,
  packState,
  unpackState,
  pickKey,
  setPickHidden,
  setTonightInput,
  setTonightRun,
  settingsSig,
  STATE_TTL_MS,
  validRun,
  type StoredRun,
} from '../src/reco/tonightState';

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix'], languages: ['ta'], useMangoidiots: false };

const ids = Array.from({ length: 30 }, (_, i) => 300 + i);
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const listItem = (id: number) => ({ id, title: `Film ${id}`, genre_ids: [53], original_language: 'ta', release_date: '2020-01-01', vote_average: 7.5, vote_count: 900, poster_path: '/p.jpg', overview: 'o' });
// Titles whose id is divisible by `skipEvery` are not on Netflix: they pass the TMDB filter but fail ours.
let notOnNetflix = (id: number) => id % 2 === 1;
let calls: string[] = [];

function fakeFetch(url: string): Response {
  const u = new URL(url);
  if (u.hostname !== 'api.themoviedb.org') return json([]);
  const p = u.pathname.replace('/3', '');
  calls.push(p.startsWith('/discover') ? 'discover' : p.startsWith('/watch/providers') ? 'catalogue' : p.endsWith('/recommendations') ? 'recommendations' : 'details');
  if (p.startsWith('/watch/providers/')) return json({ results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '' }] });
  if (p.startsWith('/discover/tv')) return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
  if (p.startsWith('/discover/movie')) return json({ page: 1, total_pages: 1, total_results: ids.length, results: ids.map(listItem) });
  const m = p.match(/^\/movie\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    return json({
      ...listItem(id),
      genres: [{ id: 53, name: 'Thriller' }],
      runtime: 100,
      'watch/providers': { results: { IN: { flatrate: [{ provider_id: 900, provider_name: notOnNetflix(id) ? 'Elsewhere' : 'Netflix', logo_path: '' }] } } },
      release_dates: { results: [{ iso_3166_1: 'IN', release_dates: [{ certification: 'UA' }] }] },
      credits: { cast: [], crew: [] },
      keywords: { keywords: [] },
    });
  }
  return new Response('not found', { status: 404 });
}

const detailCalls = () => calls.filter((c) => c === 'details').length;

const pick = (id: number, extra: Partial<Pick> = {}): Pick => ({
  snap: { tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [] },
  availability: [],
  why: 'x',
  ...extra,
});
const run = (picks: Pick[], extra: Partial<StoredRun> = {}): StoredRun => ({
  result: { picks, engineUsed: 'basic', considered: picks.length, effective: { minutes: 120, discovery: 'new', audience: 'solo', type: 'movie', languages: ['ta'] } },
  hidden: [],
  at: Date.now(),
  by: 'auto',
  sig: settingsSig(settings),
  ...extra,
});
const saved = (id: number, lists: string[], rating?: UserItem['rating']): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [], lists, rating, addedAt: 0, updatedAt: 0 });

/** What a new page load does: a new database connection forgets the memory copy. */
async function reopen() {
  db.close();
  await db.open();
  resetSettingsCache();
}
async function reload() {
  flushTonightState();
  await new Promise((r) => setTimeout(r, 20));
  await reopen();
}

describe('Tonight state shared by Tonight and Home', () => {
  beforeEach(async () => {
    calls = [];
    notOnNetflix = (id) => id % 2 === 1;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeFetch(url)));
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
    await loadTonightState();
    setTonightInput({ minutes: 120, discovery: 'new', audience: 'solo', type: 'movie' });
  });

  it('keeps choices and the run across a reload, so the page is never empty', async () => {
    setTonightInput({ minutes: 60, discovery: 'surprise', audience: 'partner', type: 'movie', moodNow: 'tired' });
    setTonightRun(run([pick(1), pick(2)], { by: 'user' }));
    await reload();
    await loadTonightState();
    const state = getTonightState();
    expect(state.input).toMatchObject({ minutes: 60, discovery: 'surprise', moodNow: 'tired' });
    expect(validRun(state, settings)?.result.picks.map((p) => p.snap.tmdbId)).toEqual([1, 2]);
  });

  it('stores only plain data (a service has a search function), and gets the service back on load', async () => {
    const { serviceByKey } = await import('../src/lib/providers');
    const netflix = serviceByKey('netflix')!;
    setTonightRun(run([pick(1, { availability: [{ service: netflix, access: 'subscription', providerName: 'Netflix', logoPath: '/n.png' }] })]));
    const packed = packState(getTonightState());
    expect(() => structuredClone(packed)).not.toThrow();
    const back = unpackState(packed);
    expect(back.run!.result.picks[0].availability[0].service.search?.('Leo')).toContain('netflix.com');
    // …and what reaches the database survives a reload with the link intact.
    await reload();
    await loadTonightState();
    expect(getTonightState().run!.result.picks[0].availability[0].service.search).toBeTypeOf('function');
  });

  it('starts fresh after six hours, and ignores a run made for other services', async () => {
    setTonightInput({ minutes: 30, discovery: 'new', audience: 'solo', type: 'tv' });
    setTonightRun(run([pick(1)]));
    const state = getTonightState();
    expect(validRun(state, settings)).toBeDefined();
    expect(validRun(state, { ...settings, services: ['netflix', 'prime'] })).toBeUndefined();
    expect(validRun(state, { ...settings, languages: ['ta', 'hi'] })).toBeUndefined();
    expect(validRun(state, settings, Date.now() + STATE_TTL_MS + 1)).toBeUndefined();
    // A saved state older than the limit isn't restored.
    await db.kv.put({ key: 'tonight', value: { ...state, updatedAt: Date.now() - STATE_TTL_MS - 1000 } });
    await reopen();
    await loadTonightState();
    expect(getTonightState().input.type).toBe('either');
    expect(getTonightState().run).toBeUndefined();
  });

  it('hides what was acted on in Tonight or done in the library, but keeps watchlist nudges', () => {
    const r = run([pick(1), pick(2), pick(3), pick(4), pick(5), pick(6, { onWatchlist: true })], { hidden: ['movie:1'] });
    const items = [saved(2, ['watched']), saved(3, [], 'dislike'), saved(4, ['watchlist']), saved(6, ['watchlist'])];
    expect([...hiddenKeys(r, items)].sort()).toEqual(['movie:1', 'movie:2', 'movie:3', 'movie:4']);
    expect(openPicks(r, items).map((p) => p.snap.tmdbId)).toEqual([5, 6]);
  });

  it('setPickHidden hides and brings back a pick (Undo)', () => {
    setTonightRun(run([pick(1), pick(2)]));
    setPickHidden('movie:1', true);
    expect(openPicks(getTonightState().run!, []).map(pickKey)).toEqual(['movie:2']);
    setPickHidden('movie:1', false);
    expect(openPicks(getTonightState().run!, []).map(pickKey)).toEqual(['movie:1', 'movie:2']);
  });

  it('builds one quick run on demand, shares it between callers, and reuses it without any TMDB call', async () => {
    await Promise.all([ensureTonightRun(settings), ensureTonightRun(settings)]);
    const first = getTonightState().run!;
    expect(first.by).toBe('auto');
    expect(first.result.engineUsed).toBe('basic');
    expect(first.result.picks.length).toBeGreaterThan(0);
    const after = calls.length;
    expect(calls.filter((c) => c === 'catalogue').length).toBe(1);
    await ensureTonightRun(settings);
    expect(calls.length).toBe(after);
    // After a reload the stored run is used: still no TMDB call.
    await reload();
    await loadTonightState();
    calls = [];
    await ensureTonightRun(settings);
    expect(calls).toEqual([]);
    expect(getTonightState().run?.result.picks.length).toBe(first.result.picks.length);
  });

  it('does not overwrite a run the user asked for', async () => {
    setTonightRun(run([pick(1)], { by: 'user' }));
    await ensureTonightRun(settings);
    expect(getTonightState().run?.by).toBe('user');
    expect(calls).toEqual([]);
  });

  it('looks at more titles only while too few pass the filters', async () => {
    // Half the titles are on Netflix: a first wave of 16 leaves 8, so more waves are fetched until 12 pass.
    await ensureTonightRun(settings);
    const details = detailCalls();
    expect(details).toBeGreaterThan(16);
    expect(details).toBeLessThanOrEqual(30);
    expect(getTonightState().run!.result.picks.length).toBe(12);
  });

  it('stops after the first wave when enough titles pass', async () => {
    notOnNetflix = () => false;
    await ensureTonightRun(settings);
    expect(detailCalls()).toBe(16);
    expect(getTonightState().run!.result.picks.length).toBe(12);
  });
});
