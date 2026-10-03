import Dexie, { type Table } from 'dexie';
import type { CustomList, UserItem } from '../lib/types';

export interface KvRow {
  key: string;
  value: unknown;
}

export interface CacheRow {
  key: string;
  value: unknown;
  expires: number;
}

class MovieMangoDb extends Dexie {
  items!: Table<UserItem, string>;
  lists!: Table<CustomList, string>;
  kv!: Table<KvRow, string>;
  cache!: Table<CacheRow, string>;

  constructor() {
    super('moviemango');
    this.version(1).stores({
      items: 'key, type, updatedAt',
      lists: 'id, updatedAt',
      kv: 'key',
      cache: 'key, expires',
    });
  }
}

export const db = new MovieMangoDb();

const MAX_CACHE_ROWS = 4000;

/** Drops expired cache rows and trims the oldest when the cache grows too large. */
export async function pruneCache() {
  await db.cache.where('expires').below(Date.now()).delete();
  const count = await db.cache.count();
  if (count > MAX_CACHE_ROWS) {
    const extra = await db.cache.orderBy('expires').limit(count - MAX_CACHE_ROWS).primaryKeys();
    await db.cache.bulkDelete(extra);
  }
}
