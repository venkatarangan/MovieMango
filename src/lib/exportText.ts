import { genreName } from './genres';
import { languageName } from './languages';
import { formatRuntime, capitalise } from './format';
import type { Availability } from './providers';
import { ratingText } from './ratings';
import { isCustom, type MangoRating, type MyRating, type TitleSnapshot, type UserItem } from './types';

export const BYLINE = 'Ripe picks for your mood and your moment.';
export const APP_URL = 'https://watch.mangoidiots.com';

export const CREDITS = 'Data: TMDB (this product uses the TMDB API but is not endorsed or certified by TMDB) · Streaming availability: JustWatch';

const accessLabel = { subscription: 'subscription', free: 'free', ads: 'free with ads' } as const;

export function tmdbUrl(t: Pick<TitleSnapshot, 'type' | 'tmdbId'>) {
  return `https://www.themoviedb.org/${t.type}/${t.tmdbId}`;
}

/** Where to read more: TMDB, or a custom title's own link (if any). */
export function moreUrl(t: Pick<TitleSnapshot, 'type' | 'tmdbId' | 'custom'>) {
  return isCustom(t) ? t.custom?.url : tmdbUrl(t);
}


export interface TitleExport {
  snap: TitleSnapshot;
  overview?: string;
  genres?: string[];
  director?: string;
  cast?: string[];
  seasons?: number;
  availability?: Availability[];
  myRating?: MyRating;
  mangoidiots?: { rating?: MangoRating; link: string };
}

export function titleToText(t: TitleExport): string {
  const s = t.snap;
  const head = [
    `${s.title}${s.year ? ` (${s.year})` : ''}`,
    s.type === 'tv' ? `Series${t.seasons ? `, ${t.seasons} season${t.seasons > 1 ? 's' : ''}` : ''}` : 'Movie',
    s.runtime ? formatRuntime(s.runtime) + (s.type === 'tv' ? ' episodes' : '') : '',
    languageName(s.originalLanguage),
  ].filter(Boolean);
  const meta = [
    (t.genres ?? s.genreIds.map(genreName)).slice(0, 4).join(', '),
    s.voteAverage ? `TMDB ${s.voteAverage.toFixed(1)}/10` : '',
    t.myRating ? `My rating: ${ratingText(t.myRating)}` : '',
  ].filter(Boolean);
  const people = [t.director ? `Director: ${t.director}` : '', t.cast?.length ? `Cast: ${t.cast.slice(0, 4).join(', ')}` : ''].filter(Boolean);
  const where = isCustom(s)
    ? ''
    : t.availability?.length
      ? `Where to watch (India): ${t.availability.map((a) => `${a.service.name} (${accessLabel[a.access]})`).join(', ')}`
      : 'Where to watch (India): not on the major streaming services right now';
  const more = moreUrl(s);
  return [
    `🎬 ${head.join(' · ')}`,
    s.custom?.originalTitle ?? '',
    meta.join(' · '),
    people.join(' · '),
    '',
    t.overview ?? '',
    '',
    where,
    t.mangoidiots ? `Mangoidiots review${t.mangoidiots.rating ? ` (${capitalise(t.mangoidiots.rating)})` : ''}: ${t.mangoidiots.link}` : '',
    more ? `More: ${more}` : '',
    '',
    `Shared from MovieMango: ${BYLINE.charAt(0).toLowerCase() + BYLINE.slice(1)} ${APP_URL}`,
    CREDITS,
  ]
    .filter((line, i, all) => line !== '' || (all[i - 1] !== '' && i > 0))
    .join('\n')
    .trim();
}

export function itemLine(item: UserItem, n: number): string {
  return [
    `${n}. ${item.title}${item.year ? ` (${item.year})` : ''}`,
    item.type === 'tv' ? 'Series' : 'Movie',
    item.runtime ? formatRuntime(item.runtime) : '',
    languageName(item.originalLanguage),
    ratingText(item.rating),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function listToText(name: string, items: UserItem[], date = new Date()): string {
  return [
    `🥭 ${name} · ${items.length} title${items.length === 1 ? '' : 's'} · ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    '',
    ...items.map((item, i) => itemLine(item, i + 1)),
    '',
    `Shared from MovieMango · ${APP_URL}`,
    CREDITS,
  ].join('\n');
}

export function everythingToText(sections: { name: string; items: UserItem[] }[], date = new Date()): string {
  return sections
    .filter((s) => s.items.length)
    .map((s) => listToText(s.name, s.items, date).split('\nShared from')[0].trim())
    .concat([`Shared from MovieMango · ${APP_URL}`, CREDITS])
    .join('\n\n');
}

export function safeFilename(name: string, ext = 'txt') {
  return `MovieMango-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.${ext}`;
}
