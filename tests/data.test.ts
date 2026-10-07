import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { createList, deleteList, restoreItem, setRating, toggleList } from '../src/db/items';
import { mergeRecords } from '../src/lib/backup';
import { detectLocale } from '../src/lib/languages';
import { MAX_CUSTOM_LISTS } from '../src/lib/types';

const snap = { tmdbId: 42, type: 'movie' as const, title: 'Vikram', year: 2022, genreIds: [28] };

describe('lists', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.lists.clear();
  });

  it('moves a title from watchlist to watched', async () => {
    await toggleList(snap, 'watchlist', true);
    const item = await toggleList(snap, 'watched', true);
    expect(item.lists).toEqual(['watched']);
    expect(item.watchedAt).toBeTypeOf('number');
  });

  it('👍 and ❤️ mark as watched; 👎 only leaves the watchlist', async () => {
    await toggleList(snap, 'watchlist', true);
    const liked = await setRating(snap, 'like');
    expect(liked.lists).toEqual(['watched']);
    expect(liked.rating).toBe('like');
    const other = { ...snap, tmdbId: 43 };
    await toggleList(other, 'watchlist', true);
    const disliked = await setRating(other, 'dislike');
    expect(disliked.lists).toEqual([]);
    // Saving it for later again takes back the 👎.
    expect((await toggleList(other, 'watchlist', true)).rating).toBeUndefined();
  });

  it('restores the previous state for Undo', async () => {
    await toggleList(snap, 'watchlist', true);
    const prev = await db.items.get('movie:42');
    await setRating(snap, 'love');
    const back = await restoreItem(snap, prev);
    expect(back).toMatchObject({ lists: ['watchlist'], rating: undefined });
    const fresh = { ...snap, tmdbId: 44 };
    await setRating(fresh, 'dislike');
    expect(await restoreItem(fresh, undefined)).toMatchObject({ lists: [], rating: undefined });
  });

  it(`caps custom lists at ${MAX_CUSTOM_LISTS}, not counting deleted ones`, async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_CUSTOM_LISTS; i++) ids.push((await createList(`L${i}`)).id);
    await expect(createList('one too many')).rejects.toThrow(/up to 50/);
    await toggleList(snap, ids[0], true);
    await deleteList(ids[0]);
    expect((await db.items.get('movie:42'))!.lists).not.toContain(ids[0]);
    await expect(createList('fits again')).resolves.toBeTruthy();
  });
});

describe('backup merge', () => {
  it('keeps the newest version of each record', () => {
    const merged = mergeRecords([{ id: 'a', v: 1, updatedAt: 5 }, { id: 'b', v: 1, updatedAt: 5 }], [{ id: 'a', v: 2, updatedAt: 9 }, { id: 'b', v: 0, updatedAt: 1 }, { id: 'c', v: 3, updatedAt: 1 }], (r) => r.id);
    expect(merged.sort((x, y) => x.id.localeCompare(y.id)).map((r) => r.v)).toEqual([2, 1, 3]);
  });
});

describe('locale detection', () => {
  it('detects India from the time zone and adds browser languages', () => {
    expect(detectLocale('Asia/Kolkata', ['en-IN', 'ml-IN'])).toEqual({ region: 'IN', regionSupported: true, languages: ['en', 'ta', 'hi', 'ml'] });
  });
  it('flags unsupported regions', () => {
    expect(detectLocale('Europe/Paris', ['fr-FR']).regionSupported).toBe(false);
  });
});
