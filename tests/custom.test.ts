import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { importItem, removeCustomTitle, saveCustomTitle, toggleList } from '../src/db/items';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings } from '../src/db/settings';
import { customSnapshot, newCustomId, safeUrl } from '../src/lib/custom';
import { titleToText } from '../src/lib/exportText';
import { applyImport, splitEmoji } from '../src/lib/importApply';
import { confidenceOf, matchRow, normTitle, scoreCandidate, titleSimilarity } from '../src/lib/importMatch';
import { parseMarkdown } from '../src/lib/markdown';
import { isCustom } from '../src/lib/types';

describe('custom title helpers', () => {
  it('makes unique negative ids', () => {
    const ids = Array.from({ length: 50 }, newCustomId);
    expect(ids.every((id) => id < 0 && Number.isSafeInteger(id))).toBe(true);
    expect(new Set(ids).size).toBe(50);
    expect(isCustom({ tmdbId: ids[0] })).toBe(true);
    expect(isCustom({ tmdbId: 42 })).toBe(false);
  });

  it('accepts only http(s) links', () => {
    expect(safeUrl('https://en.wikipedia.org/wiki/Kaithi')).toBe('https://en.wikipedia.org/wiki/Kaithi');
    expect(safeUrl('youtube.com/watch?v=x')).toBe('https://youtube.com/watch?v=x');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl('ftp://x.org/a')).toBeUndefined();
    expect(safeUrl('not a link')).toBeUndefined();
    expect(safeUrl('')).toBeUndefined();
  });

  it('builds a snapshot, dropping empty fields', () => {
    const s = customSnapshot({ type: 'tv', title: '  Malgudi Days ', year: 1987, originalTitle: 'मालगुडी डेज़', cast: 'Master Manjunath, , Girish Karnad', url: 'javascript:x', overview: ' ' });
    expect(s).toMatchObject({ type: 'tv', title: 'Malgudi Days', year: 1987, posterPath: null, genreIds: [], custom: { originalTitle: 'मालगुडी डेज़', cast: ['Master Manjunath', 'Girish Karnad'] } });
    expect(s.custom).not.toHaveProperty('url');
    expect(s.custom).not.toHaveProperty('overview');
    expect(isCustom(s)).toBe(true);
  });

  it('exports text with its own link, never a TMDB link or where-to-watch', () => {
    const snap = customSnapshot({ type: 'movie', title: 'Home Video', url: 'https://example.com/v' });
    const text = titleToText({ snap });
    expect(text).toContain('More: https://example.com/v');
    expect(text).not.toContain('themoviedb.org');
    expect(text).not.toContain('Where to watch');
  });
});

describe('custom titles in the database', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.lists.clear();
  });

  it('creates, edits (keeping lists and rating), changes type and deletes', async () => {
    const snap = customSnapshot({ type: 'movie', title: 'Home Video', year: 1998 });
    const created = await saveCustomTitle(snap, { list: 'l_fav' });
    expect(created.lists).toEqual(['l_fav']);
    await toggleList(snap, 'watched', true);
    const edited = await saveCustomTitle({ ...snap, title: 'Home Video (VHS)', year: undefined });
    expect(edited).toMatchObject({ title: 'Home Video (VHS)', lists: ['l_fav', 'watched'] });
    expect(edited.year).toBeUndefined();
    const moved = await saveCustomTitle({ ...snap, type: 'tv' }, { previousKey: created.key });
    expect(moved.key).toBe(`tv:${snap.tmdbId}`);
    expect(moved.lists).toEqual(['l_fav', 'watched']);
    expect((await db.items.get(created.key))!.lists).toEqual([]);
    await removeCustomTitle(moved.key);
    const gone = (await db.items.get(moved.key))!;
    expect(gone.lists).toEqual([]);
    expect(gone.rating).toBeUndefined();
  });

  it('import adds lists and ratings but never removes', async () => {
    const snap = { tmdbId: 7, type: 'movie' as const, title: 'Vikram', genreIds: [28] };
    await toggleList(snap, 'watchlist', true);
    const item = await importItem(snap, ['watched', 'l_x'], 'like');
    expect(item.lists).toEqual(['watchlist', 'watched', 'l_x']);
    expect(item.rating).toBe('like');
    expect(item.watchedAt).toBeTypeOf('number');
  });
});

describe('import', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.lists.clear();
  });

  it('splits a leading emoji off list names', () => {
    expect(splitEmoji('🌧️ Rainy day')).toEqual({ emoji: '🌧️', name: 'Rainy day' });
    expect(splitEmoji('Rainy day')).toEqual({ name: 'Rainy day' });
  });

  it('scores titles and years', () => {
    expect(normTitle('The Lunchbox!')).toBe('lunchbox');
    expect(titleSimilarity('Kaithi', 'kaithi')).toBe(1);
    const row = { title: 'Drishyam', year: 2013, type: 'movie' as const };
    const right = scoreCandidate(row, { id: 1, title: 'Drishyam', release_date: '2013-12-19', vote_count: 900 }, 'movie');
    const remake = scoreCandidate(row, { id: 2, title: 'Drishyam', release_date: '2015-07-31', vote_count: 900 }, 'movie');
    const other = scoreCandidate(row, { id: 3, title: 'Drishyam 2', release_date: '2021-02-19', vote_count: 900 }, 'movie');
    expect(right).toBeGreaterThan(0.85);
    expect(right).toBeGreaterThan(remake);
    expect(remake).toBeGreaterThan(other);
    const item = { id: 1, title: 'x' };
    expect(confidenceOf([{ item, type: 'movie', score: 0.9 }, { item, type: 'movie', score: 0.88 }])).toBe('check');
    expect(confidenceOf([{ item, type: 'movie', score: 0.9 }])).toBe('good');
    expect(confidenceOf([])).toBe('none');
  });

  it('never calls TMDB for a custom row', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const [row] = parseMarkdown('- My film · custom').rows;
    expect(await matchRow(row)).toEqual({ candidates: [], confidence: 'none' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('matches by IMDb id and by search, through a mocked TMDB', async () => {
    resetSettingsCache();
    await saveSettings({ ...DEFAULT_SETTINGS, tmdbToken: 'x'.repeat(32) });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        calls.push(u.pathname + u.search);
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
        if (u.pathname.startsWith('/3/find/')) return json({ movie_results: [{ id: 278, title: 'The Shawshank Redemption', release_date: '1994-09-23' }], tv_results: [] });
        if (u.pathname === '/3/search/movie' && u.searchParams.get('year')) return json({ results: [] });
        if (u.pathname === '/3/search/movie') return json({ results: [{ id: 2, title: 'Drishyam', release_date: '2015-07-31' }, { id: 1, title: 'Drishyam', release_date: '2013-12-19' }] });
        return json({ results: [] });
      }),
    );
    const rows = parseMarkdown('- Anything · imdb: tt0111161\n- Drishyam (2014) · movie').rows;
    const a = await matchRow(rows[0]);
    expect(a.confidence).toBe('exact');
    expect(a.candidates[0].item.id).toBe(278);
    const b = await matchRow(rows[1]);
    expect(calls.filter((c) => c.startsWith('/3/search/movie')).length).toBe(2); // with the year, then without
    expect(b.candidates.map((c) => c.item.id)).toHaveLength(2);
    expect(b.confidence).toBe('check');
    vi.unstubAllGlobals();
  });

  it('applies decisions: creates lists, reuses custom titles, skips', async () => {
    const rows = parseMarkdown(`# Watchlist
- Kaithi (2019) · movie
- Unknown thing
## 🌧️ Rainy day
- Kaithi (2019) · movie · rating: like
- Our Wedding (2018) · custom · url: https://example.com/w`).rows;
    const kaithi = { item: { id: 1, title: 'Kaithi', release_date: '2019-10-25', genre_ids: [28] }, type: 'movie' as const };
    const s = await applyImport([
      { row: rows[0], pick: kaithi },
      { row: rows[1], pick: 'skip' },
      { row: rows[2], pick: kaithi },
      { row: rows[3], pick: 'custom' },
    ]);
    expect(s).toMatchObject({ titles: 2, matched: 1, custom: 1, skipped: 1, listsCreated: ['🌧️ Rainy day'] });
    const list = (await db.lists.toArray())[0];
    expect(list).toMatchObject({ name: 'Rainy day', emoji: '🌧️' });
    const k = (await db.items.get('movie:1'))!;
    // 👍 also means watched.
    expect(k.lists).toEqual(['watchlist', list.id, 'watched']);
    expect(k.rating).toBe('like');
    const custom = (await db.items.toArray()).find(isCustom)!;
    expect(custom).toMatchObject({ title: 'Our Wedding', year: 2018, lists: [list.id], custom: { url: 'https://example.com/w' } });
    // Importing the same custom title again updates it instead of adding a copy.
    await applyImport([{ row: { ...rows[3], list: 'watched' }, pick: 'custom' }]);
    const customs = (await db.items.toArray()).filter(isCustom);
    expect(customs).toHaveLength(1);
    expect(customs[0].lists).toEqual([list.id, 'watched']);
  });
});
