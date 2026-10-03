import { expect, test, type Page } from '@playwright/test';
import { mockApis } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

/**
 * Skips onboarding by writing settings straight into IndexedDB, then reloads so the app reads them.
 * Done from About (no setup needed), so the Welcome page can't save its own settings over ours.
 */
async function onboard(page: Page) {
  await page.goto('/#/about');
  await expect(page.getByText(/This product uses the TMDB API/)).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('moviemango');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'settings', value: { onboarded: true, tmdbToken: 'eyJ' + 'a'.repeat(80), aiEngine: 'basic' } });
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test('tracks TV episodes across seasons', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await onboard(page);
  const p = info.project.name;

  await page.goto('/#/title/tv/205');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
  const progress = page.getByTestId('episode-progress');
  await expect(progress).toHaveText('0 of 10 episodes');
  await expect(page.getByText('Specials')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark S1 E1 as watched' }).click();
  await expect(progress).toHaveText('1 of 10 episodes · Next: S1 E2 “The Long Way Home”');

  await page.getByRole('button', { name: /Season 1/ }).click();
  // Controlled by IndexedDB, so the tick lands a moment after the click.
  await page.getByRole('checkbox', { name: 'S1 E2 The Long Way Home' }).click();
  await expect(page.getByRole('checkbox', { name: 'S1 E2 The Long Way Home' })).toBeChecked();
  await expect(progress).toHaveText(/^2 of 10 episodes · Next: S1 E3/);
  await expect(page.getByRole('button', { name: /Season 1/ })).toContainText('2/6');

  await page.getByRole('button', { name: /Season 2/ }).click();
  await expect(page.getByRole('checkbox', { name: 'S2 E5 Night Shift' })).toBeDisabled();
  await expect(page.getByText('Airs 12 Oct 2030')).toBeVisible();
  await page.getByRole('button', { name: 'Watched up to S2 E3' }).click();
  await expect(progress).toHaveText('9 of 10 episodes · Next: S2 E4 “Second Chances”');
  await expect(page.getByRole('button', { name: /Season 2/ })).toContainText('3/4');
  await page.screenshot({ path: shot('20-episodes', p), fullPage: true });

  await page.getByRole('button', { name: 'Mark next as watched' }).click();
  await expect(progress).toHaveText('10 of 10 episodes');
  await expect(page.getByText(/You’re all caught up. Next episode airs 12 Oct 2030/)).toBeVisible();
  // Still airing, so it isn't offered as finished; lists are untouched.
  await expect(page.getByRole('button', { name: 'Mark the show as watched' })).toHaveCount(0);

  // Progress survives a reload.
  await page.reload();
  await expect(progress).toHaveText('10 of 10 episodes');

  // Home shows the show under Continue watching.
  await page.goto('/#/');
  const row = page.locator('section', { has: page.getByRole('heading', { name: 'Continue watching' }) });
  await expect(row.getByText('All caught up')).toBeVisible();
  expect(errors).toEqual([]);
});

test('offers to mark an ended show as watched once every episode is seen', async ({ page }, info) => {
  await mockApis(page);
  await onboard(page);
  await page.goto('/#/title/tv/204');
  await page.reload();
  const progress = page.getByTestId('episode-progress');
  await expect(progress).toHaveText('0 of 12 episodes');
  for (const s of [1, 2]) {
    await page.getByRole('button', { name: new RegExp(`Season ${s}`) }).click();
    await page.getByRole('button', { name: 'Mark season watched' }).click();
  }
  await expect(progress).toHaveText('12 of 12 episodes');
  await expect(page.getByText('You’ve seen every episode.')).toBeVisible();
  await page.waitForTimeout(500); // let the progress bar finish filling
  await page.screenshot({ path: shot('21-episodes-done', info.project.name), fullPage: true });
  await page.getByRole('button', { name: 'Mark the show as watched' }).click();
  await expect(page.getByText('Finished. Nice one!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark season unwatched' })).toBeVisible();
});
