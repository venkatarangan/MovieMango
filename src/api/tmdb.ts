import { cached, DAY, FAILURE_COOLDOWN_MS, getJson, HOUR, HttpError, isOffline, isTransientError, type CacheOptions } from './http';
import { coreFreshMs, PROVIDERS_FRESH_MS, readRecent, saveRecent, touchRecent } from './recent';
import { onCacheReset } from '../db';
import { getSettings } from '../db/settings';
import type { MediaType, TitleSnapshot } from '../lib/types';

const BASE = 'https://api.themoviedb.org/3';
export const TMDB_LANGUAGE = 'en-US';

export class TmdbAuthError extends Error {}

export interface TmdbListItem {
  id: number;
  media_type?: MediaType | 'person';
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export interface TmdbPage<T = TmdbListItem> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority?: number;
}

export interface TmdbRegionProviders {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

export interface TmdbDetails extends TmdbListItem {
  genres: { id: number; name: string }[];
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  tagline?: string;
  status?: string;
  spoken_languages?: { iso_639_1: string; english_name: string }[];
  credits?: {
    cast: { id: number; name: string; character?: string; profile_path?: string | null; order?: number }[];
    crew: { id: number; name: string; job: string }[];
  };
  created_by?: { id: number; name: string }[];
  videos?: { results: { key: string; site: string; type: string; official?: boolean; name: string }[] };
  'watch/providers'?: { results: Record<string, TmdbRegionProviders> };
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] };
  keywords?: { keywords?: { id: number; name: string }[]; results?: { id: number; name: string }[] };
  external_ids?: { imdb_id?: string | null; wikidata_id?: string | null };
  recommendations?: TmdbPage;
  similar?: TmdbPage;
}

/** v4 "API Read Access Token" is a long JWT; v3 "API Key" is 32 hex chars. Either works. */
export function isBearerToken(token: string) {
  return token.startsWith('eyJ') || token.length > 60;
}

function authorise(url: URL, token: string): RequestInit {
  if (isBearerToken(token)) return { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } };
  url.searchParams.set('api_key', token);
  return { headers: { accept: 'application/json' } };
}

type Params = Record<string, string | number | undefined>;

/** Params whose values are OR (`|`) or AND (`,`) lists, where order doesn't change TMDB's answer. */
const LIST_PARAM = /^(with_|without_)|^(append_to_response|certification)$/;

function sortList(v: string) {
  if (v.includes('|') && !v.includes(',')) return v.split('|').sort().join('|');
  if (v.includes(',') && !v.includes('|')) return v.split(',').sort().join(',');
  return v;
}

/** Drops empty params and sorts keys and id lists, so equivalent requests share one URL and one cache row. */
export function normaliseParams(params: Params): [string, string][] {
  return Object.entries(params)
    .filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]): [string, string] => [k, LIST_PARAM.test(k) ? sortList(String(v)) : String(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export const tmdbCacheKey = (path: string, params: Params = {}) => `tmdb:${path}?${new URLSearchParams(normaliseParams(params)).toString()}`;

/** Dev only: `window.__tmdbCalls` counts real TMDB requests ({ total, byPath }), and each is logged with console.debug. */
function countCall(path: string) {
  if (!import.meta.env.DEV) return;
  const g = globalThis as { __tmdbCalls?: { total: number; byPath: Record<string, number> } };
  const c = (g.__tmdbCalls ??= { total: 0, byPath: {} });
  const kind = path.replace(/\/\d+/g, '/:id');
  c.total++;
  c.byPath[kind] = (c.byPath[kind] ?? 0) + 1;
  if (import.meta.env.MODE !== 'test') console.debug(`[tmdb] #${c.total} ${path}`);
}

async function rawGet<T>(path: string, params: Params, token: string): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of normaliseParams(params)) url.searchParams.set(k, v);
  const init = authorise(url, token);
  countCall(path);
  try {
    return await getJson<T>(url.toString(), init);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw new TmdbAuthError('Your TMDB key was rejected. Check it in Settings.');
    throw e;
  }
}

async function tokenOrThrow(): Promise<string> {
  const { tmdbToken } = await getSettings();
  if (!tmdbToken) throw new TmdbAuthError('Add your free TMDB key in Settings to search and get picks.');
  return tmdbToken;
}

export async function tmdbGet<T>(path: string, params: Params = {}, ttlMs = DAY, opts?: CacheOptions<T>): Promise<T> {
  const token = await tokenOrThrow();
  return cached(tmdbCacheKey(path, params), ttlMs, () => rawGet<T>(path, params, token), opts);
}

/** Checks a key or token before saving it. */
export async function validateTmdbToken(token: string): Promise<boolean> {
  try {
    await rawGet('/configuration', {}, token.trim());
    return true;
  } catch (e) {
    if (e instanceof TmdbAuthError) return false;
    throw e;
  }
}

export function searchMulti(query: string, page = 1) {
  return tmdbGet<TmdbPage>('/search/multi', { query, page, include_adult: 'false', language: TMDB_LANGUAGE, region: 'IN' }, HOUR);
}

// --- Details: served from the recent-titles store (src/api/recent.ts), not the general cache. ---

const DETAILS_APPEND: Record<MediaType, string> = {
  movie: 'credits,videos,watch/providers,release_dates,keywords,external_ids,recommendations',
  tv: 'credits,videos,watch/providers,content_ratings,keywords,external_ids,recommendations',
};

type ProvidersByRegion = Record<string, TmdbRegionProviders>;

const detailsInflight = new Map<string, Promise<TmdbDetails>>();
const providersInflight = new Map<string, Promise<ProvidersByRegion>>();
/** After a failed refresh, don't retry that title until this time (memory only). */
const coolUntil = new Map<string, number>();
const cooling = (k: string, now = Date.now()) => (coolUntil.get(k) ?? 0) > now;
const coolDown = (k: string) => coolUntil.set(k, Date.now() + FAILURE_COOLDOWN_MS);
onCacheReset(() => coolUntil.clear());

function fetchDetails(type: MediaType, id: number): Promise<TmdbDetails> {
  const key = `${type}:${id}`;
  let p = detailsInflight.get(key);
  if (!p) {
    p = (async () => {
      const data = await rawGet<TmdbDetails>(`/${type}/${id}`, { append_to_response: DETAILS_APPEND[type], language: TMDB_LANGUAGE }, await tokenOrThrow());
      const now = Date.now();
      await saveRecent({ key, data, fetchedAt: now, providersAt: now, accessedAt: now });
      return data;
    })().finally(() => detailsInflight.delete(key));
    detailsInflight.set(key, p);
  }
  return p;
}

/** Fetches just the watch-provider block (a small request) and patches it into the stored details, if any. */
function fetchProviders(type: MediaType, id: number): Promise<ProvidersByRegion> {
  const key = `${type}:${id}`;
  let p = providersInflight.get(key);
  if (!p) {
    p = (async () => {
      const res = await rawGet<{ results?: ProvidersByRegion }>(`/${type}/${id}/watch/providers`, {}, await tokenOrThrow());
      const results = res.results ?? {};
      const row = await readRecent(key);
      if (row) await saveRecent({ ...row, data: { ...(row.data as TmdbDetails), 'watch/providers': { results } }, providersAt: Date.now() });
      return results;
    })().finally(() => providersInflight.delete(key));
    providersInflight.set(key, p);
  }
  return p;
}

/**
 * Full details. Served from the recent-titles store while core data is fresh (30 days; 7 for running shows and
 * new movies); stale watch providers (> 2 days) are refreshed in the background. Stale data is returned when
 * offline, rate-limited or TMDB fails.
 */
export async function getDetails(type: MediaType, id: number): Promise<TmdbDetails> {
  const key = `${type}:${id}`;
  const row = await readRecent(key);
  if (!row) return fetchDetails(type, id);
  const now = Date.now();
  const data = row.data as TmdbDetails;
  if (now - row.fetchedAt < coreFreshMs(data, now) || isOffline() || cooling(`d:${key}`, now)) {
    touchRecent(row, now);
    if (now - row.providersAt >= PROVIDERS_FRESH_MS && !isOffline() && !cooling(`p:${key}`, now))
      fetchProviders(type, id).catch(() => coolDown(`p:${key}`));
    return data;
  }
  try {
    return await fetchDetails(type, id);
  } catch (e) {
    if (!isTransientError(e)) throw e;
    coolDown(`d:${key}`);
    touchRecent(row);
    return data;
  }
}

/** Stored details for a title, without any network request (undefined if it isn't in the recent store). */
export async function peekDetails(type: MediaType, id: number): Promise<TmdbDetails | undefined> {
  return (await readRecent(`${type}:${id}`))?.data as TmdbDetails | undefined;
}

/** Watch providers for every region (index by `'IN'`). Uses the recent store when fresh, else one small request. */
export async function getWatchProviders(type: MediaType, id: number): Promise<ProvidersByRegion> {
  const key = `${type}:${id}`;
  const row = await readRecent(key);
  const stored = (row?.data as TmdbDetails | undefined)?.['watch/providers']?.results;
  if (!row || !stored) {
    const res = await tmdbGet<{ results?: ProvidersByRegion }>(`/${type}/${id}/watch/providers`, {}, PROVIDERS_FRESH_MS);
    return res.results ?? {};
  }
  const now = Date.now();
  if (now - row.providersAt < PROVIDERS_FRESH_MS || isOffline() || cooling(`p:${key}`, now)) return stored;
  try {
    return await fetchProviders(type, id);
  } catch (e) {
    if (!isTransientError(e)) throw e;
    coolDown(`p:${key}`);
    return stored;
  }
}

/** Page 1 comes free with stored details (they append `recommendations`); otherwise cached for 7 days. */
export async function getRecommendations(type: MediaType, id: number, page = 1): Promise<TmdbPage> {
  if (page === 1) {
    const row = await readRecent(`${type}:${id}`);
    const recs = (row?.data as TmdbDetails | undefined)?.recommendations;
    if (row && recs) {
      touchRecent(row);
      return recs;
    }
  }
  return tmdbGet<TmdbPage>(`/${type}/${id}/recommendations`, { page, language: TMDB_LANGUAGE }, 7 * DAY, { swrMs: 30 * DAY });
}

export function discover(type: MediaType, params: Record<string, string | number | undefined>) {
  return tmdbGet<TmdbPage>(`/discover/${type}`, { include_adult: 'false', language: TMDB_LANGUAGE, ...params }, 12 * HOUR, { swrMs: 3 * DAY });
}

export function getWatchProviderCatalogue(type: MediaType, region: string) {
  return tmdbGet<{ results: TmdbProvider[] }>(`/watch/providers/${type}`, { watch_region: region, language: TMDB_LANGUAGE }, 7 * DAY, { swrMs: 60 * DAY });
}

type Season = { episodes: { episode_number: number; name: string; air_date?: string; runtime?: number }[] };

/** A season whose last episode aired over 60 days ago won't change: keep it 30 days instead of 1. */
export function seasonTtl(s: Season, now = Date.now()): number {
  const dates = (s.episodes ?? []).map((e) => (e.air_date ? Date.parse(e.air_date) : NaN));
  if (!dates.length || dates.some(Number.isNaN)) return DAY;
  return now - Math.max(...dates) > 60 * DAY ? 30 * DAY : DAY;
}

export function getSeason(tvId: number, season: number) {
  return tmdbGet<Season>(`/tv/${tvId}/season/${season}`, { language: TMDB_LANGUAGE }, DAY, { ttlFor: (s) => seasonTtl(s) });
}

export function img(path: string | null | undefined, size: 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w342') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

export const titleOf = (t: TmdbListItem) => t.title ?? t.name ?? t.original_title ?? t.original_name ?? 'Untitled';

export function yearOf(t: TmdbListItem): number | undefined {
  const d = t.release_date || t.first_air_date;
  return d ? Number(d.slice(0, 4)) || undefined : undefined;
}

export function mediaTypeOf(t: TmdbListItem, fallback: MediaType = 'movie'): MediaType {
  if (t.media_type === 'movie' || t.media_type === 'tv') return t.media_type;
  if (t.first_air_date !== undefined || (t.name && !t.title)) return 'tv';
  return fallback;
}

export function runtimeOf(d: TmdbDetails): number | null {
  if (d.runtime) return d.runtime;
  if (d.episode_run_time?.length) return Math.round(d.episode_run_time.reduce((a, b) => a + b, 0) / d.episode_run_time.length);
  return null;
}

/** India certification (CBFC) as reported to TMDB, if any. */
export function certificationOf(d: TmdbDetails, region = 'IN'): string | undefined {
  const rel = d.release_dates?.results.find((r) => r.iso_3166_1 === region);
  const movieCert = rel?.release_dates.map((x) => x.certification).find(Boolean);
  if (movieCert) return movieCert;
  return d.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating || undefined;
}

export function snapshotFromList(t: TmdbListItem, type: MediaType): TitleSnapshot {
  return {
    tmdbId: t.id,
    type,
    title: titleOf(t),
    year: yearOf(t),
    posterPath: t.poster_path ?? null,
    genreIds: t.genre_ids ?? [],
    originalLanguage: t.original_language,
    voteAverage: t.vote_average,
    voteCount: t.vote_count,
  };
}

export function snapshotFromDetails(d: TmdbDetails, type: MediaType): TitleSnapshot {
  const keywords = d.keywords?.keywords ?? d.keywords?.results ?? [];
  const directors = d.credits?.crew.filter((c) => c.job === 'Director').map((c) => c.id) ?? [];
  const creators = d.created_by?.map((c) => c.id) ?? [];
  return {
    tmdbId: d.id,
    type,
    title: titleOf(d),
    year: yearOf(d),
    posterPath: d.poster_path ?? null,
    genreIds: d.genres.map((g) => g.id),
    runtime: runtimeOf(d),
    originalLanguage: d.original_language,
    voteAverage: d.vote_average,
    voteCount: d.vote_count,
    keywordIds: keywords.slice(0, 15).map((k) => k.id),
    peopleIds: [...directors, ...creators, ...(d.credits?.cast.slice(0, 5).map((c) => c.id) ?? [])],
  };
}

export function trending(window: 'day' | 'week' = 'week') {
  return tmdbGet<TmdbPage>(`/trending/all/${window}`, { language: TMDB_LANGUAGE }, 6 * HOUR, { swrMs: DAY });
}
