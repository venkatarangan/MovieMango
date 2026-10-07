import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { markSeenUpTo, setRating, refreshNextEpisode, setSeasonSeen, toggleEpisode, toggleList, useShowsInProgress } from '../src/db/items';
import { airedSeasons, computeNextEpisode, countProgress, hasAired, mainSeasons, withSeenUpTo } from '../src/lib/episodes';

const seasons = [
  { season_number: 0, episode_count: 3, name: 'Specials' },
  { season_number: 1, episode_count: 3, name: 'Season 1' },
  { season_number: 2, episode_count: 4, name: 'Season 2' },
];

describe('episode logic', () => {
  it('starts at S1 E1 and ignores specials', () => {
    expect(computeNextEpisode({}, seasons)).toEqual({ season: 1, episode: 1 });
    expect(computeNextEpisode({ '0': [1, 2, 3] }, seasons)).toEqual({ season: 1, episode: 1 });
    expect(countProgress({ '0': [1, 2, 3], '1': [1] }, seasons)).toEqual({ seen: 1, total: 7 });
  });

  it('moves across seasons and finds gaps first', () => {
    expect(computeNextEpisode({ '1': [1, 2, 3] }, seasons)).toEqual({ season: 2, episode: 1 });
    expect(computeNextEpisode({ '1': [1, 3], '2': [1] }, seasons)).toEqual({ season: 1, episode: 2 });
  });

  it('returns null when caught up, and carries names when known', () => {
    expect(computeNextEpisode({ '1': [1, 2, 3], '2': [1, 2, 3, 4] }, seasons)).toBeNull();
    const named = seasons.map((s) => (s.season_number === 2 ? { ...s, episodes: [{ episode_number: 1, name: 'Return' }] } : s));
    expect(computeNextEpisode({ '1': [1, 2, 3] }, named)).toEqual({ season: 2, episode: 1, name: 'Return' });
  });

  it('uses specials when they are the only season', () => {
    expect(mainSeasons([{ season_number: 0, episode_count: 2 }]).map((s) => s.season_number)).toEqual([0]);
    expect(computeNextEpisode({ '0': [1] }, [{ season_number: 0, episode_count: 2 }])).toEqual({ season: 0, episode: 2 });
  });

  it('treats unaired episodes as not out yet', () => {
    const aired = airedSeasons(seasons, { season_number: 2, episode_number: 2 });
    expect(aired.find((s) => s.season_number === 2)!.episode_count).toBe(2);
    expect(computeNextEpisode({ '1': [1, 2, 3], '2': [1, 2] }, aired)).toBeNull();
    expect(countProgress({ '1': [1, 2, 3], '2': [1, 2] }, aired)).toEqual({ seen: 5, total: 5 });
    expect(airedSeasons(seasons, null).every((s) => s.season_number === 0 || s.episode_count === 0)).toBe(true);
    expect(airedSeasons(seasons, undefined)).toBe(seasons);
    expect(hasAired('2020-01-01', '2026-10-03')).toBe(true);
    expect(hasAired('2026-10-04', '2026-10-03')).toBe(false);
    expect(hasAired(null)).toBe(false);
  });

  it('guesses the next episode without a season list', () => {
    expect(computeNextEpisode({ '1': [1, 2], '2': [1, 3] })).toEqual({ season: 2, episode: 4 });
    expect(computeNextEpisode({})).toBeNull();
  });

  it('marks everything up to an episode', () => {
    expect(withSeenUpTo({ '2': [4] }, 2, 2, seasons)).toEqual({ '1': [1, 2, 3], '2': [1, 2, 4] });
  });
});

describe('episode mutators', () => {
  const show = { tmdbId: 205, type: 'tv' as const, title: 'Little Comets', genreIds: [18] };
  beforeEach(() => db.items.clear());

  it('toggles episodes, keeps lists alone and tracks the next one', async () => {
    let item = await toggleEpisode(show, 1, 1, undefined, seasons);
    expect(item.episodesSeen).toEqual({ '1': [1] });
    expect(item.nextEpisode).toEqual({ season: 1, episode: 2 });
    expect(item.lists).toEqual([]);
    item = await toggleEpisode(show, 1, 1, undefined, seasons);
    expect(item.episodesSeen).toBeUndefined();
    expect(item.nextEpisode).toBeUndefined();
  });

  it('marks seasons and up-to, then null when caught up', async () => {
    await setSeasonSeen(show, 1, 3, true, seasons);
    let item = await markSeenUpTo(show, 2, 3, seasons);
    expect(item.nextEpisode).toEqual({ season: 2, episode: 4 });
    item = await toggleEpisode(show, 2, 4, true, seasons);
    expect(item.nextEpisode).toBeNull();
    item = await setSeasonSeen(show, 2, 4, false, seasons);
    expect(item.episodesSeen).toEqual({ '1': [1, 2, 3] });
    expect(item.nextEpisode).toEqual({ season: 2, episode: 1 });
  });

  it('refreshes a stale next episode only when it changed', async () => {
    const aired = airedSeasons(seasons, { season_number: 1, episode_number: 3 });
    const first = await setSeasonSeen(show, 1, 3, true, aired);
    expect(first.nextEpisode).toBeNull();
    await refreshNextEpisode(show, aired);
    expect((await db.items.get('tv:205'))!.updatedAt).toBe(first.updatedAt);
    await refreshNextEpisode(show, seasons);
    expect((await db.items.get('tv:205'))!.nextEpisode).toEqual({ season: 2, episode: 1 });
  });

  it('lists shows in progress, newest first, without finished or hidden ones', async () => {
    const at = (id: number) => ({ ...show, tmdbId: id });
    for (const id of [205, 206, 207, 208]) await toggleEpisode(at(id), 1, 1, true, seasons);
    await toggleList(at(206), 'watched', true);
    await setRating(at(207), 'dislike');
    await toggleList(at(209), 'watchlist', true);
    await new Promise((r) => setTimeout(r, 5));
    await toggleEpisode(at(205), 1, 2, true, seasons);
    const { result } = renderHook(() => useShowsInProgress());
    await waitFor(() => expect(result.current?.map((i) => i.tmdbId)).toEqual([205, 208]));
  });
});
