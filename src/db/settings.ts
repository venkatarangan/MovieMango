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
};

/** Keys that never leave the device in exports. */
export const SECRET_SETTINGS: (keyof Settings)[] = ['tmdbToken', 'geminiKey'];

let cached: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cached) return cached;
  const row = await db.kv.get('settings');
  cached = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
  return cached;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  cached = next;
  await db.kv.put({ key: 'settings', value: next });
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
