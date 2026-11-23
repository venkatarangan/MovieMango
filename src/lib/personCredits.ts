import { snapshotFromList, type TmdbCredit, type TmdbPerson } from '../api/tmdb';
import type { TitleSnapshot } from './types';

/** Talk, news and reality shows, where actors mostly appear as themselves. */
const NOT_ACTING_GENRES = [10763, 10764, 10767];
const isSelf = (c: TmdbCredit) => /\b(self|himself|herself|themselves|host|narrator)\b/i.test(c.character ?? '');
const dateOf = (c: TmdbCredit) => c.release_date || c.first_air_date || '';

export interface Credit {
  key: string;
  snap: TitleSnapshot;
  role: string;
  date: string;
}

/** One entry per title, newest first; titles with no date yet (announced) go first. */
function collect(credits: TmdbCredit[], role: (c: TmdbCredit) => string): Credit[] {
  const byKey = new Map<string, Credit>();
  for (const c of credits) {
    const key = `${c.media_type}:${c.id}`;
    const existing = byKey.get(key);
    const r = role(c);
    if (existing) {
      if (r && !existing.role.includes(r)) existing.role = [existing.role, r].filter(Boolean).join(', ');
      continue;
    }
    byKey.set(key, { key, snap: snapshotFromList(c, c.media_type), role: r, date: dateOf(c) });
  }
  return [...byKey.values()].sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));
}

/** A person's acting credits (no talk shows or "Self" roles) and directing credits (Director or Creator). Builds new objects; never touches the cached response. */
export function personCredits(p: TmdbPerson | undefined): { acting: Credit[]; directing: Credit[] } {
  const cast = (p?.combined_credits?.cast ?? []).filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && !isSelf(c) && !c.genre_ids?.some((g) => NOT_ACTING_GENRES.includes(g)));
  const crew = (p?.combined_credits?.crew ?? []).filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && (c.job === 'Director' || c.job === 'Creator'));
  return {
    acting: collect(cast, (c) => c.character ?? ''),
    directing: collect(crew, (c) => (c.job === 'Creator' ? 'Creator' : c.media_type === 'tv' ? `Director${c.episode_count ? `, ${c.episode_count} ep` : ''}` : '')),
  };
}

/** Released titles only (an announced title has no streaming info to check). */
export const isReleased = (c: Pick<Credit, 'date'>, today = new Date().toISOString().slice(0, 10)) => !!c.date && c.date <= today;
