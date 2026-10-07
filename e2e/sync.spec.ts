import { expect, test } from '@playwright/test';
import { mockApis, mockGoogle, seedOnboarded } from './fixtures';

test('Drive sync: one upload per 2-minute batch, sent right away when leaving', async ({ page }) => {
  await page.clock.install();
  await mockApis(page);
  const drive = await mockGoogle(page);
  await seedOnboarded(page, { driveConnected: true, driveEmail: 'tester@example.com' });

  // No token in this tab yet: reconnecting does the first sync, which creates the file.
  await page.getByRole('button', { name: 'Reconnect Drive' }).click();
  await expect.poll(() => drive.uploads).toBe(1);

  // Several changes within the window go up together, once.
  await page.evaluate(() => (location.hash = '#/title/movie/103'));
  await page.getByRole('button', { name: 'Watchlist' }).click();
  await page.getByRole('button', { name: 'Liked it' }).click();
  await page.getByRole('button', { name: 'Loved it' }).click();
  await page.clock.fastForward('01:00');
  expect(drive.uploads).toBe(1);
  await page.clock.fastForward('01:05');
  await expect.poll(() => drive.uploads).toBe(2);
  // The Drive file hadn't changed since our own upload, so it wasn't downloaded again.
  expect(drive.downloads).toBe(0);
  expect((drive.file as { items: { rating?: string }[] }).items.filter((i) => i.rating === 'love')).toHaveLength(1);

  // A change, then the tab is hidden: it's sent without waiting for the window.
  await page.getByRole('button', { name: 'Not for me', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => drive.uploads).toBe(3);
  expect((drive.file as { items: { rating?: string }[] }).items.filter((i) => i.rating === 'dislike')).toHaveLength(1);
});
