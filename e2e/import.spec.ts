import { expect, test } from '@playwright/test';
import { mockApis, seedOnboarded } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

const SAMPLE = `# Watchlist
- Madras Nights (2003) · movie
- Starfall · movie
- Some Unknown Film zzz (2011) · movie

## 🌧️ Rainy day comfort
- Tea Estate (2019) · movie · rating: love
- Anything · imdb: tt0000105`;

test('custom titles, Markdown import and export', async ({ page }, info) => {
  const p = info.project.name;
  const errors: string[] = [];
  const tmdbUrls: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => r.url().includes('api.themoviedb.org') && tmdbUrls.push(r.url()));
  await mockApis(page);
  await seedOnboarded(page);

  // Search finds nothing → add your own title.
  await page.goto('/#/search?q=Our%20wedding%20zzz');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Add your own title' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add your own title' });
  await expect(dialog.getByLabel(/Title \(in English\)/)).toHaveValue('Our wedding zzz');
  await dialog.getByLabel(/Title \(in English\)/).fill('Our Wedding Video');
  await dialog.getByLabel('Original title').fill('எங்கள் திருமணம்');
  await dialog.getByLabel('Year').fill('2018');
  await dialog.getByRole('checkbox', { name: 'Family' }).click();
  await dialog.getByLabel('Description').fill('Shot on VHS in Madurai.\nThe whole family is in it.');
  await dialog.getByLabel('Director').fill('Appa');
  await dialog.getByLabel('Cast').fill('Amma, Paati, Me');
  await dialog.getByLabel('Link for more information').fill('javascript:alert(1)');
  await expect(dialog.getByText(/Use a web link starting with http/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add title' })).toBeDisabled();
  await dialog.getByLabel('Link for more information').fill('https://example.com/wedding');
  await dialog.getByRole('combobox', { name: 'Add to' }).click();
  await page.getByRole('option', { name: 'Watched' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.screenshot({ path: shot('30-custom-dialog', p), fullPage: true });
  await dialog.getByRole('button', { name: 'Add title' }).click();

  await expect(page).toHaveURL(/#\/title\/movie\/-\d+$/);
  await expect(page.getByRole('heading', { name: 'Our Wedding Video' })).toBeVisible();
  await expect(page.getByText('எங்கள் திருமணம்').first()).toBeVisible();
  await expect(page.getByText('Added by you · not in TMDB')).toBeVisible();
  await expect(page.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', 'https://example.com/wedding');
  await expect(page.getByRole('button', { name: 'Watched' })).toHaveClass(/MuiButton-contained/);
  await page.getByRole('button', { name: 'Liked it' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Year').fill('2019');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/^2019 · Movie/)).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: shot('31-custom-title', p), fullPage: true });

  // Import: paste → match → review (pick another candidate, add one as my own) → import.
  await page.goto('/#/import');
  await expect(page.getByRole('heading', { name: 'Import a list' })).toBeVisible();
  await expect(page.getByText('Coming from another app?')).toBeVisible();
  await page.screenshot({ path: shot('32-import', p), fullPage: true });
  await page.getByLabel('Paste your list').fill(SAMPLE);
  await expect(page.getByText('Found 5 titles for 2 lists.')).toBeVisible();
  await page.getByRole('button', { name: 'Find matches' }).click();
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible({ timeout: 30_000 });

  const starfall = page.locator('[data-row="3"]');
  await expect(starfall.getByText('Good match')).toBeVisible();
  await starfall.getByRole('combobox').click();
  await page.getByRole('option', { name: /^Starfall 12 \(2002\)/ }).click();
  await expect(starfall.getByText('Your pick')).toBeVisible();
  const unknown = page.locator('[data-row="4"]');
  await expect(unknown.getByText('Not found')).toBeVisible();
  await unknown.getByRole('button', { name: 'Add as my own title' }).click();
  await expect(unknown.getByText('Your own title')).toBeVisible();
  await expect(page.locator('[data-row="8"]').getByText('Exact match')).toBeVisible();
  await page.screenshot({ path: shot('33-import-review', p), fullPage: true });
  await page.getByRole('button', { name: 'Import 5 titles' }).click();
  await expect(page.getByText(/Imported 5 titles: 4 from TMDB, 1 of your own\./)).toBeVisible();
  await expect(page.getByText(/New list: 🌧️ Rainy day comfort/)).toBeVisible();
  await page.screenshot({ path: shot('34-import-done', p), fullPage: true });

  // Library shows it all; custom titles get a placeholder poster with a "Custom" chip.
  await page.getByRole('link', { name: 'Open your library' }).click();
  await page.getByRole('tab', { name: 'Watchlist' }).click();
  for (const t of ['Madras Nights', 'Starfall 12', 'Some Unknown Film zzz']) await expect(page.getByText(t, { exact: true }).last()).toBeVisible();
  await page.getByRole('tab', { name: 'Watched' }).click();
  await expect(page.getByText('Our Wedding Video', { exact: true }).first()).toBeVisible();
  // Tea Estate came in as ❤️, which also means watched.
  await expect(page.getByText(/^Tea Estate/).first()).toBeVisible();
  await expect(page.getByText('Custom', { exact: true })).toBeVisible();
  await page.screenshot({ path: shot('35-library-custom', p), fullPage: true });
  await page.getByRole('tab', { name: 'My lists' }).click();
  await expect(page.getByText('Rainy day comfort')).toBeVisible();
  await expect(page.getByText('2 titles')).toBeVisible();

  // Export all as Markdown (desktop browsers download; phones use the share sheet).
  // Keep each downloaded Blob so the test can read the file in the page (no Node file APIs needed).
  await page.evaluate(() => {
    const w = window as unknown as { __blobs: Blob[] };
    const original = URL.createObjectURL.bind(URL);
    w.__blobs = [];
    URL.createObjectURL = (b: Blob | MediaSource) => (b instanceof Blob && w.__blobs.push(b), original(b));
  });
  await page.getByRole('button', { name: 'Export all' }).click();
  const mdItem = page.getByRole('menuitem', { name: /Download as Markdown/ });
  if (await mdItem.isVisible()) {
    const [download] = await Promise.all([page.waitForEvent('download'), mdItem.click()]);
    expect(download.suggestedFilename()).toBe('MovieMango-all-lists.md');
    const md = await page.evaluate(() => (window as unknown as { __blobs: Blob[] }).__blobs.at(-1)!.text());
    expect(md).toContain('not endorsed or certified by TMDB');
    expect(md).toContain('# Watchlist\n- ');
    expect(md).toContain('- Madras Nights (2003) · movie · tmdb: 103');
    expect(md).toContain('- Our Wedding Video (2019) · movie · rating: like · custom · original: எங்கள் திருமணம் · genres: Family · director: Appa · cast: Amma, Paati, Me · url: https://example.com/wedding\n  > Shot on VHS in Madurai.');
    expect(md).toContain('# 🌧️ Rainy day comfort');
  } else {
    await expect(page.getByRole('menuitem', { name: /Share as Markdown/ })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  expect(tmdbUrls.length).toBeGreaterThan(0);
  expect(tmdbUrls.filter((u) => /\/(movie|tv)\/-\d/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
});
