import type { MyRating } from './types';

export const MY_RATINGS: { key: MyRating; emoji: string; label: string; short: string }[] = [
  { key: 'dislike', emoji: '👎', label: 'Not for me', short: 'Not for me' },
  { key: 'like', emoji: '👍', label: 'Liked it', short: 'Liked' },
  { key: 'love', emoji: '❤️', label: 'Loved it', short: 'Loved' },
];

export const ratingInfo = (r: MyRating) => MY_RATINGS.find((m) => m.key === r)!;

/** "❤️ Loved it", or '' for no rating. */
export const ratingText = (r?: MyRating) => (r ? `${ratingInfo(r).emoji} ${ratingInfo(r).label}` : '');
