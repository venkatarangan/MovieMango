export type MediaType = 'movie' | 'tv';

export type MangoRating = 'rotten' | 'raw' | 'ripe' | 'delicious';

export const BUILTIN_LISTS = ['favourite', 'watchlist', 'watched'] as const;
export type BuiltinList = (typeof BUILTIN_LISTS)[number];

export const MAX_CUSTOM_LISTS = 50;

/** The small slice of a TMDB title we keep for anything the user saves, so lists render offline. */
export interface TitleSnapshot {
  tmdbId: number;
  type: MediaType;
  title: string;
  year?: number;
  posterPath?: string | null;
  genreIds: number[];
  runtime?: number | null;
  originalLanguage?: string;
  voteAverage?: number;
  voteCount?: number;
  keywordIds?: number[];
  peopleIds?: number[];
}

export interface UserItem extends TitleSnapshot {
  key: string;
  /** Built-in list names and custom list ids. */
  lists: string[];
  rating?: MangoRating;
  feedback?: 'never';
  notTonightUntil?: number;
  watchedAt?: number;
  /** TV only: watched episode numbers per season number, e.g. { "1": [1,2,3], "2": [1] }. */
  episodesSeen?: Record<string, number[]>;
  /** TV only: the next unwatched episode, worked out when progress changes; null when caught up. */
  nextEpisode?: { season: number; episode: number; name?: string } | null;
  addedAt: number;
  updatedAt: number;
}

export interface CustomList {
  id: string;
  name: string;
  emoji?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export const itemKey = (type: MediaType, id: number) => `${type}:${id}`;
