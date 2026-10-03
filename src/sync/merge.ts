import { mergeRecords } from '../lib/backup';
import type { CustomList, UserItem } from '../lib/types';
import { SYNCED_SETTINGS, type SyncedSettings } from '../db/settings';

export interface SyncPayload {
  app: 'MovieMango';
  version: 1;
  savedAt: number;
  items: UserItem[];
  lists: CustomList[];
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
  const localWins = local.settingsUpdatedAt >= remote.settingsUpdatedAt;
  const [winner, loser] = localWins ? [local.settings, remote.settings] : [remote.settings, local.settings];
  const settings: Partial<SyncedSettings> = { ...loser, ...winner };
  for (const k of ['tmdbToken', 'geminiKey'] as const) if (!settings[k] && loser[k]) settings[k] = loser[k];
  return {
    app: 'MovieMango',
    version: 1,
    savedAt: Date.now(),
    items: mergeRecords(local.items, remote.items ?? [], (i) => i.key),
    lists: mergeRecords(local.lists, remote.lists ?? [], (l) => l.id),
    settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
  };
}

/** Same content, ignoring when it was saved. */
export function sameContent(a: SyncPayload | null, b: SyncPayload) {
  if (!a) return false;
  const strip = (p: SyncPayload) => JSON.stringify({ ...p, savedAt: 0 });
  return strip(a) === strip(b);
}
