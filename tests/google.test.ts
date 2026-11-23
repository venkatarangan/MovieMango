import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'mm.driveToken';
const live = (mins = 30) => ({ token: 'tok', expiresAt: Date.now() + mins * 60_000 });

async function load() {
  vi.resetModules();
  return import('../src/sync/google');
}

describe('shared Drive token', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('is saved in localStorage so every tab of the browser sees it', async () => {
    const g = await load();
    g.storeToken(live());
    expect(JSON.parse(localStorage.getItem(KEY)!).token).toBe('tok');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(g.storedToken()?.token).toBe('tok');
  });

  it('still reads a token an older version left in sessionStorage, and cleans it up on save', async () => {
    const g = await load();
    sessionStorage.setItem(KEY, JSON.stringify(live()));
    expect(g.storedToken()?.token).toBe('tok');
    g.storeToken({ ...live(), token: 'new' });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(g.storedToken()?.token).toBe('new');
  });

  it('ignores a token that has expired or is about to', async () => {
    const g = await load();
    localStorage.setItem(KEY, JSON.stringify(live(0.5)));
    expect(g.storedToken()).toBeNull();
    localStorage.setItem(KEY, 'not json');
    expect(g.storedToken()).toBeNull();
  });

  it('is cleared everywhere on sign-out', async () => {
    const g = await load();
    localStorage.setItem(KEY, JSON.stringify(live()));
    sessionStorage.setItem(KEY, JSON.stringify(live()));
    g.forgetToken();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(g.storedToken()).toBeNull();
  });

  it('falls back to this tab only when localStorage refuses the write', async () => {
    const g = await load();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    g.storeToken(live());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(g.storedToken()?.token).toBe('tok');
  });

  it('survives storage being unavailable', async () => {
    const g = await load();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(g.storedToken()).toBeNull();
    expect(() => g.storeToken(null)).not.toThrow();
  });

  it('tells the app when another tab saves or clears it', async () => {
    const g = await load();
    const seen: (string | null)[] = [];
    const off = g.onSharedTokenChange((t) => seen.push(t?.token ?? null));
    localStorage.setItem(KEY, JSON.stringify(live()));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    // Unrelated keys and session storage don't count.
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: sessionStorage }));
    expect(seen).toEqual(['tok', null]);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    expect(seen).toHaveLength(2);
  });
});
