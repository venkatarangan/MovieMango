import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { DEFAULT_SETTINGS, resetSettingsCache, saveSettings, type Settings } from '../src/db/settings';
import { planTonight } from '../src/reco/tonight';
import type { AiEngine } from '../src/ai/types';
import type { UserItem } from '../src/lib/types';

// A tiny fake TMDB: three thrillers (one too long, one not on Netflix) and one comedy.
const titles: Record<number, { title: string; genres: number[]; runtime: number; lang: string; providers: string[] }> = {
  101: { title: 'Fits Perfectly', genres: [53], runtime: 115, lang: 'ta', providers: ['Netflix'] },
  102: { title: 'Too Long', genres: [53], runtime: 200, lang: 'ta', providers: ['Netflix'] },
  103: { title: 'Elsewhere Only', genres: [53], runtime: 100, lang: 'ta', providers: ['Some Other'] },
  104: { title: 'A Comedy', genres: [35], runtime: 100, lang: 'hi', providers: ['Amazon Prime Video'] },
  105: { title: 'Already Watched', genres: [53], runtime: 100, lang: 'ta', providers: ['Netflix'] },
};

const listItem = (id: number) => ({ id, title: titles[id].title, genre_ids: titles[id].genres, original_language: titles[id].lang, release_date: '2020-01-01', vote_average: 7.5, vote_count: 900, poster_path: '/p.jpg', overview: 'o' });

function fakeFetch(url: string): Response {
  const u = new URL(url);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'public-api.wordpress.com') return json([]);
  if (u.pathname.includes('/watch/providers/')) return json({ results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '' }] });
  if (u.pathname.startsWith('/3/discover/movie')) return json({ page: 1, total_pages: 1, total_results: 5, results: [101, 102, 103, 104, 105].map(listItem) });
  if (u.pathname.startsWith('/3/discover/tv')) return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
  if (u.pathname.includes('/recommendations')) return json({ page: 1, total_pages: 1, total_results: 0, results: [] });
  const m = u.pathname.match(/\/3\/movie\/(\d+)$/);
  if (m) {
    const t = titles[Number(m[1])];
    return json({
      ...listItem(Number(m[1])),
      genres: t.genres.map((id) => ({ id, name: String(id) })),
      runtime: t.runtime,
      'watch/providers': { results: { IN: { link: 'https://jw', flatrate: t.providers.map((p, i) => ({ provider_id: 900 + i, provider_name: p, logo_path: '' })) } } },
      release_dates: { results: [{ iso_3166_1: 'IN', release_dates: [{ certification: 'UA' }] }] },
      credits: { cast: [], crew: [] },
      keywords: { keywords: [] },
    });
  }
  return new Response('not found', { status: 404 });
}

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true, tmdbToken: 'x'.repeat(32), services: ['netflix'], languages: ['ta', 'hi'], useMangoidiots: true };

describe('planTonight (mocked TMDB)', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fakeFetch(url)));
    await db.delete();
    await db.open();
    resetSettingsCache();
    await saveSettings(settings);
  });

  const watched: UserItem = { key: 'movie:105', tmdbId: 105, type: 'movie', title: 'Already Watched', genreIds: [53], lists: ['watched'], addedAt: 0, updatedAt: 0 };
  const input = { minutes: 120 as const, want: 'thrill' as const, discovery: 'new' as const, audience: 'solo' as const, type: 'movie' as const };

  it('without AI: keeps only titles that fit the time, are on my services and unwatched', async () => {
    const r = await planTonight(input, settings, [watched], null);
    expect(r.engineUsed).toBe('basic');
    expect(r.picks.map((p) => p.snap.title)).toEqual(['Fits Perfectly']);
    expect(r.picks[0].availability[0].service.key).toBe('netflix');
    expect(r.picks[0].why).toMatch(/fits your time/);
  });

  it('with AI: uses the model’s order and reasons, ignoring invented candidates', async () => {
    const both = { ...settings, services: ['netflix', 'prime'] };
    const engine: AiEngine = {
      id: 'gemini',
      label: 'fake',
      generateJson: vi.fn(async (_s: string, user: string) => {
        const lines = user.split('\n').filter((l) => /^\d+ \|/.test(l));
        const comedy = lines.find((l) => l.includes('A Comedy'))!.split(' |')[0];
        return JSON.stringify({ picks: [{ n: Number(comedy), why: 'A laugh tonight.' }, { n: 77, why: 'made up' }] });
      }),
    };
    const r = await planTonight({ ...input, want: undefined }, both, [watched], engine);
    expect(r.engineUsed).toBe('ai');
    expect(r.picks.map((p) => [p.snap.title, p.why])).toEqual([['A Comedy', 'A laugh tonight.']]);
  });

  it('falls back to Basic when the AI fails', async () => {
    const broken: AiEngine = { id: 'nano', label: 'broken', generateJson: async () => 'not json at all' };
    const r = await planTonight({ ...input, want: undefined }, { ...settings, services: ['netflix', 'prime'] }, [watched], broken);
    expect(r.engineUsed).toBe('basic');
    expect(r.aiError).toBeTruthy();
    expect(r.picks.length).toBe(2);
  });
});
