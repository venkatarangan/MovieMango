import { expect, test } from '@playwright/test';
import { mockApis, seedOnboarded } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test('quick ＋ and 👎 on posters, genre and person pages, list tools', async ({ page }, info) => {
  const p = info.project.name;
  const desktop = p === 'desktop';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);

  // Home: the poster corner buttons save and hide titles, with Undo.
  await page.goto('/#/');
  const movies = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Movies for you' }) });
  await expect(movies.getByRole('button', { name: /^Add .* to a list$/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '🌏 World picks for you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^🗣️ This week: / })).toBeVisible();

  const add = movies.getByRole('button', { name: /^Add .* to a list$/ }).first();
  const saved = (await add.getAttribute('aria-label'))!.replace(/^Add (.*) to a list$/, '$1');
  await add.click();
  await page.getByRole('menuitem', { name: /^Watchlist/ }).click();
  await expect(page.getByText('Added to Watchlist')).toBeVisible();

  const notForMe = movies.getByRole('button', { name: /^Not for me: / });
  const undone = (await notForMe.nth(1).getAttribute('aria-label'))!.replace('Not for me: ', '');
  await notForMe.nth(1).click();
  await expect(page.getByText(/👎 Not for me/)).toBeVisible();
  await expect(movies.getByText(undone, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(movies.getByText(undone, { exact: true })).toBeVisible();
  const hidden = (await notForMe.nth(2).getAttribute('aria-label'))!.replace('Not for me: ', '');
  await notForMe.nth(2).click();
  await expect(movies.getByText(hidden, { exact: true })).toHaveCount(0);

  if (desktop) {
    // Mouse users get arrows on rows.
    await movies.getByRole('button', { name: 'Scroll right' }).click();
    await expect(movies.getByRole('button', { name: 'Scroll left' })).toBeVisible();
  }
  // Every page ends with a footer (on phones, a short one above the tab bar): Mangoidiots, local AI, version.
  await expect(page.getByRole('link', { name: 'Mangoidiots' })).toHaveAttribute('href', 'https://mangoidiots.com');
  await expect(page.getByText(/🧠 Local AI by default/)).toBeVisible();
  await expect(page.getByRole('link', { name: /^v\d+\.\d+\.\d+$/ })).toHaveAttribute('href', /CHANGELOG\.md$/);
  await page.screenshot({ path: shot('40-home-actions', p), fullPage: true });

  // Genre chip → the genre page, 100 at a time, with typed filters.
  await page.goto('/#/title/movie/103');
  await page.getByRole('link', { name: 'Action' }).click();
  await expect(page).toHaveURL(/#\/browse\/movie\?genre=28/);
  await expect(page.getByRole('heading', { name: 'Action films' })).toBeVisible();
  await expect(page.getByText('Newest first · 1–100 of 800')).toBeVisible();
  await page.getByRole('button', { name: 'Next 100' }).click();
  await expect(page.getByText('Newest first · 101–200 of 800')).toBeVisible();
  await page.getByRole('textbox', { name: /Filter by a word/ }).fill('heist 1990s');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Theme: heist / bank heist')).toBeVisible();
  await expect(page.getByText('Year: 1990s')).toBeVisible();
  await expect(page.getByText(/^Newest first · 1–100/)).toBeVisible();
  await expect(page.locator('[data-loading]')).toHaveCount(0);
  await page.screenshot({ path: shot('41-browse', p), fullPage: true });

  // Director and cast names → their film pages.
  await page.goto('/#/title/movie/103');
  await page.getByRole('link', { name: 'Vetrimaaran' }).click();
  await expect(page.getByRole('heading', { name: 'Vetrimaaran' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Directing (2)' })).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await page.getByRole('link', { name: /Nayanthara/ }).click();
  await expect(page.getByRole('heading', { name: 'Nayanthara' })).toBeVisible();
  // Talk shows and "Herself" appearances aren't acting credits.
  await expect(page.getByRole('tab', { name: 'Acting (4)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Directing (1)' })).toBeVisible();
  await page.screenshot({ path: shot('42-person', p), fullPage: true });

  // Library: saved and hidden titles, with sort and filters.
  await page.goto('/#/library');
  await expect(page.getByRole('tab', { name: 'Watchlist', selected: true })).toBeVisible();
  await expect(page.getByText(saved, { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Sort' }).click();
  await page.getByRole('option', { name: 'Title A–Z' }).click();
  await page.getByRole('tab', { name: /Not for me/ }).click();
  await expect(page.getByText(hidden, { exact: true })).toBeVisible();
  await expect(page.getByText(/never show up in your picks/)).toBeVisible();
  await page.screenshot({ path: shot('43-library-notforme', p), fullPage: true });
  // Tapping 👎 again brings it back.
  await page.getByRole('button', { name: `Undo not for me: ${hidden}` }).click();
  await expect(page.getByText(/Nothing in Not for me yet/)).toBeVisible();

  // Tonight can look beyond your languages.
  await page.goto('/#/tonight');
  await page.getByRole('button', { name: /More options/ }).click();
  await page.getByRole('radio', { name: 'Any language (subtitles OK)' }).click();
  await expect(page.getByRole('button', { name: /Fewer options.*Any language/ })).toBeVisible();

  expect(errors).toEqual([]);
});
