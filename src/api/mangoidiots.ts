import { cached, DAY, getJson } from './http';
import type { MangoRating } from '../lib/types';

/**
 * Mangoidiots (mangoidiots.com) is WordPress.com site 974561; the domain redirects to venkatarangan.com,
 * so we query the public API by site ID. Ratings are post tags.
 */
const SITE = 'https://public-api.wordpress.com/wp/v2/sites/974561';
const CATEGORIES = { movies: 26, television: 232 };
export const RATING_TAGS: Record<number, MangoRating> = { 1523: 'rotten', 1524: 'raw', 1525: 'ripe', 1527: 'delicious' };
const TAG_FOR_RATING = Object.fromEntries(Object.entries(RATING_TAGS).map(([id, r]) => [r, Number(id)])) as Record<MangoRating, number>;

export interface ReviewSummary {
  id: number;
  title: string;
  link: string;
  date: string;
  excerptHtml: string;
  rating?: MangoRating;
  poster?: string;
}

interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  excerpt?: { rendered: string };
  content?: { rendered: string };
  tags?: number[];
  jetpack_featured_media_url?: string;
}

const FIELDS = 'id,date,link,title,excerpt,tags,jetpack_featured_media_url';

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Lowercase, strip accents and punctuation, drop leading articles: for loose title matching. */
export function normaliseTitle(s: string): string {
  return decodeEntities(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

/** Review posts are titled "Title (Year), tagline". Returns the film part and year when present. */
export function parseReviewTitle(postTitle: string): { name: string; year?: number } {
  const t = decodeEntities(postTitle).trim();
  const m = t.match(/^(.*?)\s*\((\d{4})\)/);
  if (m) return { name: m[1].trim(), year: Number(m[2]) };
  return { name: t.split(/[,:–—-]\s/)[0].trim() };
}

/** Does this post review this title? Same normalised name; year must agree within one when both are known. */
export function matchesTitle(postTitle: string, titles: string[], year?: number): boolean {
  const parsed = parseReviewTitle(postTitle);
  const name = normaliseTitle(parsed.name);
  if (!name) return false;
  const nameOk = titles.some((t) => normaliseTitle(t) === name);
  if (!nameOk) return false;
  if (parsed.year && year) return Math.abs(parsed.year - year) <= 1;
  return true;
}

const toSummary = (p: WpPost): ReviewSummary => ({
  id: p.id,
  title: decodeEntities(p.title.rendered),
  link: p.link,
  date: p.date,
  excerptHtml: p.excerpt?.rendered ?? '',
  rating: p.tags?.map((t) => RATING_TAGS[t]).find(Boolean),
  poster: p.jetpack_featured_media_url || undefined,
});

/** Finds the Mangoidiots review for a title, or null. Cached a week, including "no review". */
export function findReview(titles: string[], year?: number): Promise<ReviewSummary | null> {
  const primary = titles[0];
  return cached(`mango:find:${normaliseTitle(primary)}:${year ?? ''}`, 7 * DAY, async () => {
    const unique = [...new Set(titles.filter(Boolean))];
    for (const query of unique) {
      const url = `${SITE}/posts?search=${encodeURIComponent(query)}&categories=${CATEGORIES.movies},${CATEGORIES.television}&per_page=10&_fields=${FIELDS}`;
      const posts = await getJson<WpPost[]>(url);
      const hit = posts.find((p) => matchesTitle(p.title.rendered, unique, year));
      if (hit) return toSummary(hit);
    }
    return null;
  });
}

export function getReview(id: number): Promise<{ title: string; html: string; link: string; date: string }> {
  return cached(`mango:post:${id}`, DAY, async () => {
    const p = await getJson<WpPost>(`${SITE}/posts/${id}?_fields=id,date,link,title,content`);
    return { title: decodeEntities(p.title.rendered), html: p.content?.rendered ?? '', link: p.link, date: p.date };
  });
}

/** Latest reviews, optionally by rating, for the reviews shelf. */
export function latestReviews(rating?: MangoRating, page = 1): Promise<ReviewSummary[]> {
  const tag = rating ? `&tags=${TAG_FOR_RATING[rating]}` : '';
  return cached(`mango:latest:${rating ?? 'all'}:${page}`, 6 * 3600_000, async () => {
    const posts = await getJson<WpPost[]>(
      `${SITE}/posts?categories=${CATEGORIES.movies},${CATEGORIES.television}${tag}&per_page=20&page=${page}&_fields=${FIELDS}`,
    );
    return posts.map(toSummary);
  });
}
