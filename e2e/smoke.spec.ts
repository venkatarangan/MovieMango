import { expect, test } from '@playwright/test';
import { mockApis, mockGoogle, title } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test('onboarding, Tonight picks, title page, library and settings', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  const drive = await mockGoogle(page);
  const p = info.project.name;

  await page.goto('/');
  await expect(page).toHaveURL(/#\/welcome/);
  await expect(page.getByRole('heading', { name: /Ripe picks for your mood/ })).toBeVisible();
  // Even before setup: the small footer with the version.
  await expect(page.getByRole('link', { name: /^v\d+\.\d+\.\d+$/ })).toHaveAttribute('href', /CHANGELOG\.md$/);
  await expect(page.getByText('🧠 Local AI', { exact: true })).toBeVisible();
  await page.screenshot({ path: shot('01-welcome', p), fullPage: true });

  await page.getByRole('button', { name: /Get started/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep your picks safe' })).toBeVisible();
  await page.screenshot({ path: shot('01b-drive', p), fullPage: true });
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByText('tester@example.com')).toBeVisible();
  await expect(page.getByText(/first backup is saved/)).toBeVisible();
  await page.screenshot({ path: shot('01c-drive-connected', p), fullPage: true });
  await page.getByRole('button', { name: 'Continue' }).click();
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
  await page.screenshot({ path: shot('04-loved', p) });
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Meet your AI movie buff')).toBeVisible();
  await page.screenshot({ path: shot('05-ai', p), fullPage: true });
  await page.getByRole('button', { name: /Show me tonight/ }).click();

  await expect(page).toHaveURL(/#\/tonight$/);
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

  // Home: search first, then three lucky picks and the shelves.
  await page.goto('/#/');
  await expect(page.getByRole('combobox', { name: 'Search movies and TV shows' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Feeling lucky/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Movies for you' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Shows for you' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tonight' }).first()).toBeVisible();
  const lucky = page.locator('.MuiCard-root', { has: page.getByRole('heading', { name: /Feeling lucky/ }) });
  await expect(lucky.locator('a[href^="#/title/"]').first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: shot('06b-home', p), fullPage: true });
  await page.getByRole('combobox', { name: 'Search movies and TV shows' }).fill('Madras');
  await expect(page.getByRole('option', { name: /Madras Nights/ }).first()).toBeVisible();
  await page.screenshot({ path: shot('06c-home-search', p) });
  await page.keyboard.press('Escape');

  // A plain ?q= link opens Search.
  await page.goto('/?q=Madras');
  await expect(page).toHaveURL(/#\/search\?q=Madras/);
  await expect(page.getByText(/Results for “Madras”/)).toBeVisible();

  await page.goto('/#/title/movie/103');
  await expect(page.getByRole('heading', { name: 'Madras Nights', exact: true })).toBeVisible();
  await expect(page.getByText('Where to watch in India')).toBeVisible();
  await expect(page.getByText(/Madras Nights \(2003\), a slow-burn treat/)).toBeVisible();
  await page.getByRole('button', { name: 'Liked it' }).click();
  await expect(page.getByText(/👍 Liked, and marked as watched/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Watched' })).toHaveClass(/MuiButton-contained/);
  await page.screenshot({ path: shot('08-title', p), fullPage: true });
  await page.getByRole('button', { name: 'Read full review' }).click();
  await expect(page.getByText('What works')).toBeVisible();
  await page.screenshot({ path: shot('09-review', p) });
  await page.getByRole('button', { name: 'Close' }).click();

  // Changes reach Drive: a debounced sync, or immediately via the header's sync button.
  await page.getByRole('button', { name: /sync/i }).first().click();
  // The 10 onboarding picks are ❤️ (one may now be 👍 from the title page above).
  await expect.poll(() => (drive.file as { items?: { rating?: string }[] } | null)?.items?.filter((i) => i.rating === 'love' || i.rating === 'like').length ?? 0).toBeGreaterThanOrEqual(10);

  await page.goto('/#/library');
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await page.screenshot({ path: shot('10-library', p), fullPage: true });

  await page.goto('/#/reviews');
  await expect(page.getByText('Tea Estate (2019), pure comfort')).toBeVisible();
  await page.screenshot({ path: shot('11-reviews', p), fullPage: true });

  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/^MovieMango v\d+\.\d+\.\d+/)).toBeVisible();
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

test('returning user restores everything from Google Drive on a new device', async ({ page }) => {
  await mockApis(page);
  const favs = [101, 102, 103, 104, 105, 106].map((id) => {
    const t = title(id);
    return { key: `movie:${id}`, tmdbId: id, type: 'movie', title: t.title, year: 2020, posterPath: t.poster_path, genreIds: t.genre_ids, originalLanguage: t.original_language, lists: id === 106 ? [] : ['watched'], rating: id === 106 ? 'dislike' : 'love', addedAt: 1, updatedAt: 1 };
  });
  await mockGoogle(page, {
    app: 'MovieMango',
    version: 1,
    savedAt: 1,
    items: favs,
    lists: [{ id: 'l_1', name: 'Rainy day', emoji: '🌧️', createdAt: 1, updatedAt: 1 }],
    settings: { tmdbToken: 'eyJ' + 'b'.repeat(80), languages: ['ta', 'ml'], services: ['netflix', 'sunnxt'], portrait: 'You love quiet Malayalam dramas.' },
    settingsUpdatedAt: 5,
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Get started/ }).click();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.getByText(/Welcome back! We brought over 6 titles and 1 list/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  // Key, languages and loved titles came from Drive, so setup jumps straight to the AI step.
  await expect(page.getByText('Meet your AI movie buff')).toBeVisible();
  await page.getByRole('button', { name: /Show me tonight/ }).click();
  await page.goto('/#/library');
  await expect(page.getByText('You love quiet Malayalam dramas.')).toBeVisible();
  await page.getByRole('tab', { name: /Loved/ }).click();
  await expect(page.getByText('All · 5')).toBeVisible();
  await page.getByRole('tab', { name: /Not for me/ }).click();
  await expect(page.getByText(title(106).title, { exact: true })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByText(/Connected as tester@example.com/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Sun NXT' })).toHaveAttribute('aria-checked', 'true');
});
