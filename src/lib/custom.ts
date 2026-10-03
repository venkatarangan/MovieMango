import type { CustomInfo, MediaType, TitleSnapshot } from './types';

export interface CustomFields {
  tmdbId?: number;
  type: MediaType;
  title: string;
  year?: number;
  runtime?: number | null;
  originalLanguage?: string;
  genreIds?: number[];
  originalTitle?: string;
  overview?: string;
  director?: string;
  cast?: string[] | string;
  url?: string;
}

let lastId = 0;

/** A unique negative id for a custom title (microsecond-ish clock, never repeats in this session). */
export function newCustomId(): number {
  const n = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastId + 1);
  lastId = n;
  return -n;
}

/** The URL if it's a plain http(s) link, otherwise undefined. Adds https:// when the scheme is missing. */
export function safeUrl(raw?: string): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const splitNames = (s?: string[] | string) =>
  (Array.isArray(s) ? s : (s ?? '').split(/[,;\n]/)).map((x) => x.trim()).filter(Boolean).slice(0, 30);

const clean = (s?: string) => s?.trim() || undefined;

/** Builds the snapshot for a custom title from what the user typed. Empty fields are left out. */
export function customSnapshot(f: CustomFields): TitleSnapshot {
  const custom: CustomInfo = {
    originalTitle: clean(f.originalTitle),
    overview: clean(f.overview),
    director: clean(f.director),
    cast: splitNames(f.cast),
    url: safeUrl(f.url),
  };
  for (const k of Object.keys(custom) as (keyof CustomInfo)[]) if (custom[k] === undefined || (Array.isArray(custom[k]) && !custom[k].length)) delete custom[k];
  const year = f.year && f.year > 1800 && f.year < 2200 ? Math.round(f.year) : undefined;
  const runtime = f.runtime && f.runtime > 0 && f.runtime < 2000 ? Math.round(f.runtime) : undefined;
  return {
    tmdbId: f.tmdbId && f.tmdbId < 0 ? f.tmdbId : newCustomId(),
    type: f.type,
    title: f.title.trim(),
    year,
    posterPath: null,
    genreIds: f.genreIds ?? [],
    runtime,
    originalLanguage: clean(f.originalLanguage),
    custom,
  };
}

/** A stable hue for a title's placeholder poster. */
export function titleHue(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
