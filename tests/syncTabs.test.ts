import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drive = vi.hoisted(() => ({
  uploadJson: vi.fn(async () => ({ id: 'f1', modifiedTime: 't1' })),
  downloadJson: vi.fn(async () => null),
  findSyncFile: vi.fn(async () => null),
  getFileMeta: vi.fn(async () => null),
}));
vi.mock('../src/sync/drive', () => ({
  ...drive,
  DriveError: class extends Error {
    status = 0;
  },
}));

const KEY = 'mm.driveToken';
const live = (mins = 30) => ({ token: 'tok', expiresAt: Date.now() + mins * 60_000 });
const storageEvent = () => window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));

/** A fresh copy of the sync module, a clean database, and a fake Google that records the prompts it is given. */
async function boot(settings: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client');
  const prompts: string[] = [];
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: (r: object) => void }) => ({
          requestAccessToken: (o?: { prompt?: string }) => {
            prompts.push(o?.prompt ?? '');
            setTimeout(() => cfg.callback({ access_token: 'fresh', expires_in: 3600 }), 0);
          },
        }),
        hasGrantedAllScopes: () => true,
        revoke: () => {},
      },
    },
  };
  const { db } = await import('../src/db');
  await db.delete();
  await db.open();
  const { saveSettings, resetSettingsCache } = await import('../src/db/settings');
  resetSettingsCache();
  await saveSettings({ onboarded: true, driveConnected: true, driveEmail: 'a@b.c', ...settings }, { fromSync: true });
  const sync = await import('../src/sync/sync');
  const { renderHook } = await import('@testing-library/react');
  const view = renderHook(() => sync.useSyncState());
  return { sync, prompts, saveSettings, status: () => view.result.current.status };
}

describe('Drive sign-in shared between browser tabs', () => {
  // Each test boots its own copy of the module; drop the old copies' listeners so they don't answer later events.
  const added: [string, EventListener][] = [];
  beforeEach(() => {
    const add = window.addEventListener.bind(window) as (t: string, l: EventListener, o?: unknown) => void;
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, l: EventListener, o?: unknown) => (added.push([type, l]), add(type, l, o))) as typeof window.addEventListener);
    localStorage.clear();
    sessionStorage.clear();
    Object.values(drive).forEach((f) => f.mockClear());
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    added.splice(0).forEach(([type, l]) => window.removeEventListener(type, l));
    vi.unstubAllEnvs();
  });

  it('a new tab finds the token another tab saved: connected, one sync, no Reconnect', async () => {
    localStorage.setItem(KEY, JSON.stringify(live()));
    const { sync, status, prompts } = await boot();
    await sync.startSync();
    await vi.waitFor(() => expect(drive.uploadJson).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(prompts).toEqual([]);
  });

  it('an expired token leaves the Reconnect chip state (quiet renewal off)', async () => {
    localStorage.setItem(KEY, JSON.stringify(live(0.5)));
    const { sync, status } = await boot({ driveAutoReconnect: false });
    await sync.startSync();
    expect(status()).toBe('needs-auth');
    expect(drive.uploadJson).not.toHaveBeenCalled();
  });

  it('a tab waiting at needs-auth is connected when another tab signs in, with one sync', async () => {
    const { sync, status, prompts } = await boot({ driveAutoReconnect: false });
    await sync.startSync();
    expect(status()).toBe('needs-auth');
    localStorage.setItem(KEY, JSON.stringify(live()));
    storageEvent();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    await vi.waitFor(() => expect(drive.uploadJson).toHaveBeenCalledTimes(1));
    // A repeated event (the same token again) causes no second sync.
    storageEvent();
    await new Promise((r) => setTimeout(r, 50));
    expect(drive.uploadJson).toHaveBeenCalledTimes(1);
    expect(prompts).toEqual([]);
  });

  it('with auto-sync off, the other tab becomes connected but does not sync by itself', async () => {
    const { sync, status } = await boot({ driveAutoReconnect: false, driveAutoSync: false });
    await sync.startSync();
    localStorage.setItem(KEY, JSON.stringify(live()));
    storageEvent();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    await new Promise((r) => setTimeout(r, 50));
    expect(drive.uploadJson).not.toHaveBeenCalled();
  });

  it('disconnecting in one tab turns the other tab off', async () => {
    localStorage.setItem(KEY, JSON.stringify(live()));
    const { sync, status, saveSettings } = await boot();
    await sync.startSync();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    // What the disconnecting tab does: settings first, then the token goes.
    await saveSettings({ driveConnected: false, driveEmail: '' }, { fromSync: true });
    localStorage.removeItem(KEY);
    storageEvent();
    await vi.waitFor(() => expect(status()).toBe('off'));
  });

  it('a token cleared while Drive stays connected (expired elsewhere) asks this tab to reconnect', async () => {
    localStorage.setItem(KEY, JSON.stringify(live()));
    const { sync, status } = await boot({ driveAutoReconnect: false });
    await sync.startSync();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    localStorage.removeItem(KEY);
    storageEvent();
    await vi.waitFor(() => expect(status()).toBe('needs-auth'));
  });

  it('quiet renewal runs in a normal browser tab (not only the installed app)', async () => {
    const { sync, status, prompts } = await boot();
    await sync.startSync();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(prompts).toEqual(['none']);
    expect(drive.uploadJson).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(KEY)!).token).toBe('fresh');
  });

  it('quiet renewal stays off when the setting is off, when Drive was never connected, or another tab just tried', async () => {
    let t = await boot({ driveAutoReconnect: false });
    await t.sync.startSync();
    expect(await t.sync.silentReconnect()).toBe(false);
    expect(t.prompts).toEqual([]);

    t = await boot({ driveConnected: false });
    await t.sync.startSync();
    expect(await t.sync.silentReconnect()).toBe(false);
    expect(t.prompts).toEqual([]);

    localStorage.setItem('mm.driveSilentAt', String(Date.now()));
    t = await boot();
    await t.sync.startSync();
    await vi.waitFor(() => expect(t.status()).toBe('needs-auth'));
    expect(t.prompts).toEqual([]);
  });
});
