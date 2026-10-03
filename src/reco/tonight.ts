import {
  certificationOf,
  discover,
  getDetails,
  getRecommendations,
  getWatchProviderCatalogue,
  snapshotFromDetails,
  snapshotFromList,
  type TmdbListItem,
} from '../api/tmdb';
import { findReview } from '../api/mangoidiots';
import { newsHeadlines } from '../api/wiki';
import { parseIntent, rerank, type Intent } from '../ai/tasks';
import type { AiEngine } from '../ai/types';
import type { Settings } from '../db/settings';
import { genreName, MOVIE_GENRES, TV_GENRES } from '../lib/genres';
import { languageName } from '../lib/languages';
import { availabilityFrom, resolveProviderIds, type Availability } from '../lib/providers';
import type { MangoRating, MediaType, TitleSnapshot, UserItem } from '../lib/types';
import { formatRuntime } from '../lib/format';
import { buildProfile, topGenres, type TasteProfile } from './profile';
import {
  AUDIENCE_CERTS,
  DEFAULT_WANT,
  partOfDay,
  WANT_GENRES,
  type Audience,
  type Discovery,
  type Minutes,
  type MoodNow,
  type TypeChoice,
  type Want,
} from './moods';
import { dailyJitter, timeFit, totalScore } from './score';

export interface TonightInput {
  minutes: Minutes;
  moodNow?: MoodNow;
  want?: Want;
  discovery: Discovery;
  audience: Audience;
  type: TypeChoice;
  freeText?: string;
}

type Source = 'discover' | 'acclaimed' | 'recommended' | 'serendipity' | 'watchlist' | 'rewatch';

interface Candidate {
  snap: TitleSnapshot;
  overview?: string;
  sources: Set<Source>;
  because?: string;
  availability: Availability[];
  certification?: string;
  mango?: MangoRating;
  score: number;
}

export interface Pick {
  snap: TitleSnapshot;
  overview?: string;
  availability: Availability[];
  certification?: string;
  mango?: MangoRating;
  why: string;
  wildcard?: boolean;
}

export interface TonightResult {
  picks: Pick[];
  engineUsed: 'ai' | 'basic';
  aiError?: string;
  considered: number;
  effective: { minutes: Minutes; discovery: Discovery; audience: Audience; type: TypeChoice; want?: Want; languages: string[] };
}

export type Stage = (text: string) => void;

const PICK_COUNT = 6;
const ENRICH_COUNT = 28;
const RERANK_POOL = 14;

const GENRE_BY_NAME = new Map(
  [...Object.entries(MOVIE_GENRES), ...Object.entries(TV_GENRES)].map(([id, name]) => [name.toLowerCase(), Number(id)]),
);

/** Maps loose words like "romance" or "horror films" to TMDB genre ids. */
export function genresFromWords(words: string[]): number[] {
  const ids = new Set<number>();
  for (const w of words.map((x) => x.toLowerCase())) {
    for (const [name, id] of GENRE_BY_NAME) if (w.includes(name) || name.includes(w.replace(/s$/, ''))) ids.add(id);
    if (/romcom|romantic/.test(w)) ids.add(10749);
    if (/scary|horror/.test(w)) ids.add(27);
    if (/sci-?fi/.test(w)) ids.add(878).add(10765);
  }
  return [...ids];
}

async function pLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

function typesFor(input: TonightInput): MediaType[] {
  if (input.type !== 'either') return [input.type];
  if (input.minutes === 'binge' || input.minutes === 30) return ['tv'];
  return ['movie', 'tv'];
}

/** Applies a parsed free-text request on top of the chips (typed words win). */
export function applyIntent(input: TonightInput, intent: Intent): TonightInput {
  return {
    ...input,
    minutes: intent.minutes ?? input.minutes,
    moodNow: intent.moodNow ?? input.moodNow,
    want: intent.want ?? (intent.moodNow ? DEFAULT_WANT[intent.moodNow] : input.want),
    discovery: intent.discovery ?? input.discovery,
    audience: intent.audience ?? input.audience,
    type: intent.type ?? input.type,
  };
}

function describeProfile(profile: TasteProfile, items: UserItem[], settings: Settings): string {
  const genres = topGenres(profile, 6).map(genreName).join(', ') || 'not known yet';
  const favs = profile.seeds.slice(0, 8).map((i) => `${i.title}${i.year ? ` (${i.year})` : ''}${i.rating ? ` [${i.rating}]` : ''}`);
  const dislikes = items.filter((i) => i.rating === 'rotten' || i.feedback === 'never').slice(0, 5).map((i) => i.title);
  return [
    settings.portrait ? `Taste portrait: ${settings.portrait}` : '',
    `Favourite genres: ${genres}.`,
    `Languages: ${settings.languages.map(languageName).join(', ')}.`,
    favs.length ? `Loves: ${favs.join('; ')}.` : 'No saved favourites yet.',
    dislikes.length ? `Disliked: ${dislikes.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function basicWhy(c: Candidate, input: TonightInput): string {
  const parts: string[] = [];
  if (c.sources.has('watchlist')) parts.push('It’s on your watchlist');
  else if (c.because) parts.push(`Because you loved ${c.because}`);
  else if (c.sources.has('rewatch')) parts.push('An old favourite');
  else if (c.sources.has('serendipity')) parts.push('A well-loved pick off your usual path');
  const genres = c.snap.genreIds.slice(0, 2).map(genreName).join(' / ').toLowerCase();
  if (genres) parts.push(`${/^[aeiou]/.test(genres) ? 'an' : 'a'} ${genres}`);
  if (c.snap.runtime && input.minutes !== 'binge') parts.push(`${formatRuntime(c.snap.runtime)}${c.snap.type === 'tv' ? ' episodes' : ''} — fits your time`);
  if (c.mango === 'delicious' || c.mango === 'ripe') parts.push(`rated ${c.mango[0].toUpperCase() + c.mango.slice(1)} by Mangoidiots`);
  return parts.length ? `${parts.join(', ')}.`.replace(/^./, (s) => s.toUpperCase()) : 'A strong match for tonight.';
}

export async function planTonight(
  rawInput: TonightInput,
  settings: Settings,
  items: UserItem[],
  engine: AiEngine | null,
  stage: Stage = () => {},
): Promise<TonightResult> {
  let input: TonightInput = { ...rawInput, want: rawInput.want ?? (rawInput.moodNow ? DEFAULT_WANT[rawInput.moodNow] : undefined) };
  let aiError: string | undefined;
  let intent: Intent | undefined;
  let languages = settings.languages;

  if (input.freeText?.trim() && engine) {
    stage('Understanding what you asked for…');
    try {
      intent = await parseIntent(engine, input.freeText.trim());
      input = applyIntent(input, intent);
      if (intent.languages?.length) languages = intent.languages.map((l) => l.toLowerCase().slice(0, 2));
    } catch (e) {
      aiError = (e as Error).message;
    }
  }
  const avoidGenres = genresFromWords(intent?.avoid ?? []);

  const profile = buildProfile(items);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const now = Date.now();
  const types = typesFor(input);
  const surprise = input.discovery === 'surprise';
  const rewatch = input.discovery === 'rewatch';
  const certs = settings.showAllRatings ? null : AUDIENCE_CERTS[input.audience];

  stage('Checking what’s streaming on your services…');
  const catalogues = await Promise.all(types.map((t) => getWatchProviderCatalogue(t, settings.region).catch(() => ({ results: [] }))));
  const providerIds = resolveProviderIds(catalogues.flatMap((c) => c.results));
  const myProviders = [...new Set(settings.services.flatMap((k) => providerIds[k] ?? []))];

  const pool = new Map<string, Candidate>();
  const add = (t: TmdbListItem | TitleSnapshot, type: MediaType, source: Source, because?: string) => {
    const snap = 'tmdbId' in t ? t : snapshotFromList(t, type);
    const key = `${type}:${snap.tmdbId}`;
    const existing = pool.get(key);
    if (existing) {
      existing.sources.add(source);
      existing.because ??= because;
      return;
    }
    pool.set(key, { snap, overview: 'overview' in t ? t.overview : undefined, sources: new Set([source]), because, availability: [], score: 0 });
  };

  stage('Gathering candidates…');
  if (rewatch) {
    for (const i of items) if (types.includes(i.type) && (i.lists.includes('favourite') || i.rating === 'delicious' || i.rating === 'ripe')) add(i, i.type, 'rewatch');
  } else {
    const jobs: Promise<void>[] = [];
    for (const type of types) {
      const mood = input.want ? WANT_GENRES[input.want][type] : undefined;
      const kidsTv = type === 'tv' && input.audience === 'kids' ? '10762|10751' : undefined;
      const without = [...new Set([...(mood?.without ?? []), ...avoidGenres])].join(',');
      const base: Record<string, string | number | undefined> = {
        watch_region: settings.region,
        with_watch_providers: myProviders.join('|'),
        with_watch_monetization_types: 'flatrate|free|ads',
        with_original_language: languages.join('|'),
        without_genres: without || undefined,
        'with_runtime.lte': input.minutes === 'binge' ? undefined : input.minutes + 10,
        'with_runtime.gte': type === 'movie' && input.minutes !== 30 ? 40 : undefined,
        ...(type === 'movie' && certs ? { certification_country: 'IN', certification: certs.join('|') } : {}),
      };
      const withGenres = kidsTv ?? mood?.with.join('|');
      const run = (source: Source, params: Record<string, string | number | undefined>) =>
        jobs.push(
          discover(type, { ...base, ...params })
            .then((p) => p.results.forEach((r) => add(r, type, source)))
            .catch(() => undefined),
        );
      run('discover', { with_genres: withGenres, sort_by: 'popularity.desc', 'vote_count.gte': 10, page: 1 });
      run('discover', { with_genres: withGenres, sort_by: 'popularity.desc', 'vote_count.gte': 10, page: 2 });
      run('acclaimed', { with_genres: withGenres, sort_by: 'vote_average.desc', 'vote_count.gte': 150, page: 1 });
      if (surprise) {
        const page = 2 + Math.floor(dailyJitter(types.length * 7) * 5);
        run('serendipity', { with_genres: kidsTv, sort_by: 'vote_average.desc', 'vote_count.gte': 300, page });
      }
    }
    const seeds = profile.seeds.filter((s) => types.includes(s.type));
    const picked = [...seeds.slice(0, 3), ...seeds.slice(3, 12).sort((a, b) => dailyJitter(a.tmdbId) - dailyJitter(b.tmdbId)).slice(0, 2)];
    for (const seed of picked) {
      jobs.push(
        getRecommendations(seed.type, seed.tmdbId)
          .then((p) => p.results.slice(0, 12).forEach((r) => add(r, seed.type, 'recommended', seed.title)))
          .catch(() => undefined),
      );
    }
    for (const i of items) if (i.lists.includes('watchlist') && types.includes(i.type)) add(i, i.type, 'watchlist');
    await Promise.all(jobs);
  }

  const allowedLang = new Set(languages);
  const candidates = [...pool.values()].filter((c) => {
    const saved = byKey.get(`${c.snap.type}:${c.snap.tmdbId}`);
    if (saved?.feedback === 'never') return false;
    if (saved?.notTonightUntil && saved.notTonightUntil > now) return false;
    if (!rewatch && saved?.lists.includes('watched')) return false;
    if (!rewatch && !surprise && c.snap.originalLanguage && !allowedLang.has(c.snap.originalLanguage)) return false;
    if (c.snap.genreIds.some((g) => avoidGenres.includes(g))) return false;
    return true;
  });

  const bonus = (c: Candidate) =>
    (c.sources.has('watchlist') ? 0.12 : 0) + (c.sources.has('recommended') ? 0.08 : 0) + (c.sources.has('serendipity') && surprise ? 0.1 : 0) + (c.sources.size - 1) * 0.03;
  const scoreAll = (list: Candidate[]) => {
    for (const c of list) c.score = totalScore({ snap: c.snap, profile, want: input.want, minutes: input.minutes, surprise, bonus: bonus(c) });
    return list.sort((a, b) => b.score - a.score);
  };

  stage(`Looking closer at ${Math.min(ENRICH_COUNT, candidates.length)} titles…`);
  const shortlist = scoreAll(candidates).slice(0, ENRICH_COUNT);
  await pLimit(shortlist, 6, async (c) => {
    const d = await getDetails(c.snap.type, c.snap.tmdbId);
    c.snap = { ...c.snap, ...snapshotFromDetails(d, c.snap.type) };
    c.overview = d.overview || c.overview;
    c.availability = availabilityFrom(d['watch/providers']?.results?.[settings.region]);
    c.certification = certificationOf(d, settings.region);
  });

  const mine = new Set(settings.services);
  let finalists = shortlist.filter((c) => {
    if (!rewatch && !c.availability.some((a) => mine.has(a.service.key))) return false;
    if (input.minutes !== 'binge' && timeFit(c.snap.runtime, input.minutes, c.snap.type) === 0) return false;
    if (certs && c.snap.type === 'movie') {
      if (!c.certification) return input.audience !== 'kids';
      if (!certs.includes(c.certification)) return false;
    }
    return true;
  });
  finalists = scoreAll(finalists).slice(0, RERANK_POOL);

  if (settings.useMangoidiots && finalists.length) {
    stage('Checking Mangoidiots reviews…');
    await withTimeout(
      pLimit(finalists, 3, async (c) => {
        const review = await findReview([c.snap.title], c.snap.year);
        c.mango = review?.rating;
        const adj = { delicious: 0.08, ripe: 0.05, raw: 0, rotten: -0.08 } as const;
        if (c.mango) c.score += adj[c.mango];
      }),
      5000,
      [],
    );
    finalists.sort((a, b) => b.score - a.score);
  }

  const effective = { minutes: input.minutes, discovery: input.discovery, audience: input.audience, type: input.type, want: input.want, languages };
  const toPick = (c: Candidate, why: string, wildcard = false): Pick => ({
    snap: c.snap,
    overview: c.overview,
    availability: c.availability,
    certification: c.certification,
    mango: c.mango,
    why,
    wildcard,
  });

  if (engine && finalists.length > 1) {
    stage('Asking your AI movie buff…');
    try {
      const date = new Date();
      let news = '';
      if (settings.useNews) {
        const headlines = await withTimeout(newsHeadlines(date).catch(() => [] as string[]), 3000, [] as string[]);
        if (headlines.length) news = `\nToday's news (for tone only; if heavy, lean lighter): ${headlines.join(' | ')}`;
      }
      const context = `VIEWER\n${describeProfile(profile, items, settings)}

RIGHT NOW: ${date.toLocaleDateString('en-IN', { weekday: 'long' })} ${partOfDay(date)}, ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
Time available: ${input.minutes === 'binge' ? 'wants a series to binge' : formatRuntime(input.minutes)}. Feeling: ${input.moodNow ?? 'not said'}. Wants to: ${input.want ?? 'not said'}. Watching with: ${input.audience}. Wants: ${input.discovery === 'new' ? 'something new' : input.discovery === 'rewatch' ? 'a rewatch' : 'a surprise'}.${input.freeText ? `\nThey said: "${input.freeText}"` : ''}${news}`;
      const lines = finalists.map((c, i) => ({
        n: i + 1,
        line: [
          `${c.snap.title}${c.snap.year ? ` (${c.snap.year})` : ''}`,
          c.snap.type === 'tv' ? 'series' : 'movie',
          c.snap.runtime ? `${c.snap.runtime}m` : '?',
          languageName(c.snap.originalLanguage),
          c.snap.genreIds.slice(0, 3).map(genreName).join('/'),
          c.availability.map((a) => a.service.name).join('/') || 'not streaming',
          [c.sources.has('watchlist') && 'on watchlist', c.because && `like ${c.because}`, c.mango && `Mangoidiots: ${c.mango}`].filter(Boolean).join(', ') || '-',
          (c.overview ?? '').slice(0, 140),
        ].join(' | '),
      }));
      const ranked = await rerank(engine, context, lines, PICK_COUNT);
      if (ranked.length) {
        const picks = ranked.map((r, i) => toPick(finalists[r.n - 1], r.why, i === ranked.length - 1 && ranked.length >= 4));
        return { picks, engineUsed: 'ai', aiError, considered: pool.size, effective };
      }
      aiError = 'The AI returned no usable picks.';
    } catch (e) {
      aiError = (e as Error).message;
    }
  }

  const picks = finalists.slice(0, PICK_COUNT).map((c) => toPick(c, basicWhy(c, input)));
  return { picks, engineUsed: 'basic', aiError, considered: pool.size, effective };
}

/** Compact summary of saved titles, for the AI taste portrait. */
export function tasteSummaryForPortrait(items: UserItem[]): string {
  const profile = buildProfile(items);
  const lines = profile.seeds.slice(0, 25).map((i) => `${i.title}${i.year ? ` (${i.year})` : ''} – ${languageName(i.originalLanguage)}, ${i.genreIds.slice(0, 3).map(genreName).join('/')}${i.rating ? `, rated ${i.rating}` : ''}${i.lists.includes('favourite') ? ', favourite' : ''}`);
  const disliked = items.filter((i) => i.rating === 'rotten' || i.feedback === 'never').slice(0, 10).map((i) => i.title);
  return `Saved titles:\n${lines.join('\n') || '(none yet)'}\n${disliked.length ? `Disliked: ${disliked.join(', ')}` : ''}`;
}
