import { mergeRecords } from '../lib/backup';
import type { StreamingRow } from '../lib/streaming';
import { isSaved, type CustomList, type UserItem } from '../lib/types';
import { SYNCED_SETTINGS, type SyncedSettings } from '../db/settings';

export interface SyncPayload {
  app: 'MovieMango';
  version: 1;
  savedAt: number;
  items: UserItem[];
  lists: CustomList[];
  /** Where library titles stream (optional: older app versions don't send it). */
  streaming?: StreamingRow[];
  settings: Partial<SyncedSettings>;
  settingsUpdatedAt: number;
}

export function pickSynced(s: SyncedSettings): Partial<SyncedSettings> {
  return Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, s[k]])) as Partial<SyncedSettings>;
}

/**
 * Newest-wins per title and per list; for settings, the side changed most recently wins,
 * but an empty API key never overwrites a saved one (so a fresh device picks up your keys).
 */
export function mergePayloads(local: SyncPayload, remote: SyncPayload | null): SyncPayload {
  if (!remote) return local;
  const items = mergeRecords(local.items, remote.items ?? [], (i) => i.key);
  const localWins = local.settingsUpdatedAt >= remote.settingsUpdatedAt;
  const [winner, loser] = localWins ? [local.settings, remote.settings] : [remote.settings, local.settings];
  const settings: Partial<SyncedSettings> = { ...loser, ...winner };
  for (const k of ['tmdbToken', 'geminiKey'] as const) if (!settings[k] && loser[k]) settings[k] = loser[k];
  return {
    app: 'MovieMango',
    version: 1,
    savedAt: Date.now(),
    items,
    lists: mergeRecords(local.lists, remote.lists ?? [], (l) => l.id),
    streaming: libraryStreaming(mergeRecords(local.streaming ?? [], remote.streaming ?? [], (r) => r.key), items),
    settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
  };
}

/** Only titles still in the library keep their streaming info in Drive. */
export function libraryStreaming(rows: StreamingRow[], items: UserItem[]): StreamingRow[] {
  const saved = new Set(items.filter(isSaved).map((i) => i.key));
  return rows.filter((r) => saved.has(r.key));
}

/** Same content, ignoring when it was saved. */
export function sameContent(a: SyncPayload | null, b: SyncPayload) {
  if (!a) return false;
  const strip = (p: SyncPayload) => JSON.stringify({ ...p, savedAt: 0 });
  return strip(a) === strip(b);
}
