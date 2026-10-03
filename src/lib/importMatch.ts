import { findByImdb, getTitleBasics, searchMulti, searchTitles, TmdbAuthError, titleOf, yearOf, type TmdbListItem } from '../api/tmdb';
import type { MdRow } from './markdown';
import type { MediaType } from './types';

export interface Candidate {
  item: TmdbListItem;
  type: MediaType;
  score: number;
}

/** 'exact': matched by TMDB/IMDb id. 'good': title and year agree. 'check': a guess worth a look. 'none': nothing found. */
export type Confidence = 'exact' | 'good' | 'check' | 'none';

export interface RowMatch {
  candidates: Candidate[];
  confidence: Confidence;
  error?: string;
}

/** Lowercase, no accents, punctuation or leading article: "The Lunchbox!" → "lunchbox". */
export function normTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

/** 1 for the same title, otherwise word overlap (Dice), with a little credit for one containing the other. */
export function titleSimilarity(a: string, b: string): number {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ta = new Set(x.split(' '));
  const tb = new Set(y.split(' '));
  const common = [...ta].filter((t) => tb.has(t)).length;
  const dice = (2 * common) / (ta.size + tb.size);
  const contains = x.includes(y) || y.includes(x) ? 0.75 * (Math.min(x.length, y.length) / Math.max(x.length, y.length)) ** 0.5 : 0;
  return Math.max(dice, contains);
}

/** 0–1: how well a TMDB result fits a parsed row (title, year, type, and a nudge for well-known titles). */
export function scoreCandidate(row: Pick<MdRow, 'title' | 'year' | 'type' | 'originalTitle'>, item: TmdbListItem, type: MediaType): number {
  const names = [titleOf(item), item.original_title, item.original_name].filter((n): n is string => !!n);
  const mine = [row.title, row.originalTitle].filter((n): n is string => !!n);
  const t = Math.max(...mine.flatMap((a) => names.map((b) => titleSimilarity(a, b))));
  const y = yearOf(item);
  const yearPart = !row.year ? 0.1 : !y ? 0.05 : row.year === y ? 0.2 : Math.abs(row.year - y) === 1 ? 0.12 : -0.2;
  const typePart = !row.type ? 0.03 : row.type === type ? 0.05 : -0.2;
  const fame = Math.min(0.05, Math.log10((item.vote_count ?? 0) + 1) / 80);
  return Math.max(0, Math.min(1, 0.7 * t + yearPart + typePart + fame));
}

/** 'good' needs a strong best match that clearly beats the runner-up (two same-named titles need a look). */
export function confidenceOf(candidates: Candidate[]): Confidence {
  const [best, next] = candidates;
  if (!best) return 'none';
  return best.score >= 0.85 && (!next || best.score - next.score > 0.05) ? 'good' : 'check';
}

const ranked = (row: MdRow, items: [TmdbListItem, MediaType][]) => {
  const seen = new Set<string>();
  return items
    .filter(([i, type]) => !seen.has(`${type}:${i.id}`) && !!seen.add(`${type}:${i.id}`))
    .map(([item, type]) => ({ item, type, score: scoreCandidate(row, item, type) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

async function search(row: MdRow, query: string): Promise<[TmdbListItem, MediaType][]> {
  if (!row.type) {
    const r = await searchMulti(query);
    return r.results.filter((i) => i.media_type === 'movie' || i.media_type === 'tv').map((i) => [i, i.media_type as MediaType]);
  }
  let r = await searchTitles(row.type, query, row.year);
  if (!r.results.length && row.year) r = await searchTitles(row.type, query);
  return r.results.map((i) => [i, row.type!]);
}

/** Finds TMDB candidates for one row: by TMDB id, then IMDb id, then title search. Custom rows never touch TMDB. */
export async function matchRow(row: MdRow): Promise<RowMatch> {
  if (row.custom) return { candidates: [], confidence: 'none' };
  try {
    if (row.tmdbId && row.tmdbId > 0) {
      const type = row.type ?? 'movie';
      const d = await getTitleBasics(type, row.tmdbId).catch((e) => {
        if (e instanceof TmdbAuthError) throw e;
        return null;
      });
      if (d) return { candidates: [{ item: d, type, score: 1 }], confidence: 'exact' };
    }
    if (row.imdbId) {
      const f = await findByImdb(row.imdbId);
      const hits: [TmdbListItem, MediaType][] = [...f.movie_results.map((i) => [i, 'movie'] as [TmdbListItem, MediaType]), ...f.tv_results.map((i) => [i, 'tv'] as [TmdbListItem, MediaType])];
      if (hits.length) return { candidates: hits.slice(0, 5).map(([item, type]) => ({ item, type, score: 1 })), confidence: 'exact' };
    }
    let found = await search(row, row.title);
    // "Kaithi 2019" or a title in its own script: try once more without the year, or with the original title.
    const bare = row.title.replace(/\s+\(?(?:18|19|20)\d\d\)?$/, '');
    if (!found.length && bare !== row.title) found = await search({ ...row, year: row.year ?? Number(row.title.slice(-4)) }, bare);
    if (!found.length && row.originalTitle) found = await search(row, row.originalTitle);
    const candidates = ranked(row, found);
    return { candidates, confidence: confidenceOf(candidates) };
  } catch (e) {
    if (e instanceof TmdbAuthError) throw e;
    return { candidates: [], confidence: 'none', error: (e as Error).message || 'Search failed' };
  }
}

/** Runs `fn` over items with a small worker pool, reporting progress. Stops early if `signal` aborts. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>, onProgress?: (done: number) => void, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
