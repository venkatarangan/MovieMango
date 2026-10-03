import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './index';
import { itemKey, MAX_CUSTOM_LISTS, type CustomList, type MangoRating, type TitleSnapshot, type UserItem } from '../lib/types';

const now = () => Date.now();

async function upsert(snapshot: TitleSnapshot, change: (item: UserItem) => void): Promise<UserItem> {
  const key = itemKey(snapshot.type, snapshot.tmdbId);
  return db.transaction('rw', db.items, async () => {
    const existing = await db.items.get(key);
    // Prefer the richer snapshot fields (details beat search results) without dropping known ones.
    const merged: UserItem = {
      ...(existing ?? { key, lists: [], addedAt: now(), updatedAt: now() }),
      ...Object.fromEntries(Object.entries(snapshot).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))),
      key,
    } as UserItem;
    if (!merged.genreIds) merged.genreIds = [];
    change(merged);
    merged.updatedAt = now();
    await db.items.put(merged);
    return merged;
  });
}

export async function toggleList(snapshot: TitleSnapshot, list: string, on?: boolean) {
  return upsert(snapshot, (item) => {
    const has = item.lists.includes(list);
    const want = on ?? !has;
    if (want && !has) item.lists = [...item.lists, list];
    if (!want && has) item.lists = item.lists.filter((l) => l !== list);
    if (list === 'watched' && want) {
      item.watchedAt = now();
      item.lists = item.lists.filter((l) => l !== 'watchlist');
    }
  });
}

export async function setRating(snapshot: TitleSnapshot, rating: MangoRating | undefined) {
  return upsert(snapshot, (item) => {
    item.rating = rating;
    if (rating && !item.lists.includes('watched')) {
      item.lists = [...item.lists.filter((l) => l !== 'watchlist'), 'watched'];
      item.watchedAt = item.watchedAt ?? now();
    }
  });
}

export async function markNever(snapshot: TitleSnapshot, never = true) {
  return upsert(snapshot, (item) => {
    item.feedback = never ? 'never' : undefined;
  });
}

export async function markNotTonight(snapshot: TitleSnapshot, days = 7) {
  return upsert(snapshot, (item) => {
    item.notTonightUntil = now() + days * 24 * 3600_000;
  });
}

const SNAPSHOT_KEYS = ['tmdbId', 'type', 'title', 'year', 'posterPath', 'genreIds', 'runtime', 'originalLanguage', 'voteAverage', 'voteCount', 'keywordIds', 'peopleIds', 'custom'] as const;

/** Just the title details of a saved item, without lists or ratings. */
export function toSnapshot(item: UserItem): TitleSnapshot {
  return Object.fromEntries(SNAPSHOT_KEYS.filter((k) => item[k] !== undefined).map((k) => [k, item[k]])) as unknown as TitleSnapshot;
}

/**
 * Creates or edits a custom title (negative tmdbId): replaces its details, keeps lists and rating.
 * If the type changed, the old record becomes an empty tombstone so sync doesn't bring it back.
 */
export async function saveCustomTitle(snap: TitleSnapshot, opts: { list?: string; previousKey?: string } = {}): Promise<UserItem> {
  const key = itemKey(snap.type, snap.tmdbId);
  const prevKey = opts.previousKey ?? key;
  return db.transaction('rw', db.items, async () => {
    const existing = await db.items.get(prevKey);
    const state: Partial<UserItem> = { ...existing };
    for (const k of SNAPSHOT_KEYS) delete state[k];
    const item = { lists: [], addedAt: now(), ...state, ...snap, key, updatedAt: now() } as UserItem;
    if (!item.genreIds) item.genreIds = [];
    if (opts.list && !item.lists.includes(opts.list)) item.lists = [...item.lists, opts.list];
    if (item.lists.includes('watched')) item.watchedAt ??= now();
    if (existing && prevKey !== key) await db.items.put({ ...existing, lists: [], rating: undefined, updatedAt: now() });
    await db.items.put(item);
    return item;
  });
}

/** "Deletes" a custom title: it leaves every list and loses its rating; the empty record stops sync bringing it back. */
export async function removeCustomTitle(key: string) {
  await db.items.update(key, { lists: [], rating: undefined, feedback: undefined, updatedAt: now() });
}

/** Adds a title to lists and sets a rating, never taking it out of a list (for imports). */
export async function importItem(snapshot: TitleSnapshot, lists: string[], rating?: MangoRating) {
  return upsert(snapshot, (item) => {
    for (const l of lists) if (!item.lists.includes(l)) item.lists = [...item.lists, l];
    if (item.lists.includes('watched')) item.watchedAt ??= now();
    if (rating) item.rating = rating;
  });
}

export async function createList(name: string, emoji?: string): Promise<CustomList> {
  const active = await db.lists.filter((l) => !l.deleted).count();
  if (active >= MAX_CUSTOM_LISTS) throw new Error(`You can have up to ${MAX_CUSTOM_LISTS} custom lists.`);
  const list: CustomList = { id: `l_${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), emoji, createdAt: now(), updatedAt: now() };
  await db.lists.put(list);
  return list;
}

export async function renameList(id: string, name: string, emoji?: string) {
  await db.lists.update(id, { name: name.trim(), emoji, updatedAt: now() });
}

/** Soft-deletes the list (kept as a tombstone for sync) and removes it from every item. */
export async function deleteList(id: string) {
  await db.transaction('rw', db.items, db.lists, async () => {
    await db.lists.update(id, { deleted: true, updatedAt: now() });
    const items = await db.items.filter((i) => i.lists.includes(id)).toArray();
    for (const item of items) await db.items.put({ ...item, lists: item.lists.filter((l) => l !== id), updatedAt: now() });
  });
}

export function useItem(type: string | undefined, id: number | undefined) {
  return useLiveQuery(() => (type && id ? db.items.get(`${type}:${id}`) : undefined), [type, id]);
}

export function useListItems(list: string) {
  return useLiveQuery(async () => {
    const items = await db.items.filter((i) => i.lists.includes(list)).toArray();
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [list]);
}

export function useCustomLists() {
  return useLiveQuery(async () => (await db.lists.filter((l) => !l.deleted).toArray()).sort((a, b) => a.createdAt - b.createdAt));
}

export function useAllItems() {
  return useLiveQuery(() => db.items.toArray());
}

export const listLabel: Record<string, string> = { favourite: 'Favourites', watchlist: 'Watchlist', watched: 'Watched' };
