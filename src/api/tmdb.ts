import { cached, DAY, getJson, HOUR, HttpError } from './http';
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

async function rawGet<T>(path: string, params: Record<string, string | number | undefined>, token: string): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const init = authorise(url, token);
  try {
    return await getJson<T>(url.toString(), init);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw new TmdbAuthError('Your TMDB key was rejected. Check it in Settings.');
    throw e;
  }
}

export async function tmdbGet<T>(path: string, params: Record<string, string | number | undefined> = {}, ttlMs = DAY): Promise<T> {
  const { tmdbToken } = await getSettings();
  if (!tmdbToken) throw new TmdbAuthError('Add your free TMDB key in Settings to search and get picks.');
  const key = `tmdb:${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString()}`;
  return cached(key, ttlMs, () => rawGet<T>(path, params, tmdbToken));
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

export function getDetails(type: MediaType, id: number) {
  const append =
    type === 'movie'
      ? 'credits,videos,watch/providers,release_dates,keywords,external_ids,recommendations'
      : 'credits,videos,watch/providers,content_ratings,keywords,external_ids,recommendations';
  return tmdbGet<TmdbDetails>(`/${type}/${id}`, { append_to_response: append, language: TMDB_LANGUAGE }, 3 * DAY);
}

export function getRecommendations(type: MediaType, id: number, page = 1) {
  return tmdbGet<TmdbPage>(`/${type}/${id}/recommendations`, { page, language: TMDB_LANGUAGE }, 3 * DAY);
}

export function discover(type: MediaType, params: Record<string, string | number | undefined>) {
  return tmdbGet<TmdbPage>(`/discover/${type}`, { include_adult: 'false', language: TMDB_LANGUAGE, ...params }, 12 * HOUR);
}

export function getWatchProviderCatalogue(type: MediaType, region: string) {
  return tmdbGet<{ results: TmdbProvider[] }>(`/watch/providers/${type}`, { watch_region: region, language: TMDB_LANGUAGE }, 7 * DAY);
}

export function getSeason(tvId: number, season: number) {
  return tmdbGet<{ episodes: { episode_number: number; name: string; air_date?: string; runtime?: number }[] }>(
    `/tv/${tvId}/season/${season}`,
    { language: TMDB_LANGUAGE },
    DAY,
  );
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
  return tmdbGet<TmdbPage>(`/trending/all/${window}`, { language: TMDB_LANGUAGE }, 6 * HOUR);
}

/** Search one type, optionally narrowed to a release year (for imports). */
export function searchTitles(type: MediaType, query: string, year?: number) {
  const yearParam = year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: year } : {};
  return tmdbGet<TmdbPage>(`/search/${type}`, { query, include_adult: 'false', language: TMDB_LANGUAGE, ...yearParam }, DAY);
}

/** Looks up a title by its IMDb id (tt…). */
export function findByImdb(imdbId: string) {
  return tmdbGet<{ movie_results: TmdbListItem[]; tv_results: TmdbListItem[] }>(`/find/${imdbId}`, { external_source: 'imdb_id', language: TMDB_LANGUAGE }, 7 * DAY);
}

/** Basic details without the extras (for imports by TMDB id). Never call it with a custom title's negative id. */
export function getTitleBasics(type: MediaType, id: number) {
  return tmdbGet<TmdbDetails>(`/${type}/${id}`, { language: TMDB_LANGUAGE }, 3 * DAY);
}
