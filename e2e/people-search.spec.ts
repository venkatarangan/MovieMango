import { expect, test } from '@playwright/test';
import { mockApis, seedOnboarded } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test('Search finds actors and directors: a People row above the titles, opening the person page', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);

  await page.goto('/#/search?q=Meera');
  const people = page.getByRole('region', { name: 'People' });
  await expect(people).toBeVisible({ timeout: 30_000 });
  await expect(people.getByRole('link', { name: /Meera Rao, Director/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Films and shows' })).toBeVisible();
  // The best match is a person, so the row comes before the titles.
  const personY = (await people.boundingBox())!.y;
  const titleY = (await page.getByRole('heading', { name: 'Films and shows' }).boundingBox())!.y;
  expect(personY).toBeLessThan(titleY);
  await page.screenshot({ path: shot('50-search-people', info.project.name), fullPage: true });

  await people.getByRole('link', { name: /Meera Rao/ }).click();
  await expect(page).toHaveURL(/#\/person\/99/);

  // A query with no person matches shows no People row.
  await page.goto('/#/');
  await page.goto('/#/search?q=Starfall');
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Results for/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Home suggestions include people and open their page', async ({ page }) => {
  await mockApis(page);
  await seedOnboarded(page);
  await page.goto('/#/');
  await page.getByRole('combobox', { name: 'Search movies and TV shows' }).fill('Meera');
  await page.getByRole('option', { name: /Meera Rao/ }).click();
  await expect(page).toHaveURL(/#\/person\/99/);
});
