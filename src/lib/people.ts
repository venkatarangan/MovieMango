/**
 * Favourite people (actors, directors, other crew). Only a mark that you're interested in them:
 * favouriting never adds a title to any list. Stored in the Dexie `people` table, synced to Drive
 * and included in backups. A removed person stays as a tombstone (`deleted`) so sync doesn't bring them back.
 */
export interface FavPerson {
  /** TMDB person id. */
  id: number;
  name: string;
  profilePath?: string | null;
  /** TMDB `known_for_department`, e.g. Acting or Directing. */
  department?: string;
  addedAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** The part of a TMDB person we keep. */
export interface PersonInfo {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
}

export const departmentLabel = (d?: string) => (d === 'Acting' ? 'Actor' : d === 'Directing' ? 'Director' : d || '');

/** A favourite's row. Keeps the original `addedAt` when re-saving; a re-favourited tombstone starts fresh. */
export function favRow(p: PersonInfo, prev: FavPerson | undefined, now: number): FavPerson {
  const row: FavPerson = { id: p.id, name: p.name, profilePath: p.profile_path ?? null, addedAt: prev && !prev.deleted ? prev.addedAt : now, updatedAt: now };
  if (p.known_for_department) row.department = p.known_for_department;
  return row;
}

/** The removal marker: same person, `deleted`, newer than any copy on another device. */
export const tombstone = (prev: FavPerson, now: number): FavPerson => ({ ...prev, deleted: true, updatedAt: Math.max(now, prev.updatedAt + 1) });

/** People still favourited, most recently added first. */
export const liveFavourites = (list: FavPerson[]): FavPerson[] => list.filter((p) => !p.deleted).sort((a, b) => b.addedAt - a.addedAt || b.id - a.id);

/** Drops anything that isn't a usable record (older apps, hand-edited files), so one bad row can't break a sync or restore. */
export function cleanPeople(raw: unknown): FavPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: FavPerson[] = [];
  for (const r of raw as Partial<FavPerson>[]) {
    if (!r || !Number.isInteger(r.id) || (r.id as number) <= 0 || typeof r.name !== 'string' || !r.name.trim() || !Number.isFinite(r.updatedAt)) continue;
    // Same key order as favRow, so a cleaned copy compares equal (as JSON) to a stored one and sync sees no change.
    const p: FavPerson = { id: r.id as number, name: r.name.slice(0, 200), profilePath: typeof r.profilePath === 'string' ? r.profilePath : null, addedAt: Number.isFinite(r.addedAt) ? (r.addedAt as number) : (r.updatedAt as number), updatedAt: r.updatedAt as number };
    if (typeof r.department === 'string' && r.department) p.department = r.department.slice(0, 40);
    if (r.deleted) p.deleted = true;
    out.push(p);
  }
  return out;
}
