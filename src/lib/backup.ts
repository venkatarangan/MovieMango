import { db } from '../db';
import { DEFAULT_SETTINGS, getSettings, saveSettings, SECRET_SETTINGS, type Settings } from '../db/settings';
import type { CustomList, UserItem } from './types';

export interface Backup {
  app: 'MovieMango';
  version: 1;
  exportedAt: string;
  items: UserItem[];
  lists: CustomList[];
  settings: Partial<Settings>;
}

/** Everything the user created, minus API keys (a backup file may be shared or stored elsewhere). */
export async function createBackup(): Promise<Backup> {
  const settings: Partial<Settings> = { ...(await getSettings()) };
  for (const k of SECRET_SETTINGS) delete settings[k];
  return { app: 'MovieMango', version: 1, exportedAt: new Date().toISOString(), items: await db.items.toArray(), lists: await db.lists.toArray(), settings };
}

/** Newest-wins merge per record, so restoring an older backup never overwrites newer changes. */
export function mergeRecords<T extends { updatedAt: number }>(local: T[], incoming: T[], key: (t: T) => string): T[] {
  const out = new Map(local.map((r) => [key(r), r]));
  for (const r of incoming) {
    const mine = out.get(key(r));
    if (!mine || r.updatedAt > mine.updatedAt) out.set(key(r), r);
  }
  return [...out.values()];
}

export async function restoreBackup(raw: unknown): Promise<{ items: number; lists: number }> {
  const b = raw as Backup;
  if (!b || b.app !== 'MovieMango' || !Array.isArray(b.items) || !Array.isArray(b.lists)) throw new Error('This file is not a MovieMango backup.');
  await db.transaction('rw', db.items, db.lists, async () => {
    await db.items.bulkPut(mergeRecords(await db.items.toArray(), b.items, (i) => i.key));
    await db.lists.bulkPut(mergeRecords(await db.lists.toArray(), b.lists, (l) => l.id));
  });
  const keep = Object.fromEntries(Object.entries(b.settings ?? {}).filter(([k]) => k in DEFAULT_SETTINGS && !SECRET_SETTINGS.includes(k as keyof Settings)));
  await saveSettings(keep);
  return { items: b.items.length, lists: b.lists.length };
}
