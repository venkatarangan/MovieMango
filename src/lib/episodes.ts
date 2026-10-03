/** Pure helpers for TV episode progress. Season keys in `episodesSeen` are season numbers as strings. */

export type EpisodesSeen = Record<string, number[]>;

export interface SeasonInfo {
  season_number: number;
  episode_count: number;
  name?: string;
  /** Optional, when the season's episode list is loaded: lets nextEpisode carry a name. */
  episodes?: { episode_number: number; name?: string }[];
}

export interface EpisodeRef {
  season: number;
  episode: number;
  name?: string;
}

export const episodeLabel = (e: { season: number; episode: number }) => `S${e.season} E${e.episode}`;

/** Seasons that count for progress, in order: Specials (season 0) only when it's the only season. */
export function mainSeasons<T extends SeasonInfo>(seasons: T[]): T[] {
  const real = seasons.filter((s) => s.season_number > 0);
  return (real.length ? real : seasons).filter((s) => s.episode_count > 0).sort((a, b) => a.season_number - b.season_number);
}

/** Caps the season list at the last aired episode, so unaired episodes don't count as "next". */
export function airedSeasons<T extends SeasonInfo>(seasons: T[], lastAired: { season_number: number; episode_number: number } | null | undefined): T[] {
  if (lastAired === undefined) return seasons;
  return seasons.map((s) => {
    if (s.season_number === 0 || lastAired?.season_number === 0) return s;
    if (!lastAired || s.season_number > lastAired.season_number) return { ...s, episode_count: 0 };
    if (s.season_number === lastAired.season_number) return { ...s, episode_count: Math.min(s.episode_count, lastAired.episode_number) };
    return s;
  });
}

const has = (seen: EpisodesSeen | undefined, season: number, episode: number) => !!seen?.[String(season)]?.includes(episode);

/**
 * First unseen episode in season order, skipping Specials. Null when caught up.
 * Without a season list, a best guess: the episode after the furthest one seen.
 */
export function computeNextEpisode(seen: EpisodesSeen | undefined, seasons?: SeasonInfo[]): EpisodeRef | null {
  if (!seasons) {
    const nums = Object.keys(seen ?? {}).map(Number).filter((n) => n > 0 && seen![String(n)].length);
    if (!nums.length) return null;
    const s = Math.max(...nums);
    return { season: s, episode: Math.max(...seen![String(s)]) + 1 };
  }
  for (const s of mainSeasons(seasons)) {
    for (let e = 1; e <= s.episode_count; e++) {
      if (has(seen, s.season_number, e)) continue;
      const name = s.episodes?.find((x) => x.episode_number === e)?.name;
      return name ? { season: s.season_number, episode: e, name } : { season: s.season_number, episode: e };
    }
  }
  return null;
}

/** Seen and total episodes across the main seasons (pass aired seasons for "of what's out"). */
export function countProgress(seen: EpisodesSeen | undefined, seasons: SeasonInfo[]): { seen: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of mainSeasons(seasons)) {
    total += s.episode_count;
    done += (seen?.[String(s.season_number)] ?? []).filter((e) => e >= 1 && e <= s.episode_count).length;
  }
  return { seen: done, total };
}

/** Returns a copy with the episode set on or off; empty seasons are dropped. */
export function withEpisode(seen: EpisodesSeen | undefined, season: number, episode: number, on: boolean): EpisodesSeen {
  const out = { ...(seen ?? {}) };
  const key = String(season);
  const list = new Set(out[key] ?? []);
  if (on) list.add(episode);
  else list.delete(episode);
  if (list.size) out[key] = [...list].sort((a, b) => a - b);
  else delete out[key];
  return out;
}

/** Returns a copy with episodes 1..count of a season all seen, or the season cleared. */
export function withSeason(seen: EpisodesSeen | undefined, season: number, count: number, on: boolean): EpisodesSeen {
  const out = { ...(seen ?? {}) };
  if (on && count > 0) out[String(season)] = Array.from({ length: count }, (_, i) => i + 1);
  else delete out[String(season)];
  return out;
}

/** Everything up to and including this episode: earlier main seasons (from the list) and this season. */
export function withSeenUpTo(seen: EpisodesSeen | undefined, season: number, episode: number, seasons?: SeasonInfo[]): EpisodesSeen {
  let out = { ...(seen ?? {}) };
  if (season > 0) for (const s of mainSeasons(seasons ?? [])) if (s.season_number > 0 && s.season_number < season) out = withSeason(out, s.season_number, s.episode_count, true);
  const key = String(season);
  out[key] = [...new Set([...(out[key] ?? []), ...Array.from({ length: episode }, (_, i) => i + 1)])].sort((a, b) => a - b);
  return out;
}

/** Local date as YYYY-MM-DD, to compare with TMDB air dates. */
export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const hasAired = (airDate: string | null | undefined, today = todayIso()) => !!airDate && airDate <= today;
