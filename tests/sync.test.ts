import { describe, expect, it } from 'vitest';
import { mergePayloads, sameContent, type SyncPayload } from '../src/sync/merge';
import type { UserItem } from '../src/lib/types';

const item = (key: string, updatedAt: number, lists: string[]): UserItem => ({ key, tmdbId: Number(key.split(':')[1]), type: 'movie', title: key, genreIds: [], lists, addedAt: 0, updatedAt });
const payload = (p: Partial<SyncPayload>): SyncPayload => ({ app: 'MovieMango', version: 1, savedAt: 0, items: [], lists: [], settings: {}, settingsUpdatedAt: 0, ...p });

describe('Drive sync merge', () => {
  it('merges titles newest-wins from both devices', () => {
    const local = payload({ items: [item('movie:1', 10, ['favourite']), item('movie:2', 5, ['watchlist'])] });
    const remote = payload({ items: [item('movie:1', 4, []), item('movie:2', 9, ['watched']), item('movie:3', 1, ['favourite'])] });
    const m = mergePayloads(local, remote);
    const byKey = Object.fromEntries(m.items.map((i) => [i.key, i.lists]));
    expect(byKey).toEqual({ 'movie:1': ['favourite'], 'movie:2': ['watched'], 'movie:3': ['favourite'] });
  });

  it('carries custom titles (negative ids) like any other title', () => {
    const custom: UserItem = { ...item('movie:-1700000000000001', 8, ['favourite']), title: 'Home Video', custom: { originalTitle: 'வீடு', url: 'https://example.com' } };
    const deleted: UserItem = { ...custom, lists: [], updatedAt: 9 };
    const m = mergePayloads(payload({ items: [custom] }), payload({ items: [item('movie:1', 1, ['watchlist'])] }));
    expect(m.items.find((i) => i.tmdbId < 0)).toEqual(custom);
    // A delete on another device (an emptied record) wins when it's newer.
    expect(mergePayloads(payload({ items: [custom] }), payload({ items: [deleted] })).items[0].lists).toEqual([]);
  });

  it('takes settings from the side changed last, but never loses a saved key', () => {
    const fresh = payload({ settings: { languages: ['en'], tmdbToken: '', portrait: '' }, settingsUpdatedAt: 50 });
    const drive = payload({ settings: { languages: ['ta', 'hi'], tmdbToken: 'tok', portrait: 'You love thrillers' }, settingsUpdatedAt: 20 });
    const m = mergePayloads(fresh, drive);
    expect(m.settings.languages).toEqual(['en']);
    expect(m.settings.tmdbToken).toBe('tok');
    expect(m.settingsUpdatedAt).toBe(50);
    expect(mergePayloads(payload({ settings: { languages: ['en'] }, settingsUpdatedAt: 0 }), drive).settings.languages).toEqual(['ta', 'hi']);
  });

  it('uses local data when Drive is empty, and ignores savedAt when comparing', () => {
    const local = payload({ items: [item('movie:1', 1, ['favourite'])] });
    expect(mergePayloads(local, null)).toBe(local);
    expect(sameContent({ ...local, savedAt: 1 }, { ...local, savedAt: 2 })).toBe(true);
    expect(sameContent(null, local)).toBe(false);
  });
});
