import { snapshotFromList, type TmdbListItem } from '../api/tmdb';
import { db } from '../db';
import { createList, importItem } from '../db/items';
import { customSnapshot } from './custom';
import { normTitle } from './importMatch';
import type { MdRow } from './markdown';
import { BUILTIN_LISTS, isCustom, itemKey, type MangoRating, type MediaType, type TitleSnapshot } from './types';

export interface ImportDecision {
  row: MdRow;
  pick: { item: TmdbListItem; type: MediaType } | 'custom' | 'skip';
}

export interface ImportSummary {
  titles: number;
  matched: number;
  custom: number;
  skipped: number;
  listsCreated: string[];
  /** Lists that couldn't be created (50-list cap); their titles went to the Watchlist. */
  listsFull: string[];
}

/** "🌧️ Rainy day" → { emoji: '🌧️', name: 'Rainy day' }. */
export function splitEmoji(heading: string): { emoji?: string; name: string } {
  const m = heading.trim().match(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*)\s*(.+)$/u);
  return m ? { emoji: m[1], name: m[2].trim() } : { name: heading.trim() };
}

const listName = (s: string) => normTitle(splitEmoji(s).name);

/** Custom titles match an existing one with the same type, title and year, so importing twice doesn't duplicate them. */
const customKey = (type: MediaType, title: string, year?: number) => `${type}|${normTitle(title)}|${year ?? ''}`;

/** Saves the chosen titles. Adds to lists and sets ratings; never removes anything. */
export async function applyImport(decisions: ImportDecision[]): Promise<ImportSummary> {
  const summary: ImportSummary = { titles: 0, matched: 0, custom: 0, skipped: 0, listsCreated: [], listsFull: [] };
  const todo = decisions.filter((d) => d.pick !== 'skip');
  summary.skipped = decisions.length - todo.length;

  // Lists: built-ins as they are; others matched by name (ignoring emoji and case) or created.
  const lists = await db.lists.filter((l) => !l.deleted).toArray();
  const byName = new Map(lists.map((l) => [listName(l.name), l.id]));
  const listId = new Map<string, string>();
  for (const heading of new Set(todo.map((d) => d.row.list))) {
    if ((BUILTIN_LISTS as readonly string[]).includes(heading)) listId.set(heading, heading);
    else if (byName.has(listName(heading))) listId.set(heading, byName.get(listName(heading))!);
    else {
      const { emoji, name } = splitEmoji(heading);
      try {
        const created = await createList(name.slice(0, 60), emoji);
        byName.set(listName(heading), created.id);
        listId.set(heading, created.id);
        summary.listsCreated.push(heading);
      } catch {
        listId.set(heading, 'watchlist');
        summary.listsFull.push(heading);
      }
    }
  }

  const customs = new Map(
    (await db.items.filter((i) => isCustom(i) && i.lists.length > 0).toArray()).map((i) => [customKey(i.type, i.title, i.year), i.tmdbId]),
  );
  const groups = new Map<string, { snap: TitleSnapshot; lists: Set<string>; rating?: MangoRating; custom: boolean }>();
  for (const { row, pick } of todo) {
    let snap: TitleSnapshot;
    if (pick === 'custom') {
      const type = row.type ?? 'movie';
      const ck = customKey(type, row.title, row.year);
      snap = customSnapshot({ ...row, type, tmdbId: customs.get(ck) });
      customs.set(ck, snap.tmdbId);
    } else if (pick !== 'skip') snap = snapshotFromList(pick.item, pick.type);
    else continue;
    const key = itemKey(snap.type, snap.tmdbId);
    const g = groups.get(key) ?? { snap, lists: new Set<string>(), custom: pick === 'custom' };
    g.lists.add(listId.get(row.list) ?? 'watchlist');
    g.rating = row.rating ?? g.rating;
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    await importItem(g.snap, [...g.lists], g.rating);
    summary.titles++;
    if (g.custom) summary.custom++;
    else summary.matched++;
  }
  return summary;
}
