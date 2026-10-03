import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDetails } from '../src/api/tmdb';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import type { UserItem } from '../src/lib/types';
import { shuffle, streamingNow } from '../src/reco/home';

// Which providers carry each title; tests change it between checks. Details come straight from here,
// so these tests cover the Home logic, not the TMDB cache (tests/cache.test.ts does that).
let carriers: Record<number, string[]> = {};

vi.mock('../src/api/tmdb', async (original) => ({
  ...(await original<typeof import('../src/api/tmdb')>()),
  getDetails: vi.fn(async (_type: string, id: number) => ({
    id,
    title: `T${id}`,
    genres: [],
    'watch/providers': { results: { IN: { flatrate: (carriers[id] ?? []).map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: '' })) } } },
  })),
}));

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix', 'prime'] };
const item = (id: number, lists = ['watchlist']): UserItem => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: `T${id}`, genreIds: [], lists, addedAt: 0, updatedAt: id });

describe('Home shelves', () => {
  beforeEach(async () => {
    vi.mocked(getDetails).mockClear();
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
    expect(getDetails).toHaveBeenCalledTimes(3); // watched titles aren't checked

    carriers = { 1: ['Netflix'], 2: ['Some Other'], 3: ['Amazon Prime Video'] };
    const second = await streamingNow(items, settings, 2_000);
    expect(second.map((s) => [s.item.key, s.isNew])).toEqual([
      ['movie:3', true],
      ['movie:1', false],
    ]);
    // Still "new" a few days later, but not after a week.
    expect((await streamingNow(items, settings, 2_000 + 3 * 86_400_000)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(true);
    expect((await streamingNow(items, settings, 2_000 + 8 * 86_400_000)).find((s) => s.item.key === 'movie:3')?.isNew).toBe(false);
  });

  it('never asks TMDB about custom titles', async () => {
    await streamingNow([item(-5)], settings);
    expect(getDetails).not.toHaveBeenCalled();
  });
});
