import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './index';

export type AiEngineChoice = 'auto' | 'nano' | 'qwen' | 'gemini' | 'basic';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  onboarded: boolean;
  region: string;
  languages: string[];
  services: string[];
  tmdbToken: string;
  aiEngine: AiEngineChoice;
  geminiKey: string;
  geminiModel: string;
  qwenModel: string;
  useNews: boolean;
  useMangoidiots: boolean;
  analytics: boolean;
  showAllRatings: boolean;
  portrait: string;
  theme: ThemeChoice;
  /** Google Drive sync: set once the user signs in. */
  driveConnected: boolean;
  driveEmail: string;
  lastSyncAt: number;
  /** When a synced setting last changed, for newest-wins merging across devices. */
  settingsUpdatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  region: 'IN',
  languages: ['en', 'ta', 'hi'],
  services: ['netflix', 'prime', 'jiohotstar'],
  tmdbToken: '',
  aiEngine: 'auto',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  qwenModel: 'Qwen3-1.7B-q4f16_1-MLC',
  useNews: false,
  useMangoidiots: true,
  analytics: true,
  showAllRatings: false,
  portrait: '',
  theme: 'system',
  driveConnected: false,
  driveEmail: '',
  lastSyncAt: 0,
  settingsUpdatedAt: 0,
};

/** Settings that follow the user across devices through Drive. The rest (AI engine, theme…) are per device. */
export const SYNCED_SETTINGS = ['languages', 'services', 'tmdbToken', 'geminiKey', 'geminiModel', 'useNews', 'useMangoidiots', 'showAllRatings', 'portrait'] as const;
export type SyncedSettings = Pick<Settings, (typeof SYNCED_SETTINGS)[number]>;

type Listener = (changedSynced: boolean) => void;
const listeners = new Set<Listener>();

/** Notified after every save; `changedSynced` is true when a cross-device setting changed. */
export function onSettingsSaved(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Keys that never leave the device in exports. */
export const SECRET_SETTINGS: (keyof Settings)[] = ['tmdbToken', 'geminiKey'];

let cached: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  const row = await db.kv.get('settings');
  cached = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  return cached;
}

export async function saveSettings(patch: Partial<Settings>, opts: { fromSync?: boolean } = {}): Promise<Settings> {
  const prev = await getSettings();
  const changedSynced = SYNCED_SETTINGS.some((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(prev[k]));
  const next = { ...prev, ...patch };
  if (changedSynced && !opts.fromSync) next.settingsUpdatedAt = Date.now();
  cached = next;
  await db.kv.put({ key: 'settings', value: next });
  if (!opts.fromSync) listeners.forEach((fn) => fn(changedSynced));
  return next;
}

/** Live settings for React; undefined while the first read is in flight. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const row = await db.kv.get('settings');
    const value = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
    cached = value;
    return value;
  });
}

/** Test hook: forget the in-memory copy. */
export function resetSettingsCache() {
  cached = null;
}
