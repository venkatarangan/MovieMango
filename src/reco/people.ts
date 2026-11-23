import type { TmdbPerson } from '../api/tmdb';
import { liveFavourites, type FavPerson } from '../lib/people';
import { isReleased, personCredits } from '../lib/personCredits';
import type { MediaType, TitleSnapshot } from '../lib/types';
import { qualityScore } from './score';

/**
 * Favourite people as a soft input for picks. Budget: at most this many favourites (the most recently
 * added), each costing one cached `getPerson` call (7 days), and at most `PER_PERSON` titles from each.
 */
export const FAV_PEOPLE_MAX = 8;
export const PER_PERSON = 6;
/** Added to a candidate's score when a favourite acted in or directed it. Discover candidates sit around 0.5 to 0.8. */
export const PEOPLE_BONUS = 0.1;

/** The favourites to use: not removed, real TMDB ids (positive), newest first, capped. */
export const pickFavourites = (people: FavPerson[] | undefined, max = FAV_PEOPLE_MAX): FavPerson[] => liveFavourites(people ?? []).filter((p) => p.id > 0).slice(0, max);

/**
 * Real, released titles from a person's acting and directing credits, best known first, at most `max`.
 * Titles come only from TMDB's credits; a new array of new objects is returned (the response is cached and shared).
 */
export function creditCandidates(person: TmdbPerson | undefined, types: MediaType[], today = new Date().toISOString().slice(0, 10), max = PER_PERSON): TitleSnapshot[] {
  const { acting, directing } = personCredits(person);
  const seen = new Set<string>();
  return [...acting, ...directing]
    .filter((c) => types.includes(c.snap.type) && isReleased(c, today) && !!c.snap.posterPath && (c.snap.voteCount ?? 0) >= 30 && !seen.has(c.key) && seen.add(c.key))
    .sort((a, b) => qualityScore(b.snap.voteAverage, b.snap.voteCount) - qualityScore(a.snap.voteAverage, a.snap.voteCount) || b.date.localeCompare(a.date))
    .slice(0, max)
    .map((c) => c.snap);
}
