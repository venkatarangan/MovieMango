import { expect, test } from '@playwright/test';
import { mockApis, mockGoogle, seedOnboarded } from './fixtures';

const seeded = { driveConnected: true, driveEmail: 'tester@example.com', driveAutoReconnect: false };
const KEY = 'mm.driveToken';

/** Tabs of one browser share localStorage, so one Google sign-in serves them all (until it expires). */
test('a second tab in the same browser is connected without pressing Reconnect', async ({ page, context }) => {
  await mockApis(page);
  const drive = await mockGoogle(context);
  await seedOnboarded(page, seeded);
  await page.getByRole('button', { name: 'Reconnect Drive' }).click();
  await expect.poll(() => drive.uploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
  const signIns = () => page.evaluate(() => (window as unknown as { __gisPrompts: string[] }).__gisPrompts.length);

  // A new tab (like opening a link in a new tab) starts connected: no chip, nothing asked of Google.
  const tab2 = await context.newPage();
  await mockApis(tab2);
  await tab2.goto('/#/about');
  await expect(tab2.getByText(/This product uses the TMDB API/)).toBeVisible();
  await expect(tab2.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
  expect(await tab2.evaluate(() => (window as unknown as { __gisPrompts: string[] }).__gisPrompts)).toEqual([]);
  expect(await signIns()).toBe(1);
  expect(JSON.parse((await tab2.evaluate((k) => localStorage.getItem(k), KEY))!).token).toBe('test-token');
});

test('a tab waiting at Reconnect Drive becomes connected when another tab signs in; disconnecting clears the other', async ({ page, context }) => {
  await mockApis(page);
  const drive = await mockGoogle(context);
  await seedOnboarded(page, seeded);
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toBeVisible();

  const tab2 = await context.newPage();
  await mockApis(tab2);
  await tab2.goto('/#/about');
  await expect(tab2.getByRole('button', { name: 'Reconnect Drive' })).toBeVisible();

  await page.getByRole('button', { name: 'Reconnect Drive' }).click();
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
  // The other tab heard about it and is connected too, without anyone pressing its chip.
  await expect(tab2.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
  // Batched: the Drive file was created once, and the second tab's catch-up is at most one more sync (no new upload, nothing changed).
  await expect.poll(() => drive.uploads).toBe(1);
  await page.waitForTimeout(2500);
  expect(drive.uploads).toBe(1);

  // Disconnect in tab 2 (Settings): tab 1 drops the token and its Drive cloud.
  await tab2.goto('/#/settings');
  await tab2.getByRole('button', { name: 'Disconnect' }).click();
  await expect(tab2.getByRole('button', { name: 'Sign in with Google' }).first()).toBeVisible();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: 'Sign in with Google' }).first()).toBeVisible();
});

test('an expired token in storage shows the Reconnect chip (quiet renewal off)', async ({ page, context }) => {
  await mockApis(page);
  await mockGoogle(context);
  await seedOnboarded(page, seeded);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ token: 'old', expiresAt: Date.now() - 1000 })), KEY);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toBeVisible();
});

test('an old tab-only (sessionStorage) token from an earlier version still counts', async ({ page, context }) => {
  await mockApis(page);
  const drive = await mockGoogle(context);
  await seedOnboarded(page, seeded);
  await page.evaluate((k) => sessionStorage.setItem(k, JSON.stringify({ token: 'old-session', expiresAt: Date.now() + 1_800_000 })), KEY);
  await page.reload();
  await expect.poll(() => drive.uploads).toBe(1);
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);
});
