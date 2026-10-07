import { APP_URL, CREDITS } from './exportText';
import { MOVIE_GENRES, TV_GENRES, genreName } from './genres';
import { LANGUAGES } from './languages';
import { safeUrl, splitNames } from './custom';
import { isCustom, type BuiltinList, type MediaType, type MyRating, type UserItem } from './types';

/**
 * MovieMango Markdown: headings name lists, bullets are titles.
 *   # Watchlist
 *   - Kaithi (2019) · movie · rating: like · tmdb: 550776
 *   - My Home Video (2021) · movie · custom · url: https://example.com
 *     > A description line for a custom title.
 * The parser is lenient: numbered lists, tables, "Title - 2019", links, IMDb ids and trailing notes all work.
 */

export const MAX_IMPORT_ROWS = 1000;

export interface MdRow {
  /** 1-based line number in the source. */
  line: number;
  raw: string;
  /** An ImportList ('watchlist', 'watched', 'loved', 'notforme'), or a custom list's heading as written. */
  list: string;
  title: string;
  year?: number;
  type?: MediaType;
  rating?: MyRating;
  tmdbId?: number;
  imdbId?: string;
  custom?: boolean;
  url?: string;
  originalTitle?: string;
  originalLanguage?: string;
  runtime?: number;
  genreIds?: number[];
  director?: string;
  cast?: string[];
  overview?: string;
}

export interface MdParseResult {
  rows: MdRow[];
  /** Rows found before the cap. */
  total: number;
  truncated: boolean;
}

/**
 * Built-in lists, plus two headings that set a rating instead: "Loved" means watched and ❤️
 * ("Favorites" lists from other apps count as Loved); "Not for me" means 👎.
 */
export type ImportList = BuiltinList | 'loved' | 'notforme';
export const IMPORT_LISTS: ImportList[] = ['watchlist', 'watched', 'loved', 'notforme'];

/** The list and rating a row ends up with, after its heading. */
export function resolveImportList(list: string, rating?: MyRating): { list?: string; rating?: MyRating } {
  if (list === 'loved') return { list: 'watched', rating: rating ?? 'love' };
  if (list === 'notforme') return { rating: rating ?? 'dislike' };
  return { list, rating };
}

const BUILTIN_HEADINGS: [ImportList, RegExp][] = [
  ['loved', /^(my )?(all time )?(favou?rites?|faves?|loved|loved it)$/],
  ['watchlist', /^(my )?(watch ?list|to ?watch|want to watch|plan to watch|watch later|queue)$/],
  ['watched', /^(my )?(watched|seen|already watched|finished|completed|diary|ratings?|rated)$/],
  ['notforme', /^(not for me|disliked?|dislikes|never|not interested)$/],
];

/** Maps a heading like "My Favorites" or "To watch" to a built-in list. */
export function builtinListFor(heading: string): ImportList | undefined {
  const h = heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return BUILTIN_HEADINGS.find(([, re]) => re.test(h))?.[0];
}

const listFor = (heading: string) => builtinListFor(heading) ?? heading.replace(/\s+/g, ' ').trim();

type Field = 'title' | 'rating' | 'tmdb' | 'imdb' | 'type' | 'year' | 'url' | 'original' | 'language' | 'runtime' | 'genres' | 'director' | 'cast' | 'overview' | 'list' | 'custom';

const KEYS: Record<string, Field> = {};
const alias = (field: Field, names: string[]) => names.forEach((n) => (KEYS[n] = field));
alias('title', ['title', 'name', 'film', 'movie', 'show', 'series', 'film title', 'movie title']);
alias('rating', ['rating', 'my rating', 'your rating', 'score', 'stars']);
alias('tmdb', ['tmdb', 'tmdb id', 'tmdbid', 'tmdb_id']);
alias('imdb', ['imdb', 'imdb id', 'imdbid', 'imdb_id', 'const']);
alias('type', ['type', 'kind', 'media', 'media type', 'title type']);
alias('year', ['year', 'released', 'release year', 'release date']);
alias('url', ['url', 'link', 'web', 'website', 'letterboxd uri', 'uri']);
alias('original', ['original', 'original title', 'original name', 'aka', 'also known as']);
alias('language', ['lang', 'language', 'original language']);
alias('runtime', ['runtime', 'runtime (mins)', 'mins', 'minutes', 'length', 'duration']);
alias('genres', ['genre', 'genres']);
alias('director', ['director', 'directors', 'directed by', 'dir', 'created by', 'creator', 'creators']);
alias('cast', ['cast', 'starring', 'actors', 'stars in']);
alias('overview', ['note', 'notes', 'about', 'description', 'overview', 'plot', 'summary', 'review']);
alias('list', ['list']);
alias('custom', ['custom']);

const keyOf = (k: string) => KEYS[k.toLowerCase().replace(/\s+/g, ' ').trim()];

const TV_WORDS = /^(tv|series|show|tv show|tv series|tv mini series|mini ?series|web series|tv-series|tvseries|tvminiseries|season)$/i;
const MOVIE_WORDS = /^(movie|film|feature|feature film|tv movie|tvmovie|short|documentary film)$/i;

function typeFrom(v: string): MediaType | undefined {
  const s = v.trim().toLowerCase();
  if (TV_WORDS.test(s) || /\b(series|tv show|mini ?series)\b/.test(s)) return 'tv';
  if (MOVIE_WORDS.test(s) || /\b(movie|film)\b/.test(s)) return 'movie';
  return undefined;
}

/** A middling score (3/5, 5/10) gives no rating: watched, without a verdict. */
const fromFraction = (f: number): MyRating | undefined => (f >= 0.85 ? 'love' : f >= 0.65 ? 'like' : f >= 0.45 ? undefined : 'dislike');

/** Rating words and emoji ("meh" means watched, with no rating). */
const RATING_WORDS: [string[], MyRating | undefined][] = [
  [['love', 'loved', 'loved it', '❤️ loved it', '❤️', '❤', '♥', '♥️', '👍👍'], 'love'],
  [['like', 'liked', 'liked it', '👍 liked it', 'good', '👍'], 'like'],
  [['dislike', 'disliked', 'not for me', '👎 not for me', 'bad', '👎'], 'dislike'],
  [['meh', 'ok', 'okay'], undefined],
];

const clean = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
/** Exact word or emoji, e.g. "love", "👍", "❤️ Loved it". */
const ratingWord = (s: string) => RATING_WORDS.find(([words]) => words.includes(s));

/** 👎 👍 ❤️ words, stars (★★★½), "8/10", "4/5" or a bare number (≤5 means out of 5, else out of 10). */
export function ratingFrom(v: string): MyRating | undefined {
  const s = clean(v);
  if (!s) return undefined;
  const word = ratingWord(s) ?? RATING_WORDS.find(([words]) => words.some((w) => /^[a-z ]+$/.test(w) && new RegExp(`\\b${w}\\b`).test(s)));
  if (word) return word[1];
  const stars = (v.match(/★/g)?.length ?? 0) + (v.includes('½') ? 0.5 : 0);
  if (stars) return fromFraction(stars / 5);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:(?:\/|out of)\s*(\d+))?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const scale = m[2] ? Number(m[2]) : n <= 5 ? 5 : n <= 10 ? 10 : 100;
  return n > 0 && n <= scale ? fromFraction(n / scale) : undefined;
}

function languageFrom(v: string): string | undefined {
  const s = v.trim().toLowerCase();
  return LANGUAGES.find((l) => l.code === s || l.name.toLowerCase() === s || l.native === v.trim())?.code ?? (/^[a-z]{2}$/.test(s) ? s : undefined);
}

function runtimeFrom(v: string): number | undefined {
  const s = v.trim().toLowerCase();
  const hm = s.match(/^(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/);
  if (hm && (hm[1] || hm[2])) return Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0);
  return /^\d{1,4}$/.test(s) ? Number(s) : undefined;
}

const GENRE_IDS = new Map<string, number>([
  ...Object.entries(TV_GENRES).map(([id, n]) => [n.toLowerCase(), Number(id)] as [string, number]),
  ...Object.entries(MOVIE_GENRES).map(([id, n]) => [n.toLowerCase(), Number(id)] as [string, number]),
  ['sci-fi', 878],
  ['scifi', 878],
  ['romcom', 10749],
]);

const genresFrom = (v: string) => [...new Set(v.split(/[,/|;]/).map((g) => GENRE_IDS.get(g.trim().toLowerCase())).filter((g): g is number => !!g))];

const YEAR = /\b(18[89]\d|19\d\d|20[0-4]\d)\b/;

function applyUrl(row: Partial<MdRow>, url: string) {
  const tmdb = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
  if (tmdb) {
    row.type ??= tmdb[1] as MediaType;
    row.tmdbId ??= Number(tmdb[2]);
    return;
  }
  const imdb = url.match(/imdb\.com\/title\/(tt\d{6,})/);
  if (imdb) {
    row.imdbId ??= imdb[1];
    return;
  }
  row.url ??= safeUrl(url);
}

function applyField(row: Partial<MdRow>, field: Field, value: string) {
  const v = value.trim();
  if (!v) return;
  switch (field) {
    case 'title':
      row.title = v;
      break;
    case 'rating':
      row.rating = ratingFrom(v) ?? row.rating;
      break;
    case 'tmdb': {
      const m = v.match(/(?:(movie|tv)\s*[/:]\s*)?(\d+)/i);
      if (m) {
        row.tmdbId = Number(m[2]);
        if (m[1]) row.type = m[1].toLowerCase() as MediaType;
      }
      break;
    }
    case 'imdb':
      row.imdbId = v.match(/tt\d{6,}/)?.[0] ?? row.imdbId;
      break;
    case 'type':
      row.type = typeFrom(v) ?? row.type;
      break;
    case 'year':
      row.year = Number(v.match(YEAR)?.[1]) || row.year;
      break;
    case 'url':
      applyUrl(row, v);
      break;
    case 'original':
      row.originalTitle = v;
      break;
    case 'language':
      row.originalLanguage = languageFrom(v) ?? row.originalLanguage;
      break;
    case 'runtime':
      row.runtime = runtimeFrom(v) ?? row.runtime;
      break;
    case 'genres':
      row.genreIds = genresFrom(v);
      break;
    case 'director':
      row.director = v;
      break;
    case 'cast':
      row.cast = splitNames(v);
      break;
    case 'overview':
      row.overview = row.overview ? `${row.overview}\n${v}` : v;
      break;
    case 'list':
      row.list = listFor(v);
      break;
    case 'custom':
      row.custom = !/^(no|false|0)$/i.test(v);
      break;
  }
}

/** A bare segment like "2019", "tv", "👍", "Tamil", "2h 10m", "tt0111161" or "custom". Returns false if it means nothing. */
function applyToken(row: Partial<MdRow>, seg: string): boolean {
  const s = seg.trim().replace(/^\((.*)\)$/, '$1').trim();
  const year = s.match(/^((?:18|19|20)\d\d)(?:\s*[–-]\s*(?:(?:18|19|20)\d\d)?)?$/);
  if (year) return ((row.year ??= Number(year[1])), true);
  const type = TV_WORDS.test(s) ? 'tv' : MOVIE_WORDS.test(s) ? 'movie' : undefined;
  if (type) return ((row.type ??= type), true);
  if (/^custom$/i.test(s)) return ((row.custom = true), true);
  if (/^tt\d{6,}$/.test(s)) return ((row.imdbId ??= s), true);
  if (ratingWord(clean(s)) || /^[★☆½]+$/.test(s) || /^\d+(\.\d)?\s*\/\s*(5|10)$/.test(s)) return ((row.rating ??= ratingFrom(s)), true);
  const lang = LANGUAGES.find((l) => l.name.toLowerCase() === s.toLowerCase() || l.native === s);
  if (lang) return ((row.originalLanguage ??= lang.code), true);
  if (/\d/.test(s) && /[hm]/i.test(s) && runtimeFrom(s)) return ((row.runtime ??= runtimeFrom(s)), true);
  return false;
}

/** Strips a trailing "(2019)", "[2019]", "(TV Series 2020–2023)" or "(Tamil)" group from a title, applying what it says. */
function peelTitle(row: Partial<MdRow>, title: string): string {
  let t = title.trim();
  for (let i = 0; i < 2; i++) {
    const m = t.match(/^(.+?)\s*[([]([^()[\]]+)[)\]]$/);
    if (!m) break;
    const words = m[2].split(/[\s,;/]+/).filter((w) => w && !/^[–-]$/.test(w));
    const probe: Partial<MdRow> = {};
    const joined = m[2].trim();
    const ok = applyToken(probe, joined) || (words.length > 0 && words.every((w) => applyToken(probe, w) || /^(tv|mini|web)$/i.test(w)) && (probe.year || probe.type || probe.originalLanguage));
    if (!ok || (probe.year && row.year && probe.year !== row.year)) break;
    if (/^(tv|mini|web)\b/i.test(joined) && !probe.type) probe.type = 'tv';
    Object.assign(row, Object.fromEntries(Object.entries(probe).filter(([k]) => row[k as keyof MdRow] === undefined)));
    t = m[1].trim();
  }
  // "Title, 2019"
  const comma = t.match(/^(.+?),\s*((?:18|19|20)\d\d)$/);
  if (comma) {
    row.year ??= Number(comma[2]);
    t = comma[1].trim();
  }
  return t;
}

const SPLIT = /\s+[·•|]\s+|\s+[—–]\s+|\t+|\s+-\s+(?=\(?(?:18|19|20)\d\d\b|(?:movie|film|tv|series|show|rating|tmdb|imdb|custom|url|notes?)\b)|(?<=(?:18|19|20)\d\d\)?)\s+-\s+/i;

/** Parses one list line (without its bullet). Returns null when there's no title. */
export function parseLine(text: string, list = 'watchlist'): Omit<MdRow, 'line' | 'raw'> | null {
  const row: Partial<MdRow> = { list };
  let s = text.trim().replace(/^\[[ xX]\]\s+/, '');
  s = s.replace(/!?\[([^\]]+)\]\((\S+?)\)/g, (_, label: string, url: string) => (applyUrl(row, url), label));
  s = s.replace(/<?(https?:\/\/[^\s>)]+)>?/g, (_, url: string) => (applyUrl(row, url), ' '));
  s = s.replace(/(\*\*|__|`)(.+?)\1/g, '$2').replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, '$1$2').replace(/\s+/g, ' ').trim();
  s = s.replace(/(\s+[·•|—–-])+$/, '').trim(); // a separator left behind by a removed link
  const parts = s.split(SPLIT).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const seg of parts.slice(1)) {
    const kv = seg.match(/^([\p{L} _]{2,24}?)\s*[:=]\s*(.*)$/u);
    const field = kv && keyOf(kv[1]);
    if (field && kv) applyField(row, field, kv[2]);
    else applyToken(row, seg);
  }
  // A leading "Title: Foo" or "1. Foo" stays as the title.
  const title = peelTitle(row, parts[0].replace(/^title\s*:\s*/i, '').replace(/^["“](.+)["”]$/, '$1'));
  if (!title || /^[-–—\s]*$/.test(title)) return null;
  row.title = title;
  return row as Omit<MdRow, 'line' | 'raw'>;
}

const BULLET = /^\s*(?:[-*+•]|\d{1,4}[.)])\s+(.+)$/;
const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_HEADING = /^(?:\*\*|__)([^*_]{1,60})(?:\*\*|__):?$/;
const COLON_HEADING = /^([^:|]{1,50}):$/;

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** Splits one CSV line, honouring quotes. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Rows from a table whose columns are already split (Markdown table or CSV). */
function tableRow(cells: string[], cols: (Field | undefined)[], list: string, line: number, raw: string): MdRow | null {
  const row: Partial<MdRow> = { list };
  const extra: string[] = [];
  cells.forEach((c, k) => {
    const field = cols[k];
    if (field === 'title') row.title = c;
    else if (field) applyField(row, field, c);
    else if (c) extra.push(c);
  });
  const parsed = row.title ? parseLine([row.title, ...extra].join(' · '), row.list) : null;
  if (!parsed) return null;
  const fields = Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && k !== 'title'));
  return { ...parsed, ...fields, title: parsed.title, line, raw: raw.trim() };
}

/** IMDb, Letterboxd and similar CSV exports: a header row with a Title/Name column. */
function parseCsv(lines: string[], list: string): MdRow[] | null {
  const first = lines.findIndex((l) => l.trim());
  if (first < 0 || !lines[first].includes(',')) return null;
  const header = csvCells(lines[first]).map((c) => keyOf(c));
  if (!header.includes('title')) return null;
  const rows: MdRow[] = [];
  lines.forEach((raw, i) => {
    if (i <= first || !raw.trim()) return;
    const row = tableRow(csvCells(raw), header, list, i + 1, raw);
    if (row) rows.push(row);
  });
  return rows;
}

/**
 * Parses MovieMango Markdown (and most loose lists of titles, Markdown tables and IMDb/Letterboxd CSVs).
 * Titles before any heading go to `defaultList`. Keeps at most `max` rows.
 */
export function parseMarkdown(text: string, max = MAX_IMPORT_ROWS, defaultList = 'watchlist'): MdParseResult {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
  const lines = src.split('\n');
  const csv = parseCsv(lines, defaultList);
  if (csv) return { rows: csv.slice(0, max), total: csv.length, truncated: csv.length > max };
  const rows: MdRow[] = [];
  const plain: MdRow[] = [];
  let list = defaultList;
  let table: (Field | undefined)[] | null = null;
  let last: MdRow | null = null;

  const push = (target: MdRow[], text: string, i: number, raw: string) => {
    const r = parseLine(text, list);
    if (!r) return null;
    const row = { ...r, line: i + 1, raw: raw.trim() };
    target.push(row);
    return row;
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      table = null;
      return;
    }
    if (!line || /^(-{3,}|={3,}|\*{3,})$/.test(line)) {
      table = null;
      if (!line) last = null;
      return;
    }
    const quote = raw.match(/^\s*>\s?(.*)$/);
    if (quote) {
      // An indented "> text" right under a title is its description.
      if (last && quote[1].trim()) last.overview = last.overview ? `${last.overview}\n${quote[1].trim()}` : quote[1].trim();
      return;
    }
    const heading = line.match(HEADING) ?? line.match(BOLD_HEADING);
    if (heading) {
      list = listFor(heading[1].replace(/(\*\*|__)/g, ''));
      table = null;
      last = null;
      return;
    }
    if (line.startsWith('|') || (table && line.includes('|'))) {
      const cells = splitCells(line);
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) return;
      if (!table) {
        const cols = cells.map((c) => keyOf(c.replace(/[*_`]/g, '')));
        table = cols.includes('title') ? cols : ['title', ...cols.slice(1)];
        if (cols.some(Boolean)) return; // a header row
      }
      const row = tableRow(cells, table, list, i + 1, raw);
      if (row) rows.push(row);
      last = row;
      return;
    }
    table = null;
    const bullet = raw.match(BULLET);
    if (bullet) {
      last = push(rows, bullet[1], i, raw);
      return;
    }
    if (COLON_HEADING.test(line) && !/https?:/.test(line)) {
      list = listFor(line.slice(0, -1));
      last = null;
      return;
    }
    // Plain lines count only when the whole text is a bare list of titles (no bullets or tables).
    if (line.length <= 150 && (!/[.!?]$/.test(line) || line.split(/\s+/).length <= 8)) last = push(plain, line, i, raw);
  });

  const all = rows.length ? rows : plain;
  return { rows: all.slice(0, max), total: all.length, truncated: all.length > max };
}

// ---------------------------------------------------------------- export

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\s+·\s+/g, ' - ').trim();

/** One Markdown bullet for a saved title; custom titles carry their details so an import restores them. */
export function itemToMarkdown(item: UserItem): string {
  const parts = [`- ${oneLine(item.title)}${item.year ? ` (${item.year})` : ''}`, item.type];
  if (item.rating) parts.push(`rating: ${item.rating}`);
  if (!isCustom(item)) {
    parts.push(`tmdb: ${item.tmdbId}`);
    return parts.join(' · ');
  }
  const c = item.custom ?? {};
  parts.push('custom');
  if (c.originalTitle) parts.push(`original: ${oneLine(c.originalTitle)}`);
  if (item.originalLanguage) parts.push(`lang: ${item.originalLanguage}`);
  if (item.runtime) parts.push(`runtime: ${item.runtime}`);
  if (item.genreIds.length) parts.push(`genres: ${item.genreIds.map(genreName).join(', ')}`);
  if (c.director) parts.push(`director: ${oneLine(c.director)}`);
  if (c.cast?.length) parts.push(`cast: ${c.cast.map(oneLine).join(', ')}`);
  if (c.url) parts.push(`url: ${c.url}`);
  const about = c.overview?.split(/\n+/).map((l) => `  > ${l.trim()}`).filter((l) => l.length > 4) ?? [];
  return [parts.join(' · '), ...about].join('\n');
}

export function markdownHeader(date = new Date()) {
  return [
    `<!-- MovieMango export · ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${APP_URL}`,
    'Each heading is a list. Each line is a title: "- Title (year) · movie|tv · rating: dislike|like|love · tmdb: id".',
    'Edit it by hand or with an AI, then bring it back on the Import page.',
    `${CREDITS} -->`,
  ].join('\n');
}

/** Lists as MovieMango Markdown. Empty lists are left out when there's more than one. */
export function listsToMarkdown(sections: { name: string; items: UserItem[] }[], date = new Date()): string {
  const shown = sections.length > 1 ? sections.filter((s) => s.items.length) : sections;
  return [markdownHeader(date), ...shown.map((s) => [`# ${oneLine(s.name)}`, ...s.items.map(itemToMarkdown)].join('\n'))].join('\n\n') + '\n';
}

export const MARKDOWN_SAMPLE = `# Watchlist
- Kaithi (2019) · movie
- Paatal Lok (2020) · tv
- Super Deluxe (2019) · movie · tmdb: 550776
- The Shawshank Redemption · imdb: tt0111161

# Watched
- Jailer (2023) · movie · rating: love
- Kaathal (2023) · movie · rating: like

## Rainy day comfort
- Om Shanti Om (2007)
- Our Wedding Video (2018) · movie · custom · url: https://example.com/wedding
  > Optional description for your own title.`;

export const AI_PROMPT = `Convert my list below into MovieMango Markdown.
Rules:
- One title per line: "- Title (Year) · movie" or "- Title (Year) · tv".
- Put titles under a heading for their list: "# Watchlist", "# Watched", "# Not for me", or another name for my own list.
- If I rated a title, add "· rating: " and one of dislike, like or love. Map star ratings: top marks are love, good is like, bad is dislike, middling gets no rating.
- If an IMDb ID (tt…) or TMDB ID is given, add "· imdb: tt…" or "· tmdb: 123".
- Don't add titles that aren't in my list, and don't guess missing years.
- Reply with the Markdown only.

My list:
`;
