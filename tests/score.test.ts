import { describe, expect, it } from 'vitest';
import { buildProfile, itemWeight } from '../src/reco/profile';
import { moodFit, qualityScore, tasteScore, timeFit, totalScore } from '../src/reco/score';
import { defaultMinutes } from '../src/reco/moods';
import type { UserItem } from '../src/lib/types';

const item = (p: Partial<UserItem>): UserItem => ({
  key: `movie:${p.tmdbId ?? 1}`,
  tmdbId: 1,
  type: 'movie',
  title: 'X',
  genreIds: [],
  lists: [],
  addedAt: 0,
  updatedAt: 0,
  ...p,
});

describe('profile', () => {
  it('weights ❤️ 👍 and watched, penalises 👎', () => {
    expect(itemWeight(item({ lists: ['watched'], rating: 'love' }))).toBe(3);
    expect(itemWeight(item({ lists: ['watched'], rating: 'like' }))).toBe(2);
    expect(itemWeight(item({ lists: ['watched'] }))).toBe(1);
    expect(itemWeight(item({ lists: ['watchlist'] }))).toBe(1);
    expect(itemWeight(item({ rating: 'dislike', lists: ['watched'] }))).toBe(-2);
    expect(itemWeight(item({ rating: 'dislike' }))).toBe(-2);
  });

  it('builds normalised genre and language weights with strongest seeds first', () => {
    const p = buildProfile([
      item({ tmdbId: 1, genreIds: [53, 80], originalLanguage: 'ta', lists: ['watched'], rating: 'love' }),
      item({ tmdbId: 2, genreIds: [35], originalLanguage: 'hi', lists: ['watchlist'] }),
      item({ tmdbId: 3, genreIds: [27], originalLanguage: 'en', rating: 'dislike', lists: ['watched'] }),
    ]);
    expect(p.genres[53]).toBe(1);
    expect(p.genres[27]).toBeLessThan(0);
    expect(p.languages.ta).toBe(1);
    expect(p.seeds.map((s) => s.tmdbId)).toEqual([1]);
    expect(p.signal).toBe(3);
  });
});

describe('scoring', () => {
  const profile = buildProfile([item({ tmdbId: 1, genreIds: [53], originalLanguage: 'ta', lists: ['watched'], rating: 'love' })]);

  it('prefers titles like the favourites', () => {
    const liked = tasteScore({ tmdbId: 9, type: 'movie', title: 'A', genreIds: [53], originalLanguage: 'ta' }, profile);
    const other = tasteScore({ tmdbId: 8, type: 'movie', title: 'B', genreIds: [10749], originalLanguage: 'en' }, profile);
    expect(liked).toBeGreaterThan(other);
    expect(tasteScore({ tmdbId: 7, type: 'movie', title: 'C', genreIds: [] }, buildProfile([]))).toBe(0.5);
  });

  it('matches mood to genres and rejects avoided genres', () => {
    expect(moodFit([35], 'laugh', 'movie')).toBeGreaterThan(0.6);
    expect(moodFit([27, 35], 'laugh', 'movie')).toBeLessThan(0.1);
    expect(moodFit([18], 'laugh', 'movie')).toBe(0.25);
    expect(moodFit([18], undefined, 'movie')).toBe(0.5);
  });

  it('fits runtime to the time available', () => {
    expect(timeFit(150, 120, 'movie')).toBe(0);
    expect(timeFit(115, 120, 'movie')).toBeGreaterThan(timeFit(60, 120, 'movie'));
    expect(timeFit(null, 120, 'movie')).toBe(0.5);
    expect(timeFit(45, 'binge', 'tv')).toBe(1);
    expect(timeFit(100, 'binge', 'movie')).toBeLessThan(0.5);
  });

  it('discounts ratings with few votes', () => {
    expect(qualityScore(8, 5000)).toBeGreaterThan(qualityScore(8, 3));
  });

  it('adds a bonus on top of the weighted score', () => {
    const snap = { tmdbId: 5, type: 'movie' as const, title: 'T', genreIds: [53], originalLanguage: 'ta', runtime: 110, voteAverage: 7, voteCount: 500, year: 2020 };
    const base = totalScore({ snap, profile, want: 'thrill', minutes: 120, surprise: false });
    expect(totalScore({ snap, profile, want: 'thrill', minutes: 120, surprise: false, bonus: 0.1 })).toBeCloseTo(base + 0.1);
  });

  it('defaults the time from the clock', () => {
    expect(defaultMinutes(new Date('2026-10-03T20:00:00'))).toBe(180); // Saturday evening
    expect(defaultMinutes(new Date('2026-10-06T20:30:00'))).toBe(120); // Tuesday evening
    expect(defaultMinutes(new Date('2026-10-06T23:30:00'))).toBe(60);
  });
});
