import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPerson, type TmdbPerson } from '../src/api/tmdb';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import { getFavouritePeople, restoreFavourite, setFavourite } from '../src/db/people';
import { createBackup, restoreBackup } from '../src/lib/backup';
import { cleanPeople, liveFavourites, type FavPerson } from '../src/lib/people';
import type { UserItem } from '../src/lib/types';
import { creditCandidates, FAV_PEOPLE_MAX, pickFavourites, PEOPLE_BONUS } from '../src/reco/people';
import { planTonight } from '../src/reco/tonight';
import { mergePayloads, sameContent, type SyncPayload } from '../src/sync/merge';

const person = (id: number, extra: Partial<FavPerson> = {}): FavPerson => ({ id, name: `Person ${id}`, profilePath: null, addedAt: id, updatedAt: id, ...extra });
const payload = (p: Partial<SyncPayload>): SyncPayload => ({ app: 'MovieMango', version: 1, savedAt: 0, items: [], lists: [], settings: {}, settingsUpdatedAt: 0, ...p });
const info = { id: 5, name: 'Vetrimaaran', profile_path: '/v.jpg', known_for_department: 'Directing' };

describe('favourite people (db)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('favourites and un-favourites, adding nothing to any list', async () => {
    await setFavourite(info, true);
    expect((await getFavouritePeople()).map((p) => [p.id, p.name, p.department, p.profilePath])).toEqual([[5, 'Vetrimaaran', 'Directing', '/v.jpg']]);
    expect(await db.items.count()).toBe(0);
    expect(await db.lists.count()).toBe(0);
    await setFavourite(info, false);
    expect(await getFavouritePeople()).toEqual([]);
    // The row stays as a tombstone, so sync can't bring the person back from another device.
    expect((await db.people.get(5))?.deleted).toBe(true);
  });

  it('Undo restores the earlier state, and re-favouriting after a removal starts fresh', async () => {
    await setFavourite(info, true);
    const added = (await db.people.get(5))!.addedAt;
    const prev = await setFavourite(info, false);
    await restoreFavourite(info, prev);
    const back = (await getFavouritePeople())[0];
    expect(back.addedAt).toBe(added);
    expect(back.deleted).toBeUndefined();
    // Undo of a first-time favourite removes it again.
    await db.people.clear();
    const none = await setFavourite(info, true);
    await restoreFavourite(info, none);
    expect(await getFavouritePeople()).toEqual([]);
  });

  it('lists the newest favourite first and ignores removed ones', () => {
    const list = [person(1), person(3), person(2, { deleted: true })];
    expect(liveFavourites(list).map((p) => p.id)).toEqual([3, 1]);
  });
});

describe('cleanPeople', () => {
  it('keeps good rows and drops anything unusable (older or hand-edited payloads)', () => {
    expect(cleanPeople(undefined)).toEqual([]);
    expect(cleanPeople('nope')).toEqual([]);
    const out = cleanPeople([person(1), { id: -4, name: 'Custom?', updatedAt: 1 }, { id: 2, name: '', updatedAt: 1 }, { id: 3, name: 'No time' }, null, { id: 4, name: 'Ok', updatedAt: 9, deleted: true }]);
    expect(out.map((p) => p.id)).toEqual([1, 4]);
    expect(out[1]).toMatchObject({ addedAt: 9, deleted: true });
  });
});

describe('Drive sync merge: people', () => {
  it('merges newest-wins per person, and a removal on one device beats an older copy', () => {
    const local = payload({ people: [person(1, { updatedAt: 10 }), person(2, { updatedAt: 5 })] });
    const remote = payload({ people: [person(1, { updatedAt: 4 }), person(2, { updatedAt: 9, deleted: true }), person(3)] });
    const m = mergePayloads(local, remote);
    expect(Object.fromEntries(m.people!.map((p) => [p.id, !!p.deleted]))).toEqual({ 1: false, 2: true, 3: false });
  });

  it('accepts a Drive file from an older app (no people) and sends nothing extra when there are none', () => {
    const local = payload({ items: [] });
    const m = mergePayloads(local, payload({}));
    expect('people' in m).toBe(false);
    const withPeople = mergePayloads(payload({ people: [person(1)] }), payload({}));
    expect(withPeople.people).toEqual([person(1)]);
    expect(mergePayloads(payload({}), payload({ people: [person(7)] })).people).toEqual([person(7)]);
  });

  it('ignores junk rows from Drive instead of failing', () => {
    const remote = payload({ people: [{ id: 'x' }, person(8)] as unknown as FavPerson[] });
    expect(mergePayloads(payload({}), remote).people!.map((p) => p.id)).toEqual([8]);
  });

  it('a stored person compares equal to its merged copy (no endless re-uploads)', async () => {
    await db.delete();
    await db.open();
    await setFavourite(info, true);
    await setFavourite({ id: 9, name: 'No photo' }, true);
    await setFavourite({ id: 9, name: 'No photo' }, false);
    const stored = await db.people.toArray();
    // Same key order as sync.ts builds it.
    const local: SyncPayload = { app: 'MovieMango', version: 1, savedAt: 0, items: [], lists: [], streaming: [], people: stored, settings: {}, settingsUpdatedAt: 0 };
    expect(sameContent(local, mergePayloads(local, payload({ people: stored })))).toBe(true);
  });
});

describe('JSON backup: people', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSettingsCache();
  });

  it('round-trips favourites and tombstones', async () => {
    await setFavourite(info, true);
    await setFavourite({ id: 6, name: 'Gone' }, true);
    await setFavourite({ id: 6, name: 'Gone' }, false);
    const file = JSON.parse(JSON.stringify(await createBackup()));
    expect(file.people).toHaveLength(2);
    await db.people.clear();
    const r = await restoreBackup(file);
    expect(r.people).toBe(1);
    expect((await db.people.toArray()).map((p) => [p.id, !!p.deleted])).toEqual([[5, false], [6, true]]);
  });

  it('restoring an old backup without people keeps today’s favourites; an older copy never beats a newer one', async () => {
    await setFavourite(info, true);
    const old = { app: 'MovieMango', version: 1, exportedAt: '2026-01-01', items: [], lists: [], settings: {} };
    expect((await restoreBackup(old)).people).toBe(0);
    expect(await getFavouritePeople()).toHaveLength(1);
    const staleRemoval = { ...old, people: [{ ...(await db.people.get(5))!, deleted: true, updatedAt: 1 }] };
    await restoreBackup(staleRemoval);
    expect(await getFavouritePeople()).toHaveLength(1);
  });
});

describe('favourite people as a recommendation input', () => {
  const credit = (id: number, extra: object = {}) => ({ id, media_type: 'movie', title: `Film ${id}`, poster_path: '/p.jpg', genre_ids: [53], original_language: 'ta', release_date: '2020-01-01', vote_average: 7.5, vote_count: 500, ...extra });

  it('picks the 8 newest favourites, skipping removed and custom (negative) ids', () => {
    const many = Array.from({ length: 12 }, (_, i) => person(i + 1));
    expect(pickFavourites(many)).toHaveLength(FAV_PEOPLE_MAX);
    expect(pickFavourites(many)[0].id).toBe(12);
    expect(pickFavourites([person(1, { deleted: true }), person(-3), person(2)]).map((p) => p.id)).toEqual([2]);
  });

  it('takes real, released, well-voted credits, capped, without touching the source object', () => {
    const p = { id: 1, name: 'A', combined_credits: { cast: [credit(1), credit(2, { vote_count: 3 }), credit(3, { release_date: '2999-01-01' }), credit(4, { media_type: 'tv', name: 'S', title: undefined, first_air_date: '2019-01-01' }), credit(5, { poster_path: null }), ...[10, 11, 12, 13, 14, 15, 16].map((i) => credit(i))], crew: [credit(1, { job: 'Director' })] } } as unknown as TmdbPerson;
    const before = JSON.stringify(p);
    const out = creditCandidates(p, ['movie'], '2026-01-01');
    expect(out.length).toBe(6);
    expect(out.map((s) => s.tmdbId)).not.toContain(2);
    expect(out.map((s) => s.tmdbId)).not.toContain(3);
    expect(out.map((s) => s.tmdbId)).not.toContain(4);
    expect(out.map((s) => s.tmdbId)).not.toContain(5);
    expect(new Set(out.map((s) => s.tmdbId)).size).toBe(out.length);
    expect(creditCandidates(p, ['tv'], '2026-01-01').map((s) => s.tmdbId)).toEqual([4]);
    expect(JSON.stringify(p)).toBe(before);
  });

  // A tiny TMDB: discover returns 101 (Netflix); person 77's credits are 106 (on Netflix), 107 (not on my services), 105 (watched) and 108 (👎).
  const titles: Record<number, { title: string; providers: string[] }> = {
    101: { title: 'Fits Perfectly', providers: ['Netflix'] },
    105: { title: 'Already Watched', providers: ['Netflix'] },
    106: { title: 'Fan Pick', providers: ['Netflix'] },
    107: { title: 'Elsewhere Only', providers: ['Some Other'] },
    108: { title: 'Not For Me', providers: ['Netflix'] },
  };
  const listItem = (id: number) => ({ id, title: titles[id].title, genre_ids: [53], original_language: 'ta', release_date: '2020-01-01', vote_average: 7.5, vote_count: 900, poster_path: '/p.jpg', overview: 'o' });
  const personUrls: string[] = [];
  function fakeFetch(url: string): Response {
    const u = new URL(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.hostname === 'public-api.wordpress.com') return json([]);
    if (u.pathname.includes('/watch/providers/')) return json({ results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '' }] });
    if (u.pathname.startsWith('/3/discover/movie')) return json({ page: 1, total_pages: 1, total_results: 1, results: [listItem(101)] });
    if (u.pathname.startsWith('/3/discover/tv') || u.pathname.includes('/recommendations')) return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
    const pm = u.pathname.match(/\/3\/person\/(\d+)$/);
    if (pm) {
      personUrls.push(pm[1]);
      return json({ id: Number(pm[1]), name: 'Fan Favourite', known_for_department: 'Acting', combined_credits: { cast: [106, 107, 105, 108].map((id) => ({ ...listItem(id), media_type: 'movie', character: 'Role' })), crew: [] } });
    }
    const m = u.pathname.match(/\/3\/movie\/(\d+)$/);
    if (m && titles[Number(m[1])]) {
      const t = titles[Number(m[1])];
      return json({ ...listItem(Number(m[1])), genres: [{ id: 53, name: 'Thriller' }], runtime: 100, 'watch/providers': { results: { IN: { link: 'x', flatrate: t.providers.map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: '' })) } } }, release_dates: { results: [{ iso_3166_1: 'IN', release_dates: [{ certification: 'UA' }] }] }, credits: { cast: [], crew: [] }, keywords: { keywords: [] } });
    }
    return new Response('not found', { status: 404 });
  }
  const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix'], languages: ['ta'], useMangoidiots: false };
  const input = { minutes: 120 as const, want: 'thrill' as const, discovery: 'new' as const, audience: 'solo' as const, type: 'movie' as const };
  const saved = (id: number, extra: Partial<UserItem>): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: titles[id].title, genreIds: [53], lists: [], addedAt: 0, updatedAt: 0, ...extra });
  const items = [saved(105, { lists: ['watched'] }), saved(108, { rating: 'dislike' })];

  beforeEach(async () => {
    personUrls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeFetch(url)));
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
  });

  it('boosts a favourite person’s title that is on my services, with a visible reason, in Basic mode', async () => {
    const without = await planTonight(input, settings, items, null);
    expect(without.picks.map((p) => p.snap.title)).toEqual(['Fits Perfectly']);
    const r = await planTonight(input, settings, items, null, undefined, { people: [person(77, { name: 'Fan Favourite' })] });
    expect(r.engineUsed).toBe('basic');
    // Not on my services (107), already watched (105) and 👎 (108) stay out; the fan pick comes first thanks to the boost.
    expect(r.picks.map((p) => p.snap.title)).toEqual(['Fan Pick', 'Fits Perfectly']);
    expect(r.picks[0].why).toMatch(/Because you favourited Fan Favourite/);
    expect(r.picks[1].why).not.toMatch(/favourited/);
    expect(PEOPLE_BONUS).toBeGreaterThan(0);
  });

  it('uses at most 8 favourites, skipping removed and custom ids, and caches the credits', async () => {
    const people = [...Array.from({ length: 11 }, (_, i) => person(200 + i)), person(300, { deleted: true }), person(-5)];
    await planTonight(input, settings, items, null, undefined, { people });
    expect(personUrls.length).toBe(FAV_PEOPLE_MAX);
    expect(personUrls).not.toContain('300');
    expect(personUrls).not.toContain('-5');
    personUrls.length = 0;
    await planTonight(input, settings, items, null, undefined, { people });
    expect(personUrls.length).toBe(0); // cached for 7 days
    expect((await getPerson(200)).name).toBe('Fan Favourite');
  });

  it('tells the AI about favourite people and keeps the reason visible even if the model leaves it out', async () => {
    const engine = {
      id: 'gemini' as const,
      label: 'fake',
      generateJson: vi.fn(async (_s: string, user: string) => {
        expect(user).toMatch(/Favourite people: Fan Favourite/);
        const line = user.split('\n').find((l) => /^\d+ \|.*Fan Pick/.test(l))!;
        expect(line).toMatch(/with favourite person Fan Favourite/);
        return JSON.stringify({ picks: [{ n: Number(line.split(' |')[0]), why: 'A tense one.' }] });
      }),
    };
    const r = await planTonight(input, settings, items, engine, undefined, { people: [person(77, { name: 'Fan Favourite' })] });
    expect(r.engineUsed).toBe('ai');
    expect(r.picks[0].snap.title).toBe('Fan Pick');
    expect(r.picks[0].why).toBe('A tense one. Because you favourited Fan Favourite.');
  });
});
