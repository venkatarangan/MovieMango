import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './index';
import { computeNextEpisode, withEpisode, withSeason, withSeenUpTo, type EpisodesSeen, type SeasonInfo } from '../lib/episodes';
import { itemKey, MAX_CUSTOM_LISTS, type CustomList, type MyRating, type TitleSnapshot, type UserItem } from '../lib/types';

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
    // Saving it for later takes back a 👎.
    if (list === 'watchlist' && want && item.rating === 'dislike') item.rating = undefined;
  });
}

/**
 * 👍 and ❤️ mark the title watched. 👎 takes it off the watchlist and out of suggestions,
 * but doesn't claim it was watched (it can mean "not interested").
 */
export async function setRating(snapshot: TitleSnapshot, rating: MyRating | undefined) {
  return upsert(snapshot, (item) => {
    item.rating = rating;
    if (rating) item.lists = item.lists.filter((l) => l !== 'watchlist');
    if ((rating === 'like' || rating === 'love') && !item.lists.includes('watched')) {
      item.lists = [...item.lists, 'watched'];
      item.watchedAt = item.watchedAt ?? now();
    }
  });
}

export async function markNotTonight(snapshot: TitleSnapshot, days = 7) {
  return upsert(snapshot, (item) => {
    item.notTonightUntil = now() + days * 24 * 3600_000;
  });
}

/** Puts lists, rating, watched date and "not tonight" back as they were (for Undo). `prev` undefined means "never saved". */
export async function restoreItem(snapshot: TitleSnapshot, prev: UserItem | undefined) {
  return upsert(snapshot, (item) => {
    item.lists = prev?.lists ?? [];
    item.rating = prev?.rating;
    item.watchedAt = prev?.watchedAt;
    item.notTonightUntil = prev?.notTonightUntil;
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
  await db.items.update(key, { lists: [], rating: undefined, updatedAt: now() });
}

/** Adds a title to lists and sets a rating, never taking it out of a list (for imports). */
export async function importItem(snapshot: TitleSnapshot, lists: string[], rating?: MyRating) {
  return upsert(snapshot, (item) => {
    for (const l of lists) if (!item.lists.includes(l)) item.lists = [...item.lists, l];
    if (rating) item.rating = rating;
    if ((rating === 'like' || rating === 'love') && !item.lists.includes('watched')) item.lists = [...item.lists, 'watched'];
    if (item.lists.includes('watched')) item.watchedAt ??= now();
  });
}

/** Saves episode progress and recomputes nextEpisode. Lists are left alone. */
function setEpisodes(snapshot: TitleSnapshot, update: (seen: EpisodesSeen | undefined) => EpisodesSeen, seasons?: SeasonInfo[]) {
  return upsert(snapshot, (item) => {
    const seen = update(item.episodesSeen);
    item.episodesSeen = Object.keys(seen).length ? seen : undefined;
    item.nextEpisode = item.episodesSeen ? computeNextEpisode(item.episodesSeen, seasons) : undefined;
  });
}

/** `seasons` is the show's season list (aired counts), used to work out the next episode. */
export async function toggleEpisode(snapshot: TitleSnapshot, season: number, episode: number, on?: boolean, seasons?: SeasonInfo[]) {
  return setEpisodes(snapshot, (seen) => withEpisode(seen, season, episode, on ?? !seen?.[String(season)]?.includes(episode)), seasons);
}

export async function setSeasonSeen(snapshot: TitleSnapshot, season: number, episodeCount: number, on: boolean, seasons?: SeasonInfo[]) {
  return setEpisodes(snapshot, (seen) => withSeason(seen, season, episodeCount, on), seasons);
}

/** Marks this episode and everything before it, including earlier seasons. */
export async function markSeenUpTo(snapshot: TitleSnapshot, season: number, episode: number, seasons?: SeasonInfo[]) {
  return setEpisodes(snapshot, (seen) => withSeenUpTo(seen, season, episode, seasons), seasons);
}

/** Recomputes a stale nextEpisode (new episodes aired, or a name is now known). Writes only when it changed. */
export async function refreshNextEpisode(snapshot: TitleSnapshot, seasons: SeasonInfo[]) {
  const item = await db.items.get(itemKey(snapshot.type, snapshot.tmdbId));
  if (!item?.episodesSeen) return;
  const next = computeNextEpisode(item.episodesSeen, seasons);
  const cur = item.nextEpisode;
  const same = next?.season === cur?.season && next?.episode === cur?.episode && (!next?.name || next.name === cur?.name);
  if (!same) await setEpisodes(snapshot, (seen) => seen ?? {}, seasons);
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

/** Library views: the built-in lists, plus 'loved' and 'notforme' (by rating), or a custom list id. */
export const inView = (view: string) => (i: UserItem) =>
  view === 'loved' ? i.rating === 'love' : view === 'notforme' ? i.rating === 'dislike' : i.lists.includes(view);

export function useListItems(list: string) {
  return useLiveQuery(async () => {
    const items = await db.items.filter(inView(list)).toArray();
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [list]);
}

export function useCustomLists() {
  return useLiveQuery(async () => (await db.lists.filter((l) => !l.deleted).toArray()).sort((a, b) => a.createdAt - b.createdAt));
}

export function useAllItems() {
  return useLiveQuery(() => db.items.toArray());
}

/** TV shows with some episodes seen, not finished or hidden; most recently updated first. */
export function useShowsInProgress() {
  return useLiveQuery(async () => {
    const items = await db.items.where('type').equals('tv').filter((i) => !!i.episodesSeen && Object.keys(i.episodesSeen).length > 0 && !i.lists.includes('watched') && i.rating !== 'dislike').toArray();
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  });
}

export const listLabel: Record<string, string> = { watchlist: 'Watchlist', watched: 'Watched', loved: 'Loved', notforme: 'Not for me' };
