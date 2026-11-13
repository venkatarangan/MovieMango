import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWatchProviders } from '../src/api/tmdb';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import { resetStreamingQueue } from '../src/db/streaming';
import type { UserItem } from '../src/lib/types';
import { shuffle, streamingNow } from '../src/reco/home';

// Which providers carry each title; tests change it between checks. Providers come straight from here,
// so these tests cover the Home logic and the shared streaming store, not the TMDB cache.
let carriers: Record<number, string[]> = {};

vi.mock('../src/api/tmdb', async (original) => ({
  ...(await original<typeof import('../src/api/tmdb')>()),
  getWatchProviders: vi.fn(async (_type: string, id: number) => ({
    IN: { flatrate: (carriers[id] ?? []).map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: `/${p}.png` })) },
  })),
}));

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix', 'prime'] };
const item = (id: number, lists = ['watchlist']): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [], lists, addedAt: 0, updatedAt: id });
const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 1);

describe('Home shelves', () => {
  beforeEach(async () => {
    vi.mocked(getWatchProviders).mockClear();
    resetStreamingQueue();
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
  });
  afterEach(() => vi.useRealTimers());

  it('shuffles the same way for the same seed, and differently for another', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(list, 42)).toEqual(shuffle(list, 42));
    expect(shuffle(list, 42)).not.toEqual(shuffle(list, 43));
    expect([...shuffle(list, 7)].sort((a, b) => a - b)).toEqual(list);
  });

  it('lists watchlist titles on my services, re-checks after 2 days, and flags a later arrival as new for a week', async () => {
    carriers = { 1: ['Netflix'], 2: ['Some Other'], 3: [] };
    const items = [item(1), item(2), item(3), item(4, ['watched'])];
    await db.items.bulkPut(items);
    const first = await streamingNow(items, settings, T);
    expect(first.map((s) => [s.item.key, s.isNew])).toEqual([['movie:1', false]]);
    expect(first[0].services.map((s) => s.key)).toEqual(['netflix']);
    expect(getWatchProviders).toHaveBeenCalledTimes(3); // watched titles aren't checked

    // Within 2 days the saved info is used: no TMDB calls.
    vi.setSystemTime(T + DAY);
    await streamingNow(items, settings, T + DAY);
    expect(getWatchProviders).toHaveBeenCalledTimes(3);

    carriers = { 1: ['Netflix'], 2: ['Some Other'], 3: ['Amazon Prime Video'] };
    vi.setSystemTime(T + 3 * DAY);
    const second = await streamingNow(items, settings, T + 3 * DAY);
    expect(getWatchProviders).toHaveBeenCalledTimes(6);
    expect(second.map((s) => [s.item.key, s.isNew])).toEqual([
      ['movie:3', true],
      ['movie:1', false],
    ]);
    vi.setSystemTime(T + 4 * DAY);
    expect((await streamingNow(items, settings, T + 4 * DAY)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(true);
    vi.setSystemTime(T + 11 * DAY);
    expect((await streamingNow(items, settings, T + 11 * DAY)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(false);
    // The Library and posters read the same rows.
    expect((await db.streaming.get('movie:3'))?.services.map((s) => s.key)).toEqual(['prime']);
  });

  it('never asks TMDB about custom titles', async () => {
    await streamingNow([item(-5)], settings);
    expect(getWatchProviders).not.toHaveBeenCalled();
  });
});
