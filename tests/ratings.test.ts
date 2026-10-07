import { describe, expect, it } from 'vitest';
import { parseFilterText, parseYear } from '../src/lib/browse';
import { otherLanguages } from '../src/lib/languages';
import { applyView } from '../src/lib/listView';
import { resolveImportList } from '../src/lib/markdown';
import type { UserItem } from '../src/lib/types';
import { languageOfWeek } from '../src/reco/home';

const item = (p: Partial<UserItem>): UserItem => ({ key: `movie:${p.tmdbId ?? 1}`, tmdbId: 1, type: 'movie', title: 'T', genreIds: [], lists: [], addedAt: 0, updatedAt: 0, ...p }) as UserItem;

describe('import headings', () => {
  it('Loved means watched + ❤️, Not for me means 👎, and a row’s own rating wins', () => {
    expect(resolveImportList('loved')).toEqual({ list: 'watched', rating: 'love' });
    expect(resolveImportList('loved', 'like')).toEqual({ list: 'watched', rating: 'like' });
    expect(resolveImportList('notforme')).toEqual({ rating: 'dislike' });
    expect(resolveImportList('watchlist')).toEqual({ list: 'watchlist', rating: undefined });
  });
});

describe('list sorting and filters', () => {
  const items = [
    item({ tmdbId: 1, title: 'Banana', type: 'movie', year: 1995, addedAt: 3, rating: 'like', genreIds: [35], originalLanguage: 'ta', runtime: 120 }),
    item({ tmdbId: 2, title: 'apple', type: 'tv', year: 2021, addedAt: 1, rating: 'love', genreIds: [18], originalLanguage: 'hi' }),
    item({ tmdbId: 3, title: 'Cherry', type: 'movie', year: 2019, addedAt: 2, genreIds: [35, 18], originalLanguage: 'ta', runtime: 90, custom: { originalTitle: 'செர்ரி' } }),
  ];
  const ids = (list: UserItem[]) => list.map((i) => i.tmdbId);

  it('sorts', () => {
    expect(ids(applyView(items, { type: 'all', sort: 'added' }))).toEqual([1, 3, 2]);
    expect(ids(applyView(items, { type: 'all', sort: 'title' }))).toEqual([2, 1, 3]);
    expect(ids(applyView(items, { type: 'all', sort: 'newest' }))).toEqual([2, 3, 1]);
    expect(ids(applyView(items, { type: 'all', sort: 'rating' }))).toEqual([2, 1, 3]);
    expect(ids(applyView(items, { type: 'all', sort: 'runtime' }))).toEqual([3, 1, 2]);
  });

  it('filters by type, genre, language, rating, decade and text, without changing the list', () => {
    expect(ids(applyView(items, { type: 'movie', sort: 'title' }))).toEqual([1, 3]);
    expect(ids(applyView(items, { type: 'all', sort: 'title', genre: 35, lang: 'ta' }))).toEqual([1, 3]);
    expect(ids(applyView(items, { type: 'all', sort: 'title', rating: 'none' }))).toEqual([3]);
    expect(ids(applyView(items, { type: 'all', sort: 'title', decade: 2010 }))).toEqual([3]);
    expect(ids(applyView(items, { type: 'all', sort: 'title' }, 'செர்'))).toEqual([3]);
    expect(ids(items)).toEqual([1, 2, 3]);
  });
});

describe('browse filters', () => {
  it('reads years, decades, languages and theme words', () => {
    expect(parseYear('2019')).toEqual({ from: 2019, to: 2019 });
    expect(parseYear('1990s')).toEqual({ from: 1990, to: 1999 });
    expect(parseYear("'90s")).toEqual({ from: 1990, to: 1999 });
    expect(parseYear('20s')).toEqual({ from: 2020, to: 2029 });
    expect(parseYear('heist')).toBeUndefined();
    expect(parseFilterText('bank heist 1990s Korean')).toEqual({ year: '1990s', lang: 'ko', theme: 'bank heist' });
    expect(parseFilterText('Italian')).toEqual({ lang: 'it' });
    expect(parseFilterText('  ')).toEqual({});
  });
});

describe('language of the week', () => {
  it('skips the user’s languages and changes on Mondays', () => {
    const mine = ['en', 'ta', 'hi'];
    const sunday = languageOfWeek(mine, new Date(2026, 9, 11));
    const monday = languageOfWeek(mine, new Date(2026, 9, 12));
    expect(languageOfWeek(mine, new Date(2026, 9, 6))).toBe(sunday);
    expect(monday).not.toBe(sunday);
    expect(otherLanguages(mine)).toContain(sunday);
    expect(mine).not.toContain(monday);
    expect(languageOfWeek(otherLanguages([]).concat(mine))).toBeUndefined();
  });
});
