import type { MediaType, UserItem } from './types';

/** Sorting and filtering for list pages (src/components/ListView.tsx). */
export type SortKey = 'added' | 'watched' | 'title' | 'newest' | 'oldest' | 'rating' | 'tmdb' | 'runtime';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'added', label: 'Recently added' },
  { key: 'watched', label: 'Recently watched' },
  { key: 'title', label: 'Title A–Z' },
  { key: 'newest', label: 'Newest release' },
  { key: 'oldest', label: 'Oldest release' },
  { key: 'rating', label: 'Your rating' },
  { key: 'tmdb', label: 'TMDB rating' },
  { key: 'runtime', label: 'Shortest first' },
];

export interface ViewState {
  type: 'all' | MediaType;
  sort: SortKey;
  genre?: number;
  lang?: string;
  rating?: 'love' | 'like' | 'dislike' | 'none';
  decade?: number;
}

const RATING_RANK = { love: 3, like: 2, dislike: 0 } as const;
const rank = (i: UserItem) => (i.rating ? RATING_RANK[i.rating] : 1);
export const decadeOf = (year?: number) => (year ? Math.floor(year / 10) * 10 : undefined);

const COMPARE: Record<SortKey, (a: UserItem, b: UserItem) => number> = {
  added: (a, b) => b.addedAt - a.addedAt,
  watched: (a, b) => (b.watchedAt ?? 0) - (a.watchedAt ?? 0) || b.updatedAt - a.updatedAt,
  title: (a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }),
  newest: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  oldest: (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
  rating: (a, b) => rank(b) - rank(a) || (b.voteAverage ?? 0) - (a.voteAverage ?? 0),
  tmdb: (a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0),
  runtime: (a, b) => (a.runtime || 9999) - (b.runtime || 9999),
};

/** Filters and sorts a list without changing it. */
export function applyView(items: UserItem[], v: ViewState, text = ''): UserItem[] {
  const q = text.trim().toLowerCase();
  return items
    .filter(
      (i) =>
        (v.type === 'all' || i.type === v.type) &&
        (!v.genre || i.genreIds.includes(v.genre)) &&
        (!v.lang || i.originalLanguage === v.lang) &&
        (!v.rating || (v.rating === 'none' ? !i.rating : i.rating === v.rating)) &&
        (!v.decade || decadeOf(i.year) === v.decade) &&
        (!q || i.title.toLowerCase().includes(q) || !!i.custom?.originalTitle?.toLowerCase().includes(q)),
    )
    .sort((a, b) => COMPARE[v.sort](a, b) || a.title.localeCompare(b.title));
}
