import type { MediaType, TitleSnapshot } from '../lib/types';
import type { TasteProfile } from './profile';
import { WANT_GENRES, type Minutes, type Want } from './moods';

export const WEIGHTS = { taste: 0.45, mood: 0.25, time: 0.15, quality: 0.1, fresh: 0.05 };

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

function overlap(ids: number[] | undefined, weights: Record<number, number>): number {
  if (!ids?.length) return 0;
  const hits = ids.map((id) => weights[id] ?? 0);
  // Average of the strongest few matches, so long genre lists aren't penalised.
  const top = hits.sort((a, b) => b - a).slice(0, 3);
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/** 0..1: how much this title looks like what the user loves. 0.5 when we know nothing yet. */
export function tasteScore(t: TitleSnapshot, p: TasteProfile): number {
  if (p.signal === 0) return 0.5;
  const g = overlap(t.genreIds, p.genres);
  const lang = t.originalLanguage ? (p.languages[t.originalLanguage] ?? 0) : 0;
  const kw = overlap(t.keywordIds, p.keywords);
  const ppl = overlap(t.peopleIds, p.people);
  const raw = 0.5 * g + 0.2 * lang + 0.15 * kw + 0.15 * ppl;
  return clamp(0.5 + raw / 2);
}

/** 0..1: fit between the title's genres and the feeling the user wants. */
export function moodFit(genreIds: number[], want: Want | undefined, type: MediaType): number {
  if (!want) return 0.5;
  const { with: good, without: bad } = WANT_GENRES[want][type];
  if (genreIds.some((g) => bad.includes(g))) return 0.05;
  const hits = genreIds.filter((g) => good.includes(g)).length;
  return hits === 0 ? 0.25 : clamp(0.6 + 0.2 * hits);
}

/** 0..1: does it fit the time available? Unknown runtime is neutral. */
export function timeFit(runtime: number | null | undefined, minutes: Minutes, type: MediaType): number {
  if (minutes === 'binge') return type === 'tv' ? 1 : 0.2;
  if (!runtime) return 0.5;
  if (runtime > minutes + 10) return 0;
  if (type === 'tv') return runtime <= minutes ? 0.9 : 0.4;
  // A 95-minute film in a 2-hour window is great; a 40-minute film in 3 hours is a little short.
  return clamp(1 - Math.max(0, minutes - runtime) / (minutes * 2));
}

/** 0..1: vote average, discounted when few people voted. */
export function qualityScore(voteAverage = 0, voteCount = 0): number {
  const confidence = clamp(Math.log10(voteCount + 1) / 3);
  return clamp((voteAverage / 10) * (0.4 + 0.6 * confidence));
}

/** A stable pseudo-random 0..1 per title and day, so "surprise" varies daily but not on every render. */
export function dailyJitter(id: number, date = new Date()): number {
  let h = id ^ (date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate());
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export interface ScoreInput {
  snap: TitleSnapshot;
  profile: TasteProfile;
  want?: Want;
  minutes: Minutes;
  surprise: boolean;
  bonus?: number;
}

export function totalScore({ snap, profile, want, minutes, surprise, bonus = 0 }: ScoreInput): number {
  const fresh = surprise ? dailyJitter(snap.tmdbId) : snap.year ? clamp((snap.year - 1980) / 50) : 0.5;
  return (
    WEIGHTS.taste * tasteScore(snap, profile) +
    WEIGHTS.mood * moodFit(snap.genreIds, want, snap.type) +
    WEIGHTS.time * timeFit(snap.runtime, minutes, snap.type) +
    WEIGHTS.quality * qualityScore(snap.voteAverage, snap.voteCount) +
    WEIGHTS.fresh * fresh +
    bonus
  );
}
