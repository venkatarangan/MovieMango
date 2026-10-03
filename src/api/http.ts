import { db, onCacheReset } from '../db';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Minimum gap between requests to the same host, to stay well inside each API's limits. */
const HOST_INTERVAL_MS: Record<string, number> = {
  'api.themoviedb.org': 60, // TMDB allows ~40-50 req/s; we stay far below
  'en.wikipedia.org': 200,
  'www.wikidata.org': 200,
  'public-api.wordpress.com': 250,
  'generativelanguage.googleapis.com': 1000,
};

const nextSlot = new Map<string, number>();

async function waitForSlot(host: string) {
  const gap = HOST_INTERVAL_MS[host] ?? 100;
  const now = Date.now();
  const prev = nextSlot.get(host) ?? 0;
  const slot = prev - now > 60_000 ? now : Math.max(now, prev); // ignore slots left over from a clock jump
  nextSlot.set(host, slot + gap);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

/** fetch() with per-host pacing and exponential backoff on 429/5xx. */
export async function politeFetch(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await waitForSlot(host);
    const res = await fetch(url, init);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, 500 * 2 ** attempt)));
      continue;
    }
    return res;
  }
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await politeFetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.status_message || body.message || body.error?.message || message;
    } catch {
      /* body wasn't JSON */
    }
    throw new HttpError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** After a failed refresh, keep serving the old value this long before trying the network again. */
export const FAILURE_COOLDOWN_MS = 2 * 60_000;

/** Network down, rate-limited or server trouble: worth serving an old copy instead of an error. Auth errors and 404s are not. */
export function isTransientError(e: unknown): boolean {
  if (e instanceof HttpError) return e.status === 429 || e.status >= 500;
  return e instanceof TypeError || e instanceof SyntaxError || (e instanceof Error && e.name === 'AbortError');
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// --- Session memory layer: repeated reads in one session skip IndexedDB entirely. ---

const MEMORY_MAX = 500;
const memory = new Map<string, { value: unknown; expires: number }>();

function recall(key: string) {
  const hit = memory.get(key);
  if (hit) {
    memory.delete(key);
    memory.set(key, hit); // keep Map order = least recently used first
  }
  return hit;
}

function remember(key: string, value: unknown, expires: number) {
  memory.delete(key);
  memory.set(key, { value, expires });
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

/** Empties the session memory layer (IndexedDB is untouched). Runs automatically on db open and on `db.cache.clear()`. */
export function clearMemoryCache() {
  memory.clear();
}
onCacheReset(clearMemoryCache);

export interface CacheOptions<T> {
  /** Once expired, keep returning the old value for up to this long while refreshing it in the background. */
  swrMs?: number;
  /** Per-value TTL, overriding `ttlMs` (e.g. longer for finished TV seasons). */
  ttlFor?: (value: T) => number;
}

const inflight = new Map<string, Promise<unknown>>();

function load<T>(key: string, ttlMs: number, loader: () => Promise<T>, opts: CacheOptions<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = loader()
    .then(async (value) => {
      const expires = Date.now() + (opts.ttlFor?.(value) ?? ttlMs);
      remember(key, value, expires);
      await db.cache.put({ key, value, expires }).catch(() => undefined);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * Memory → IndexedDB → network. Fresh values never touch the network; concurrent loads share one request.
 * Expired values are served while refreshing in the background within `swrMs`, and are returned instead of
 * an error when the network is down or the API rate-limits (429) or fails (5xx).
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>, opts: CacheOptions<T> = {}): Promise<T> {
  const now = Date.now();
  let hit = recall(key);
  if (hit && hit.expires > now) return hit.value as T;
  const row = await db.cache.get(key).catch(() => undefined);
  if (row && (!hit || row.expires > hit.expires)) {
    hit = { value: row.value, expires: row.expires };
    remember(key, row.value, row.expires);
  }
  if (!hit) return load(key, ttlMs, loader, opts);
  const stale = hit;
  if (stale.expires > now) return stale.value as T;

  const coolDown = () => remember(key, stale.value, Date.now() + FAILURE_COOLDOWN_MS);
  if (isOffline()) {
    coolDown();
    return stale.value as T;
  }
  if (opts.swrMs && now - stale.expires < opts.swrMs) {
    load(key, ttlMs, loader, opts).catch(coolDown);
    return stale.value as T;
  }
  try {
    return await load(key, ttlMs, loader, opts);
  } catch (e) {
    if (!isTransientError(e)) throw e;
    coolDown();
    return stale.value as T;
  }
}
