import { describe, expect, it } from 'vitest';
import { builtinListFor, csvCells, itemToMarkdown, listsToMarkdown, MARKDOWN_SAMPLE, parseLine, parseMarkdown, ratingFrom } from '../src/lib/markdown';
import type { UserItem } from '../src/lib/types';

const pick = (text: string) => parseMarkdown(text).rows.map(({ title, year, type, rating, tmdbId, imdbId, list, custom }) => ({ title, year, type, rating, tmdbId, imdbId, list, custom }));
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

describe('Markdown parser', () => {
  it('reads the documented format', () => {
    const rows = parseMarkdown(MARKDOWN_SAMPLE).rows;
    expect(rows.map((r) => [r.title, r.list])).toEqual([
      ['Kaithi', 'watchlist'],
      ['Paatal Lok', 'watchlist'],
      ['Super Deluxe', 'watchlist'],
      ['The Shawshank Redemption', 'watchlist'],
      ['Jailer', 'watched'],
      ['Om Shanti Om', 'Rainy day comfort'],
      ['Our Wedding Video', 'Rainy day comfort'],
    ]);
    expect(clean(rows[1])).toMatchObject({ year: 2020, type: 'tv', rating: 'ripe' });
    expect(rows[2].tmdbId).toBe(550776);
    expect(rows[3].imdbId).toBe('tt0111161');
    expect(rows[6]).toMatchObject({ custom: true, year: 2018, url: 'https://example.com/wedding', overview: 'Optional description for your own title.' });
  });

  it('maps headings to built-in lists, loosely', () => {
    expect(builtinListFor('My Favorites')).toBe('favourite');
    expect(builtinListFor('❤️ Favourites')).toBe('favourite');
    expect(builtinListFor('To watch')).toBe('watchlist');
    expect(builtinListFor('Watch list')).toBe('watchlist');
    expect(builtinListFor('Already watched')).toBe('watched');
    expect(builtinListFor('Seen')).toBe('watched');
    expect(builtinListFor('Watched in 2024')).toBeUndefined();
    expect(pick('**Favourites**\n- Vikram\n\nRainy day:\n- Om')).toEqual([
      clean({ title: 'Vikram', list: 'favourite' }),
      clean({ title: 'Om', list: 'Rainy day' }),
    ]);
  });

  it('handles numbered lists, task lists, links, emphasis and loose separators', () => {
    const rows = pick(`1. **Kaithi** - 2019
2) [Vikram](https://www.themoviedb.org/movie/575265) (2022)
3. [x] Super Deluxe — 2019 — loved the ending
- Jai Bhim, 2021
- Mission: Impossible - Fallout (2018)
* Panchayat (TV Series 2020–) | Hindi | Delicious 🥭
+ The Lunchbox [2013] · https://www.imdb.com/title/tt2350496/`);
    expect(rows.map((r) => clean(r))).toEqual([
      { title: 'Kaithi', year: 2019, list: 'watchlist' },
      { title: 'Vikram', year: 2022, type: 'movie', tmdbId: 575265, list: 'watchlist' },
      { title: 'Super Deluxe', year: 2019, list: 'watchlist' },
      { title: 'Jai Bhim', year: 2021, list: 'watchlist' },
      { title: 'Mission: Impossible - Fallout', year: 2018, list: 'watchlist' },
      { title: 'Panchayat', year: 2020, type: 'tv', rating: 'delicious', list: 'watchlist' },
      { title: 'The Lunchbox', year: 2013, imdbId: 'tt2350496', list: 'watchlist' },
    ]);
  });

  it('reads key: value details and ratings in other scales', () => {
    const r = parseLine('Kaathal (2023) · type: movie · rating: 8/10 · lang: Malayalam · runtime: 1h 54m · genres: Drama, Family · director: Jeo Baby · cast: Mammootty, Jyothika · notes: quiet and brave');
    expect(r).toMatchObject({ title: 'Kaathal', year: 2023, type: 'movie', rating: 'ripe', originalLanguage: 'ml', runtime: 114, genreIds: [18, 10751], director: 'Jeo Baby', cast: ['Mammootty', 'Jyothika'], overview: 'quiet and brave' });
    expect(ratingFrom('★★★★½')).toBe('delicious');
    expect(ratingFrom('3')).toBe('raw');
    expect(ratingFrom('4/5')).toBe('ripe');
    expect(ratingFrom('10')).toBe('delicious');
    expect(ratingFrom('2/10')).toBe('rotten');
    expect(ratingFrom('Rotten 🥭')).toBe('rotten');
    expect(ratingFrom('great')).toBeUndefined();
  });

  it('reads our own plain-text share format', () => {
    const rows = pick(`🥭 Comfort · 2 titles · 3 Oct 2026

1. Panchayat (2020) · Series · 32m · Hindi · Delicious 🥭
2. Jailer (2023) · Movie · 2h 48m · Tamil

Shared from MovieMango · https://watch.mangoidiots.com`);
    expect(rows.map((r) => [r.title, r.year, r.type, r.rating])).toEqual([
      ['Panchayat', 2020, 'tv', 'delicious'],
      ['Jailer', 2023, 'movie', undefined],
    ]);
  });

  it('reads Markdown tables with a header', () => {
    const rows = parseMarkdown(`## Watched
| Title | Year | Type | My rating | IMDb |
|---|---|---|---|---|
| Drishyam | 2013 | Movie | 9 | tt3417422 |
| Kerala Crime Files | 2023 | TV series | ripe | |
| [Aavesham](https://www.themoviedb.org/movie/1126725) | 2024 | | | |`).rows;
    expect(rows.map((r) => clean({ title: r.title, year: r.year, type: r.type, rating: r.rating, imdbId: r.imdbId, tmdbId: r.tmdbId, list: r.list }))).toEqual([
      { title: 'Drishyam', year: 2013, type: 'movie', rating: 'delicious', imdbId: 'tt3417422', list: 'watched' },
      { title: 'Kerala Crime Files', year: 2023, type: 'tv', rating: 'ripe', list: 'watched' },
      { title: 'Aavesham', year: 2024, type: 'movie', tmdbId: 1126725, list: 'watched' },
    ]);
  });

  it('reads IMDb and Letterboxd CSV exports', () => {
    const imdb = parseMarkdown(`Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0111161,9,2024-01-01,The Shawshank Redemption,The Shawshank Redemption,https://www.imdb.com/title/tt0111161/,Movie,9.3,142,1994,Drama,3000000,1994-10-14,Frank Darabont
tt12392504,7,2024-02-01,"Paatal Lok",Paatal Lok,https://www.imdb.com/title/tt12392504/,TV Series,8.1,45,2020,"Action, Crime",40000,2020-05-15,`, 1000, 'watched').rows;
    expect(imdb.map((r) => [r.title, r.year, r.type, r.rating, r.imdbId, r.list])).toEqual([
      ['The Shawshank Redemption', 1994, 'movie', 'delicious', 'tt0111161', 'watched'],
      ['Paatal Lok', 2020, 'tv', 'ripe', 'tt12392504', 'watched'],
    ]);
    const lb = parseMarkdown(`Date,Name,Year,Letterboxd URI,Rating
2024-03-01,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/abc,4.5`).rows;
    expect(lb.map((r) => [r.title, r.year, r.rating])).toEqual([['Crouching Tiger, Hidden Dragon', 2000, 'delicious']]);
    expect(csvCells('a,"b, ""c""",d')).toEqual(['a', 'b, "c"', 'd']);
  });

  it('accepts a bare list of titles, ignores comments, code fences and prose when there are bullets', () => {
    expect(pick('Kaithi (2019)\nVikram\n\nAnbe Sivam').map((r) => r.title)).toEqual(['Kaithi', 'Vikram', 'Anbe Sivam']);
    expect(pick('Here is your list in MovieMango format, as you asked me to.\n```markdown\n<!-- header\n- not this -->\n# Watched\n- Vikram (2022)\n```\nLet me know if you need anything else!').map((r) => [r.title, r.list])).toEqual([['Vikram', 'watched']]);
  });

  it('keeps titles in other scripts and odd titles intact', () => {
    expect(pick('- விக்ரம் (2022)\n- 1917 (2019)\n- Blade Runner 2049\n- Om (film)').map((r) => [r.title, r.year, r.type])).toEqual([
      ['விக்ரம்', 2022, undefined],
      ['1917', 2019, undefined],
      ['Blade Runner 2049', undefined, undefined],
      ['Om', undefined, 'movie'],
    ]);
  });

  it(`caps the import at 1000 rows`, () => {
    const many = Array.from({ length: 1005 }, (_, i) => `- Title ${i}`).join('\n');
    const r = parseMarkdown(many);
    expect(r.rows.length).toBe(1000);
    expect(r.total).toBe(1005);
    expect(r.truncated).toBe(true);
  });
});

describe('Markdown export', () => {
  const base = { genreIds: [], addedAt: 0, updatedAt: 0, lists: [] as string[] };
  const items: UserItem[] = [
    { ...base, key: 'movie:550776', tmdbId: 550776, type: 'movie', title: 'Super Deluxe', year: 2019, rating: 'delicious', lists: ['watched'] },
    { ...base, key: 'tv:1', tmdbId: 1, type: 'tv', title: 'Paatal Lok', year: 2020, lists: ['watchlist'] },
    {
      ...base,
      key: 'movie:-5',
      tmdbId: -5,
      type: 'movie',
      title: 'Amma’s Home Video',
      year: 1998,
      runtime: 42,
      originalLanguage: 'ta',
      genreIds: [10751, 99],
      rating: 'ripe',
      custom: { originalTitle: 'அம்மா வீடியோ', director: 'Appa', cast: ['Amma', 'Paati'], url: 'https://example.com/v', overview: 'Our first VHS.\nShot in Madurai.' },
    },
  ];

  it('writes one bullet per title with ids, and custom details', () => {
    expect(itemToMarkdown(items[0])).toBe('- Super Deluxe (2019) · movie · rating: delicious · tmdb: 550776');
    expect(itemToMarkdown(items[2])).toBe(
      '- Amma’s Home Video (1998) · movie · rating: ripe · custom · original: அம்மா வீடியோ · lang: ta · runtime: 42 · genres: Family, Documentary · director: Appa · cast: Amma, Paati · url: https://example.com/v\n  > Our first VHS.\n  > Shot in Madurai.',
    );
  });

  it('round-trips through the parser', () => {
    const md = listsToMarkdown([
      { name: 'Watched', items: [items[0]] },
      { name: 'Watchlist', items: [items[1]] },
      { name: 'Favourites', items: [] },
      { name: '🌧️ Rainy day', items: [items[2]] },
    ], new Date('2026-10-03'));
    expect(md).toContain('not endorsed or certified by TMDB');
    expect(md).toContain('JustWatch');
    expect(md).not.toContain('# Favourites');
    const rows = parseMarkdown(md).rows;
    expect(rows.map((r) => [r.list, r.title, r.year, r.type, r.rating, r.tmdbId])).toEqual([
      ['watched', 'Super Deluxe', 2019, 'movie', 'delicious', 550776],
      ['watchlist', 'Paatal Lok', 2020, 'tv', undefined, 1],
      ['🌧️ Rainy day', 'Amma’s Home Video', 1998, 'movie', 'ripe', undefined],
    ]);
    expect(rows[2]).toMatchObject({
      custom: true,
      originalTitle: 'அம்மா வீடியோ',
      originalLanguage: 'ta',
      runtime: 42,
      genreIds: [10751, 99],
      director: 'Appa',
      cast: ['Amma', 'Paati'],
      url: 'https://example.com/v',
      overview: 'Our first VHS.\nShot in Madurai.',
    });
  });

  it('keeps a lone empty list heading', () => {
    expect(listsToMarkdown([{ name: 'Favourites', items: [] }])).toContain('# Favourites');
  });
});
