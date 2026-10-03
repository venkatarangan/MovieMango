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

/** Full TMDB details for a recently viewed or fetched title (see src/api/recent.ts). Key is `movie:123` / `tv:456`. */
export interface TitleRow {
  key: string;
  data: unknown;
  /** When the full details response was fetched. */
  fetchedAt: number;
  /** When the watch-provider block inside `data` was last refreshed. */
  providersAt: number;
  /** Last read, for LRU eviction. */
  accessedAt: number;
}

class MovieMangoDb extends Dexie {
  items!: Table<UserItem, string>;
  lists!: Table<CustomList, string>;
  kv!: Table<KvRow, string>;
  cache!: Table<CacheRow, string>;
  titles!: Table<TitleRow, string>;

  constructor() {
    super('moviemango');
    this.version(1).stores({
      items: 'key, type, updatedAt',
      lists: 'id, updatedAt',
      kv: 'key',
      cache: 'key, expires',
    });
    // v2 only adds the recent-titles store; existing tables and rows are kept as they are.
    this.version(2).stores({ titles: 'key, accessedAt' });
  }
}

export const db = new MovieMangoDb();

/** Hooks run after every open (so tests that delete and reopen start clean) and after `db.cache.clear()` (Settings → Clear cache). */
const resetHooks = new Set<() => void>();
export function onCacheReset(fn: () => void) {
  resetHooks.add(fn);
}
const runResetHooks = () => resetHooks.forEach((fn) => fn());
db.on('ready', runResetHooks, true);

// A full clear of `cache` also drops the in-memory session layer and the recent-titles store.
db.use({
  stack: 'dbcore',
  name: 'cacheClear',
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name);
        if (name !== 'cache') return table;
        return {
          ...table,
          mutate(req) {
            const fullClear = req.type === 'deleteRange' && req.range.type === 3; // DBCoreRangeType.Any, i.e. Table.clear()
            return table.mutate(req).then((res) => {
              if (fullClear)
                setTimeout(() => {
                  runResetHooks();
                  void db.titles.clear().catch(() => undefined);
                });
              return res;
            });
          },
        };
      },
    };
  },
});

const MAX_CACHE_ROWS = 4000;
/** Expired rows are kept this long so they can still be served when TMDB is unreachable or rate-limits us. */
export const STALE_KEEP_MS = 30 * 24 * 3600_000;

/** Drops long-expired cache rows and trims the oldest when the cache grows too large. Never touches `titles`. */
export async function pruneCache() {
  await db.cache.where('expires').below(Date.now() - STALE_KEEP_MS).delete();
  const count = await db.cache.count();
  if (count > MAX_CACHE_ROWS) {
    const extra = await db.cache.orderBy('expires').limit(count - MAX_CACHE_ROWS).primaryKeys();
    await db.cache.bulkDelete(extra);
  }
}
