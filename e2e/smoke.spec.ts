import { expect, test } from '@playwright/test';
import { mockApis } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test('onboarding, Tonight picks, title page, library and settings', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  const p = info.project.name;

  await page.goto('/');
  await expect(page).toHaveURL(/#\/welcome/);
  await expect(page.getByRole('heading', { name: /Ripe picks for your mood/ })).toBeVisible();
  await page.screenshot({ path: shot('01-welcome', p), fullPage: true });

  await page.getByRole('button', { name: /Get started/ }).click();
  await expect(page.getByText('Connect to TMDB')).toBeVisible();
  await page.getByLabel(/TMDB API Read Access Token/).fill('eyJ' + 'a'.repeat(80));
  await page.screenshot({ path: shot('02-tmdb', p), fullPage: true });
  await page.getByRole('button', { name: 'Verify & save' }).click();

  await expect(page.getByText('Where and what you watch')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Netflix' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: /Tamil/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: shot('03-you', p), fullPage: true });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText(/Tap 10 you love/)).toBeVisible();
  const tiles = page.locator('button[aria-pressed]');
  await expect(tiles.first()).toBeVisible();
  for (let i = 0; i < 10; i++) await tiles.nth(i).click();
  await expect(page.getByText('10/10')).toBeVisible();
  await page.screenshot({ path: shot('04-favourites', p) });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Meet your AI movie buff')).toBeVisible();
  await page.screenshot({ path: shot('05-ai', p), fullPage: true });
  await page.getByRole('button', { name: /Show me tonight/ }).click();

  await expect(page).toHaveURL(/#\/$/);
  // Headless Chromium has neither Gemini Nano nor WebGPU, and there's no key: the app offers Basic mode.
  await page.getByRole('button', { name: /Use Basic mode/ }).click();
  await page.getByRole('radio', { name: /Tired/ }).click();
  await expect(page.getByRole('radio', { name: /Comfort/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: shot('06-tonight', p), fullPage: true });
  await page.getByRole('button', { name: /Find my picks/ }).click();
  await expect(page.getByRole('heading', { name: 'Your picks' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Ranked without AI/)).toBeVisible();
  expect(await page.getByRole('button', { name: 'Not tonight' }).count()).toBeGreaterThan(0);
  await page.screenshot({ path: shot('07-picks', p), fullPage: true });

  await page.goto('/#/title/movie/103');
  await expect(page.getByRole('heading', { name: 'Madras Nights', exact: true })).toBeVisible();
  await expect(page.getByText('Where to watch in India')).toBeVisible();
  await expect(page.getByText(/Madras Nights \(2003\), a slow-burn treat/)).toBeVisible();
  await page.getByRole('button', { name: /^🥭 ?Ripe$/ }).click();
  await page.screenshot({ path: shot('08-title', p), fullPage: true });
  await page.getByRole('button', { name: 'Read full review' }).click();
  await expect(page.getByText('What works')).toBeVisible();
  await page.screenshot({ path: shot('09-review', p) });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.goto('/#/library');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await page.screenshot({ path: shot('10-library', p), fullPage: true });

  await page.goto('/#/reviews');
  await expect(page.getByText('Tea Estate (2019), pure comfort')).toBeVisible();
  await page.screenshot({ path: shot('11-reviews', p), fullPage: true });

  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.screenshot({ path: shot('12-settings', p), fullPage: true });

  await page.goto('/#/about');
  await expect(page.getByText(/This product uses the TMDB API but is not endorsed/)).toBeVisible();
  await expect(page.getByText(/JustWatch/).first()).toBeVisible();
  await page.screenshot({ path: shot('13-about', p), fullPage: true });

  expect(errors).toEqual([]);
});

test('dark mode renders welcome and about', async ({ page }, info) => {
  await mockApis(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/welcome');
  await expect(page.getByRole('heading', { name: /Ripe picks/ })).toBeVisible();
  await page.screenshot({ path: shot('14-dark-welcome', info.project.name) });
  await page.goto('/#/about');
  await expect(page.getByText(/This product uses the TMDB API/)).toBeVisible();
  await page.screenshot({ path: shot('15-dark-about', info.project.name), fullPage: true });
});
