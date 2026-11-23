import { useLiveQuery } from 'dexie-react-hooks';
import { favRow, liveFavourites, tombstone, type FavPerson, type PersonInfo } from '../lib/people';
import { db } from './index';

/** Favourites, most recently added first, or undefined while loading. */
export const useFavouritePeople = () => useLiveQuery(async () => liveFavourites(await db.people.toArray()));

/** undefined while loading. */
export const useIsFavourite = (id: number) =>
  useLiveQuery(async () => {
    const row = await db.people.get(id);
    return !!row && !row.deleted;
  }, [id]);

export async function getFavouritePeople(): Promise<FavPerson[]> {
  return liveFavourites(await db.people.toArray().catch(() => []));
}

/** Favourite (or un-favourite) a person. Returns the earlier row so the caller can offer Undo. Never touches any list. */
export async function setFavourite(person: PersonInfo, on: boolean): Promise<FavPerson | undefined> {
  return db.transaction('rw', db.people, async () => {
    const prev = await db.people.get(person.id);
    if (on) await db.people.put(favRow(person, prev, Date.now()));
    else if (prev && !prev.deleted) await db.people.put(tombstone(prev, Date.now()));
    return prev;
  });
}

/** Undo: puts back what was there before (or removes a person who wasn't there). */
export async function restoreFavourite(person: PersonInfo, prev: FavPerson | undefined) {
  await db.transaction('rw', db.people, async () => {
    const now = Date.now();
    if (prev) await db.people.put({ ...prev, updatedAt: Math.max(now, (await db.people.get(person.id))?.updatedAt ?? 0) + 1 });
    else {
      const cur = await db.people.get(person.id);
      if (cur) await db.people.put(tombstone(cur, now));
    }
  });
}
