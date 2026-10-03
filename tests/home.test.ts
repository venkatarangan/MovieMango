import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import type { UserItem } from '../src/lib/types';
import { shuffle, streamingNow } from '../src/reco/home';

// Which providers carry each title; tests change it between checks.
let carriers: Record<number, string[]> = {};

function fakeFetch(url: string): Response {
  const u = new URL(url);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  const m = u.pathname.match(/\/3\/movie\/(-?\d+)$/);
  if (!m) return new Response('not found', { status: 404 });
  const id = Number(m[1]);
  return json({ id, title: `T${id}`, genres: [], 'watch/providers': { results: { IN: { flatrate: (carriers[id] ?? []).map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: '' })) } } } });
}

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix', 'prime'] };
const item = (id: number, lists = ['watchlist']): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [], lists, addedAt: 0, updatedAt: id });

describe('Home shelves', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeFetch(url)));
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
  });

  it('shuffles the same way for the same seed, and differently for another', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(list, 42)).toEqual(shuffle(list, 42));
    expect(shuffle(list, 42)).not.toEqual(shuffle(list, 43));
    expect([...shuffle(list, 7)].sort((a, b) => a - b)).toEqual(list);
  });

  it('lists watchlist titles on my services, and flags a service that arrives later as new', async () => {
    carriers = { 1: ['Netflix'], 2: ['Some Other'], 3: [] };
    const items = [item(1), item(2), item(3), item(4, ['watched'])];
    const first = await streamingNow(items, settings, 1_000);
    expect(first.map((s) => [s.item.key, s.isNew])).toEqual([['movie:1', false]]);

    carriers = { 1: ['Netflix'], 2: ['Some Other'], 3: ['Amazon Prime Video'] };
    await db.cache.clear();
    const second = await streamingNow(items, settings, 2_000);
    expect(second.map((s) => [s.item.key, s.isNew])).toEqual([
      ['movie:3', true],
      ['movie:1', false],
    ]);
    // Still "new" a few days later, but not after a week.
    await db.cache.clear();
    expect((await streamingNow(items, settings, 2_000 + 3 * 86_400_000)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(true);
    await db.cache.clear();
    expect((await streamingNow(items, settings, 2_000 + 8 * 86_400_000)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(false);
  });

  it('never asks TMDB about custom titles', async () => {
    carriers = {};
    await streamingNow([item(-5)], settings);
    expect(fetch).not.toHaveBeenCalled();
  });
});
