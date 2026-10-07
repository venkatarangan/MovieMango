import type { UserItem } from '../lib/types';

export interface TasteProfile {
  genres: Record<number, number>;
  languages: Record<string, number>;
  keywords: Record<number, number>;
  people: Record<number, number>;
  /** Titles that say the most about the user's taste, strongest first. */
  seeds: UserItem[];
  /** How many titles carried signal. */
  signal: number;
}

const RATING_WEIGHT = { love: 3, like: 2 } as const;

/** How strongly a saved title speaks for (or against) the user's taste: ❤️ 3, 👍 2, watched 1, watchlist +1, 👎 −2. */
export function itemWeight(item: UserItem): number {
  if (item.rating === 'dislike') return -2;
  let w = 0;
  if (item.rating) w += RATING_WEIGHT[item.rating];
  else if (item.lists.includes('watched')) w += 1;
  if (item.lists.includes('watchlist')) w += 1;
  if (w === 0 && item.lists.length > 0) w = 0.5; // in a custom list
  return w;
}

function normalise<K extends string | number>(m: Record<K, number>): Record<K, number> {
  const max = Math.max(1e-9, ...Object.values<number>(m).map(Math.abs));
  for (const k in m) m[k] = m[k] / max;
  return m;
}

export function buildProfile(items: UserItem[]): TasteProfile {
  const genres: Record<number, number> = {};
  const languages: Record<string, number> = {};
  const keywords: Record<number, number> = {};
  const people: Record<number, number> = {};
  let signal = 0;
  const weighted: [UserItem, number][] = [];
  for (const item of items) {
    const w = itemWeight(item);
    if (w === 0) continue;
    signal++;
    weighted.push([item, w]);
    for (const g of item.genreIds ?? []) genres[g] = (genres[g] ?? 0) + w;
    if (item.originalLanguage) languages[item.originalLanguage] = (languages[item.originalLanguage] ?? 0) + w;
    for (const k of item.keywordIds ?? []) keywords[k] = (keywords[k] ?? 0) + w * 0.5;
    for (const p of item.peopleIds ?? []) people[p] = (people[p] ?? 0) + w * 0.5;
  }
  const seeds = weighted
    .filter(([, w]) => w >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].updatedAt - a[0].updatedAt)
    .map(([i]) => i);
  return { genres: normalise(genres), languages: normalise(languages), keywords: normalise(keywords), people: normalise(people), seeds, signal };
}

export function topGenres(profile: TasteProfile, n = 5): number[] {
  return Object.entries(profile.genres)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => Number(g));
}
