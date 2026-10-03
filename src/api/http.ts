import { db } from '../db';

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
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
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

const inflight = new Map<string, Promise<unknown>>();

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Returns a cached value when fresh, otherwise loads, stores and returns it. Concurrent calls share one load. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const row = await db.cache.get(key).catch(() => undefined);
  if (row && row.expires > Date.now()) return row.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = load()
    .then(async (value) => {
      await db.cache.put({ key, value, expires: Date.now() + ttlMs }).catch(() => undefined);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
