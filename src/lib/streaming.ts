import { SERVICES } from './providers';
import { isCustom, type UserItem } from './types';

/**
 * Where a title streams (subscription, free or ads, in the user's region), as saved on this device.
 * One row per title in the `streaming` table, keyed like items (`movie:123`). Rows for titles in the
 * library sync to Drive; rows for titles only seen while browsing stay local and expire.
 * Pure helpers here; the store and checker are in src/db/streaming.ts.
 */
export interface StreamingService {
  /** A ServiceDef key, e.g. 'netflix'. */
  key: string;
  /** TMDB logo path for this title's provider entry. */
  logo?: string;
  /** When we first saw this service carry the title (drives "New"). */
  since: number;
}

export interface StreamingRow {
  key: string;
  /** Services carrying the title, in SERVICES order. Empty means "not streaming". */
  services: StreamingService[];
  firstCheckedAt: number;
  checkedAt: number;
  /** Same as checkedAt; named for the newest-wins sync merge. */
  updatedAt: number;
}

export interface FoundService {
  key: string;
  logo?: string;
}

/** Browse titles (not in the library) are checked again after this. */
export const STREAMING_FRESH_MS = 2 * 24 * 3600_000;
/** A service that arrived after the first check is "New" for this long. */
export const NEW_FOR_MS = 7 * 24 * 3600_000;

const ORDER = new Map(SERVICES.map((s, i) => [s.key, i]));

/** The row after a check (or after free data from a title page). Keeps when each service was first seen. */
export function nextRow(prev: StreamingRow | undefined, key: string, found: FoundService[], now: number): StreamingRow {
  const seen = new Set<string>();
  const services = found
    .filter((f) => ORDER.has(f.key) && !seen.has(f.key) && seen.add(f.key))
    .sort((a, b) => ORDER.get(a.key)! - ORDER.get(b.key)!)
    .map((f) => {
      const before = prev?.services.find((s) => s.key === f.key);
      return { key: f.key, logo: f.logo || before?.logo || undefined, since: before?.since ?? now };
    });
  for (const s of services) if (!s.logo) delete s.logo;
  return { key, services, firstCheckedAt: prev?.firstCheckedAt ?? now, checkedAt: now, updatedAt: now };
}

const keySet = (keys: string[]) => [...new Set(keys.filter((k) => ORDER.has(k)))].sort().join(',');

/** The same services as last time (logos and dates aside). */
export const sameServices = (row: StreamingRow | undefined, found: FoundService[]) => !!row && keySet(row.services.map((s) => s.key)) === keySet(found.map((f) => f.key));

/** Whether a title needs a TMDB check: never checked, or (for titles not in the library) older than 2 days. */
export function needsCheck(row: StreamingRow | undefined, saved: boolean, now: number, maxAgeMs?: number): boolean {
  if (!row) return true;
  if (maxAgeMs !== undefined) return now - row.checkedAt > maxAgeMs;
  return !saved && now - row.checkedAt > STREAMING_FRESH_MS;
}

/** One of the user's services arrived after the first check, within the last week. */
export function isNewRow(row: StreamingRow | undefined, mine: string[], now: number): boolean {
  return !!row?.services.some((s) => mine.includes(s.key) && s.since > row.firstCheckedAt && now - s.since < NEW_FOR_MS);
}

/** Poster badge: up to `max` logos, the user's services first; others only when none of theirs carry it. */
export function badgeServices(row: StreamingRow | undefined, mine: string[], max = 2): { shown: StreamingService[]; more: number } {
  if (!row?.services.length) return { shown: [], more: 0 };
  const own = row.services.filter((s) => mine.includes(s.key));
  const list = own.length ? own : row.services;
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

/** Library filter: Any (undefined), on any of my services, one service, or not streaming anywhere we know. */
export type StreamFilter = 'mine' | 'none' | (string & {});

/** true/false, or undefined when we can't tell yet (never checked, or a custom title). */
export function matchesStream(row: StreamingRow | undefined, filter: StreamFilter, mine: string[]): boolean | undefined {
  if (!row) return undefined;
  if (filter === 'none') return row.services.length === 0;
  if (filter === 'mine') return row.services.some((s) => mine.includes(s.key));
  return row.services.some((s) => s.key === filter);
}

export interface StreamCounts {
  mine: number;
  none: number;
  byService: Record<string, number>;
  /** Checkable titles with no saved info yet. */
  unknown: number;
  /** Custom titles: never checked. */
  custom: number;
}

export function streamCounts(items: UserItem[], rows: Map<string, StreamingRow>, mine: string[]): StreamCounts {
  const out: StreamCounts = { mine: 0, none: 0, byService: {}, unknown: 0, custom: 0 };
  for (const i of items) {
    if (isCustom(i)) {
      out.custom++;
      continue;
    }
    const row = rows.get(i.key);
    if (!row) {
      out.unknown++;
      continue;
    }
    if (!row.services.length) out.none++;
    if (row.services.some((s) => mine.includes(s.key))) out.mine++;
    for (const s of row.services) out.byService[s.key] = (out.byService[s.key] ?? 0) + 1;
  }
  return out;
}
