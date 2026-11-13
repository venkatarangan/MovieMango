import { expect, test, type Page } from '@playwright/test';
import { mockApis, seedOnboarded, title } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

/** Puts titles straight into the library (IndexedDB), then reloads. */
async function seedItems(page: Page, items: object[]) {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('moviemango');
        open.onsuccess = () => {
          const tx = open.result.transaction('items', 'readwrite');
          for (const r of rows) tx.objectStore('items').put(r);
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    items,
  );
  await page.reload();
}

const saved = (id: number, i: number) => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: title(id).title + (id > 900 ? ` ${id}` : ''), year: 2005, posterPath: `/poster${id}.jpg`, genreIds: [18], lists: ['watchlist'], addedAt: 1000 + i, updatedAt: 1000 + i });

/** Per-title "where does it stream" requests (not discover or catalogue calls). */
function countProviderCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/3\/(movie|tv)\/(\d+)\/watch\/providers/);
    if (m) calls.push(m[2]);
  });
  return calls;
}

test('Library: filter by streaming service, refresh saved info, logos on posters', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);
  // 102 Netflix · 103 Prime + JioHotstar · 105 Netflix + Prime · 901 nowhere · 902 ZEE5 · plus a custom title.
  await seedItems(page, [...[102, 103, 105, 901, 902].map(saved), { key: 'movie:-5', tmdbId: -5, type: 'movie', title: 'Sample Home Video', genreIds: [], lists: ['watchlist'], custom: {}, addedAt: 1, updatedAt: 1 }]);
  const calls = countProviderCalls(page);

  await page.goto('/#/library');
  await expect(page.getByText('Sample Home Video').first()).toBeVisible();
  const streaming = page.getByRole('combobox', { name: 'Streaming' });
  await streaming.click();
  // Opening the menu checks every title once; counts fill in.
  await expect(page.getByRole('option', { name: 'On my services (3)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Netflix (2)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'ZEE5 (1)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Not streaming (1)' })).toBeVisible();
  await page.screenshot({ path: shot('50-library-streaming-menu', info.project.name) });
  await page.getByRole('option', { name: 'Netflix (2)' }).click();
  await expect(page.getByText('Showing 2 of 6')).toBeVisible();
  await expect(page.getByText('1 of your own titles isn’t included.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'On Netflix' })).toBeVisible(); // the removable chip
  await expect(page.getByTestId('streaming-badge')).toHaveCount(2);
  await page.screenshot({ path: shot('51-library-netflix', info.project.name), fullPage: true });
  expect(new Set(calls)).toEqual(new Set(['102', '103', '105', '901', '902']));
  expect(calls).toHaveLength(5); // once each, never the custom title

  await streaming.click();
  await page.getByRole('option', { name: 'Not streaming (1)' }).click();
  await expect(page.getByText('Showing 1 of 6')).toBeVisible();
  await expect(page.getByText(/Monsoon Diaries 901|901/).first()).toBeVisible();

  // The choice is remembered, and saved info means no new checks after a reload.
  await page.reload();
  await expect(page.getByText('Showing 1 of 6')).toBeVisible();
  expect(calls).toHaveLength(5);

  // ⟳ asks TMDB again, only for titles with saved info, and reports what changed.
  await page.route('https://api.themoviedb.org/3/movie/102/watch/providers**', (route) =>
    route.fulfill({ json: { id: 102, results: { IN: { flatrate: [{ provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg' }] } } } }),
  );
  await page.getByRole('button', { name: 'Check where these stream again' }).click();
  await expect(page.getByText('Updated. 1 title changed services.')).toBeVisible();
  expect(calls).toHaveLength(10);
  await streaming.click();
  await expect(page.getByRole('option', { name: 'Netflix (1)' })).toBeVisible();
  await page.getByRole('option', { name: 'Any' }).click();
  await expect(page.getByText(/Showing/)).toHaveCount(0);
  await page.screenshot({ path: shot('52-library-badges', info.project.name), fullPage: true });
  expect(errors).toEqual([]);
});

test('Your link and notes: saved from the title page, searchable in the Library', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);

  await page.goto('/#/title/movie/101');
  await page.getByRole('button', { name: 'Add your own link or notes' }).click();
  await page.getByLabel('My watch link').fill('javascript:alert(1)');
  await expect(page.getByText(/Use a web address/)).toBeVisible();
  await page.getByLabel('My watch link').fill('youtube.com/watch?v=abc');
  await page.getByLabel('My notes').click(); // leaving the link field saves it
  await expect(page.getByText('Added to your Watchlist so your link and notes are kept.')).toBeVisible();
  await page.getByLabel('My notes').fill('Amma recommended it. Watch the director’s cut.');
  await page.getByText('Your link and notes', { exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: /Your link/ });
  await expect(link).toHaveAttribute('href', 'https://youtube.com/watch?v=abc');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toContainText('youtube.com');
  await page.screenshot({ path: shot('53-title-notes', info.project.name), fullPage: true });

  // Notes survive a reload.
  await page.reload();
  await expect(page.getByLabel('My notes')).toHaveValue('Amma recommended it. Watch the director’s cut.');

  await page.goto('/#/library');
  await expect(page.getByTestId('notes-mark')).toHaveCount(1);
  await page.getByLabel('Find in this list').fill('amma');
  await expect(page.getByText('Showing 1 of 1')).toHaveCount(0); // the only title matches, so nothing is hidden
  await page.getByLabel('Find in this list').fill('nothing like this');
  await expect(page.getByText('Nothing matches. Try clearing a filter.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Browse: streaming dropdown filters at TMDB, and only posters you stop on are checked', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);
  const discover: string[] = [];
  page.on('request', (r) => r.url().includes('/discover/movie') && discover.push(r.url()));
  const calls = countProviderCalls(page);

  // One service (a shared link): every poster shows its logo, with no per-title checks.
  await page.goto('/#/browse/movie?on=netflix');
  await expect(page.getByText(/Newest first ·/)).toBeVisible();
  // Netflix's TMDB ids only (8 and 175, sorted): the filter runs at TMDB.
  await expect.poll(() => discover.some((u) => new URL(u).searchParams.get('with_watch_providers') === '175|8')).toBe(true);
  await expect(page.getByTestId('streaming-badge').first()).toBeVisible();
  const posters = await page.locator('a[href^="#/title/"]').count();
  await expect(page.getByTestId('streaming-badge')).toHaveCount(posters);
  await page.waitForTimeout(1500);
  expect(calls).toHaveLength(0);
  await page.screenshot({ path: shot('54-browse-netflix', info.project.name) });

  // Any service: posters on screen are checked after a moment; the rest of the 100 aren't.
  const streaming = page.getByRole('combobox', { name: 'Streaming' });
  await streaming.click();
  await page.getByRole('option', { name: 'Any' }).click();
  await expect(page).not.toHaveURL(/on=/);
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(calls.length).toBeLessThan(40);
  expect(new Set(calls).size).toBe(calls.length); // never twice
  await expect(page.getByTestId('streaming-badge').first()).toBeVisible();
  await page.screenshot({ path: shot('55-browse-any', info.project.name) });

  // The dropdown lists my services, then the others, and goes into the URL.
  await streaming.click();
  await expect(page.getByRole('option', { name: 'ZEE5' })).toBeVisible();
  await page.getByRole('option', { name: 'On my services' }).click();
  await expect(page).toHaveURL(/on=mine/);
  expect(errors).toEqual([]);
});
