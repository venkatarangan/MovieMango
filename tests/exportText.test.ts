import { describe, expect, it } from 'vitest';
import { listToText, safeFilename, titleToText } from '../src/lib/exportText';
import { serviceByKey } from '../src/lib/providers';
import type { UserItem } from '../src/lib/types';

describe('text export', () => {
  it('formats a title with where-to-watch and credits', () => {
    const text = titleToText({
      snap: { tmdbId: 1, type: 'movie', title: 'Jailer', year: 2023, genreIds: [28], runtime: 168, originalLanguage: 'ta', voteAverage: 7.04 },
      overview: 'A retired jailer…',
      director: 'Nelson Dilipkumar',
      availability: [{ service: serviceByKey('netflix')!, access: 'subscription', providerName: 'Netflix', logoPath: '' }],
      myRating: 'like',
    });
    expect(text).toContain('🎬 Jailer (2023) · Movie · 2h 48m · Tamil');
    expect(text).toContain('TMDB 7.0/10 · My rating: 👍 Liked it');
    expect(text).toContain('Where to watch (India): Netflix (subscription)');
    expect(text).toContain('not endorsed or certified by TMDB');
    expect(text).toContain('JustWatch');
    expect(text).not.toMatch(/\n\n\n/);
  });

  it('formats a list', () => {
    const items = [{ key: 'tv:2', tmdbId: 2, type: 'tv', title: 'Panchayat', year: 2020, genreIds: [], lists: [], addedAt: 0, updatedAt: 0, originalLanguage: 'hi', rating: 'love' } as UserItem];
    const text = listToText('Comfort', items, new Date('2026-10-03'));
    expect(text).toContain('🥭 Comfort · 1 title · 3 Oct 2026');
    expect(text).toContain('1. Panchayat (2020) · Series · Hindi · ❤️ Loved it');
  });

  it('makes safe file names', () => {
    expect(safeFilename('Rainy day: comfort!')).toBe('MovieMango-Rainy-day-comfort.txt');
  });
});
