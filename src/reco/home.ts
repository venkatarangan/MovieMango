import { discover, getDetails, getWatchProviderCatalogue, snapshotFromList } from '../api/tmdb';
import { db } from '../db';
import type { Settings } from '../db/settings';
import { MOVIE_GENRES, TV_GENRES } from '../lib/genres';
import { otherLanguages } from '../lib/languages';
import { availabilityFrom, resolveProviderIds, type Availability } from '../lib/providers';
import type { MediaType, TitleSnapshot, UserItem } from '../lib/types';
import { defaultMinutes } from './moods';
import { buildProfile, topGenres } from './profile';
import { planTonight, type TonightInput, type TonightResult } from './tonight';

/** Small seeded PRNG so a shuffle stays stable for one Home visit. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function shuffle<T>(list: T[], seed: number): T[] {
  const rand = seeded(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function myProviderIds(type: MediaType, settings: Settings) {
  const catalogue = await getWatchProviderCatalogue(type, settings.region).catch(() => ({ results: [] }));
  const ids = resolveProviderIds(catalogue.results);
  return [...new Set(settings.services.flatMap((k) => ids[k] ?? []))];
}

/**
 * Random, well-liked titles on the user's services in their languages. The seed picks one of
 * six discover pages (3 pages × 2 sort orders), so repeat visits mostly reuse cached responses.
 */
export async function randomShelf(type: MediaType, settings: Settings, seed: number): Promise<TitleSnapshot[]> {
  const providers = await myProviderIds(type, settings);
  const acclaimed = seed % 2 === 1;
  const res = await discover(type, {
    watch_region: settings.region,
    with_watch_providers: providers.join('|'),
    with_watch_monetization_types: 'flatrate|free|ads',
    with_original_language: settings.languages.join('|'),
    sort_by: acclaimed ? 'vote_average.desc' : 'popularity.desc',
    'vote_count.gte': acclaimed ? 100 : 20,
    page: 1 + (Math.floor(seed / 2) % 3),
  });
  return shuffle(res.results.filter((r) => r.poster_path).map((r) => snapshotFromList(r, type)), seed);
}

/** Movies and shows from one discover call per type, interleaved so neither crowds out the other. */
async function mixedShelf(settings: Settings, params: (type: MediaType) => Record<string, string | number | undefined> | null): Promise<TitleSnapshot[]> {
  const lists = await Promise.all(
    (['movie', 'tv'] as const).map(async (type) => {
      const p = params(type);
      if (!p) return [];
      const providers = await myProviderIds(type, settings);
      const base = { watch_region: settings.region, with_watch_providers: providers.join('|'), with_watch_monetization_types: 'flatrate|free|ads' };
      const res = await discover(type, { ...base, ...p }).catch(() => ({ results: [] }));
      return res.results.filter((r) => r.poster_path).map((r) => snapshotFromList(r, type));
    }),
  );
  const out: TitleSnapshot[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/**
 * World picks: acclaimed titles in languages the user didn't choose, on their services, in their
 * favourite genres (by 👍 ❤️ and watched). Falls back to any genre when that's too narrow.
 */
export async function worldShelf(settings: Settings, items: UserItem[], seed: number): Promise<TitleSnapshot[]> {
  const others = otherLanguages(settings.languages).join('|');
  const genres = topGenres(buildProfile(items), 3);
  const page = 1 + (seed % 2);
  const params = (withGenres: boolean) => (type: MediaType) => {
    const valid = genres.filter((g) => (type === 'movie' ? MOVIE_GENRES : TV_GENRES)[g]);
    if (withGenres && !valid.length) return null;
    return {
      with_original_language: others,
      with_genres: withGenres ? valid.join('|') : undefined,
      sort_by: 'vote_average.desc',
      'vote_count.gte': type === 'movie' ? 200 : 100,
      page,
    };
  };
  let list = genres.length ? await mixedShelf(settings, params(true)) : [];
  if (list.length < 8) list = [...list, ...(await mixedShelf(settings, params(false)))];
  const seen = new Set<string>();
  return shuffle(list.filter((s) => !seen.has(`${s.type}:${s.tmdbId}`) && seen.add(`${s.type}:${s.tmdbId}`)), seed);
}

/** A different language each week (Monday to Sunday), from the ones the user doesn't usually watch. */
export function languageOfWeek(mine: string[], date = new Date(), offset = 0): string | undefined {
  const others = otherLanguages(mine);
  if (!others.length) return undefined;
  // Days since 1970-01-05, a Monday.
  const week = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1970, 0, 5)) / (7 * 864e5));
  return others[(week + offset) % others.length];
}

/** The best-rated titles in this week's language on the user's services; tries the next language if none stream. */
export async function languageShelf(settings: Settings, date = new Date()): Promise<{ language: string; titles: TitleSnapshot[] } | null> {
  for (let offset = 0; offset < 3; offset++) {
    const language = languageOfWeek(settings.languages, date, offset);
    if (!language) return null;
    const titles = await mixedShelf(settings, (type) => ({ with_original_language: language, sort_by: 'vote_average.desc', 'vote_count.gte': type === 'movie' ? 50 : 20 }));
    if (titles.length >= 4) return { language, titles };
  }
  return null;
}

/** Tonight's pipeline without AI, with time-of-day defaults and a smaller shortlist: instant "feeling lucky" picks. */
export function luckyPicks(settings: Settings, items: UserItem[], round = 0): Promise<TonightResult> {
  const input: TonightInput = { minutes: defaultMinutes(), discovery: round % 2 ? 'surprise' : 'new', audience: 'solo', type: 'either' };
  return planTonight(input, settings, items, null, undefined, { enrich: 12 });
}

export interface StreamingNow {
  item: UserItem;
  availability: Availability[];
  /** A service that wasn't showing this title the last time we checked. */
  isNew: boolean;
}

const SEEN_KEY = 'streamSeen';
const STREAM_CHECK_LIMIT = 24;
const NEW_FOR_MS = 7 * 24 * 3600_000;

interface Seen {
  keys: string[];
  /** When a service last appeared that hadn't carried the title before. */
  newAt?: number;
}

async function pLimit<T, R>(list: T[], limit: number, fn: (t: T) => Promise<R>): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]).catch(() => undefined);
      }
    }),
  );
  return out;
}

/**
 * Watchlist titles streaming on the user's services, newest arrivals first. Remembers which
 * services carried each title (on this device only), so one that arrives later shows as "New" for a week.
 */
export async function streamingNow(items: UserItem[], settings: Settings, now = Date.now()): Promise<StreamingNow[]> {
  const watchlist = items
    .filter((i) => i.tmdbId > 0 && i.lists.includes('watchlist') && !i.lists.includes('watched'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, STREAM_CHECK_LIMIT);
  const mine = new Set(settings.services);
  const seen = ((await db.kv.get(SEEN_KEY))?.value as Record<string, Seen> | undefined) ?? {};
  const checked = await pLimit(watchlist, 3, async (item) => {
    const d = await getDetails(item.type, item.tmdbId);
    return { item, availability: availabilityFrom(d['watch/providers']?.results?.[settings.region]).filter((a) => mine.has(a.service.key)) };
  });
  const out: StreamingNow[] = [];
  // Only titles still on the watchlist are remembered; a failed check keeps what we knew.
  const nextSeen: Record<string, Seen> = Object.fromEntries(watchlist.filter((i) => seen[i.key]).map((i) => [i.key, seen[i.key]]));
  for (const c of checked) {
    if (!c) continue;
    const keys = c.availability.map((a) => a.service.key);
    const before = seen[c.item.key];
    const arrived = !!before && keys.some((k) => !before.keys.includes(k));
    const newAt = arrived ? now : before?.newAt;
    nextSeen[c.item.key] = { keys, newAt };
    if (keys.length) out.push({ ...c, isNew: !!newAt && now - newAt < NEW_FOR_MS });
  }
  await db.kv.put({ key: SEEN_KEY, value: nextSeen }).catch(() => undefined);
  return out.sort((a, b) => Number(b.isNew) - Number(a.isNew));
}
