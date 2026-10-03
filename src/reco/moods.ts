import type { MediaType } from '../lib/types';

export type MoodNow = 'tired' | 'stressed' | 'happy' | 'bored' | 'sad' | 'curious';
export type Want = 'laugh' | 'cry' | 'thrill' | 'think' | 'comfort' | 'wow';
export type Discovery = 'new' | 'rewatch' | 'surprise';
export type Audience = 'solo' | 'partner' | 'family' | 'kids';
export type TypeChoice = MediaType | 'either';
export type Minutes = 30 | 60 | 120 | 180 | 'binge';

export const MOODS_NOW: { key: MoodNow; label: string; emoji: string }[] = [
  { key: 'tired', label: 'Tired', emoji: '😴' },
  { key: 'stressed', label: 'Stressed', emoji: '😣' },
  { key: 'happy', label: 'Happy', emoji: '😄' },
  { key: 'bored', label: 'Bored', emoji: '🥱' },
  { key: 'sad', label: 'Low', emoji: '😔' },
  { key: 'curious', label: 'Curious', emoji: '🤔' },
];

export const WANTS: { key: Want; label: string; emoji: string }[] = [
  { key: 'laugh', label: 'Laugh', emoji: '😂' },
  { key: 'cry', label: 'Feel deeply', emoji: '🥲' },
  { key: 'thrill', label: 'Thrill', emoji: '😱' },
  { key: 'think', label: 'Think', emoji: '🧠' },
  { key: 'comfort', label: 'Comfort', emoji: '🫶' },
  { key: 'wow', label: 'Be wowed', emoji: '🤩' },
];

export const MINUTES: { key: Minutes; label: string }[] = [
  { key: 30, label: '30 min' },
  { key: 60, label: '1 hr' },
  { key: 120, label: '2 hr' },
  { key: 180, label: '3 hr+' },
  { key: 'binge', label: 'A series to binge' },
];

export const DISCOVERY: { key: Discovery; label: string }[] = [
  { key: 'new', label: 'Something new' },
  { key: 'rewatch', label: 'Rewatch a favourite' },
  { key: 'surprise', label: 'Surprise me' },
];

export const AUDIENCES: { key: Audience; label: string }[] = [
  { key: 'solo', label: 'Just me' },
  { key: 'partner', label: 'Partner' },
  { key: 'family', label: 'Family' },
  { key: 'kids', label: 'Kids' },
];

/** What you feel now suggests what you might want to feel. Editable by the user in the UI. */
export const DEFAULT_WANT: Record<MoodNow, Want> = {
  tired: 'comfort',
  stressed: 'laugh',
  happy: 'thrill',
  bored: 'wow',
  sad: 'comfort',
  curious: 'think',
};

/** Want → TMDB genre IDs (OR'ed), plus genres to avoid. Movie and TV genre IDs differ. */
export const WANT_GENRES: Record<Want, Record<MediaType, { with: number[]; without: number[] }>> = {
  laugh: { movie: { with: [35], without: [27] }, tv: { with: [35], without: [] } },
  cry: { movie: { with: [18, 10749], without: [27] }, tv: { with: [18], without: [10764] } },
  thrill: { movie: { with: [53, 28, 80, 9648], without: [10751] }, tv: { with: [10759, 80, 9648], without: [10762] } },
  think: { movie: { with: [99, 9648, 878, 36], without: [] }, tv: { with: [99, 9648, 10765, 10768], without: [10764] } },
  comfort: { movie: { with: [10751, 35, 16, 10749, 10402], without: [27, 53, 10752] }, tv: { with: [35, 10751, 16], without: [80] } },
  wow: { movie: { with: [12, 14, 878, 16], without: [] }, tv: { with: [10765, 10759, 16], without: [] } },
};

/** India (CBFC) certifications allowed per audience unless the user asks for all ratings. */
export const AUDIENCE_CERTS: Record<Audience, string[] | null> = {
  solo: null,
  partner: null,
  family: ['U', 'UA', 'U/A', 'UA 7+', 'UA 13+', 'UA7+', 'UA13+'],
  kids: ['U'],
};

/** A sensible default for "time I have" from the clock. */
export function defaultMinutes(date = new Date()): Minutes {
  const day = date.getDay();
  const hour = date.getHours();
  const weekend = day === 0 || day === 6 || (day === 5 && hour >= 18);
  if (hour >= 23 || hour < 5) return 60;
  if (weekend) return 180;
  if (hour >= 19) return 120;
  return 60;
}

export function partOfDay(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'late night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
