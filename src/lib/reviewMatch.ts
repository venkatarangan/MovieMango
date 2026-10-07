import { matchesTitle, parseReviewTitle } from '../api/mangoidiots';
import { mediaTypeOf, searchMulti, snapshotFromList, yearOf } from '../api/tmdb';
import type { TitleSnapshot } from './types';

/**
 * The TMDB title a review is about, from its headline ("Title (Year), tagline"): same name, year
 * within one. Undefined when nothing matches confidently, so the caller can let the user pick.
 */
export async function findReviewedTitle(postTitle: string): Promise<TitleSnapshot | undefined> {
  const { name } = parseReviewTitle(postTitle);
  if (!name) return undefined;
  const res = await searchMulti(name);
  const hit = res.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .find((r) => matchesTitle(postTitle, [r.title ?? r.name ?? '', r.original_title ?? r.original_name ?? ''].filter(Boolean), yearOf(r)));
  return hit ? snapshotFromList(hit, mediaTypeOf(hit)) : undefined;
}
