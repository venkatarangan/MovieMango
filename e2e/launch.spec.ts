import { expect, test, type Page } from '@playwright/test';
import { mockApis, mockGoogle, seedOnboarded, title } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

/** Makes the page look like an installed app, with a clipboard that answers the way each platform does. */
async function installedApp(page: Page, clipboard: { android?: string; ios?: string }) {
  await page.addInitScript((cb) => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      const mql = orig(q);
      if (q.includes('display-mode: standalone')) Object.defineProperty(mql, 'matches', { value: true });
      return mql;
    };
    let calls = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        // Android Chrome answers at launch. iPhone/iPad refuse until the user has tapped (the second read here).
        readText: async () => {
          calls++;
          if (cb.android !== undefined) return cb.android;
          if (calls === 1) throw new DOMException('Needs a user gesture', 'NotAllowedError');
          return cb.ios ?? '';
        },
      },
    });
  }, clipboard);
}

const FILM = title(103).title;

test('Skip AI in setup: Basic mode, picks work, no setup card in the way', async ({ page }, info) => {
  await mockApis(page);
  await mockGoogle(page, {
    app: 'MovieMango',
    version: 1,
    savedAt: 1,
    items: [101, 102, 103, 104, 105, 106].map((id) => ({ key: `movie:${id}`, tmdbId: id, type: 'movie', title: title(id).title, year: 2020, posterPath: title(id).poster_path, genreIds: title(id).genre_ids, originalLanguage: title(id).original_language, lists: ['watched'], rating: 'love', addedAt: 1, updatedAt: 1 })),
    lists: [],
    settings: { tmdbToken: 'eyJ' + 'b'.repeat(80), languages: ['ta'], services: ['netflix'] },
    settingsUpdatedAt: 5,
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Get started/ }).click();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Meet your AI movie buff')).toBeVisible();
  await expect(page.getByText(/It’s optional/)).toBeVisible();
  await page.screenshot({ path: shot('20-skip-ai', info.project.name), fullPage: true });
  await page.getByRole('button', { name: 'Skip AI for now' }).click();
  await expect(page).toHaveURL(/#\/tonight$/);
  await expect(page.getByText('Basic · no AI')).toBeVisible();
  await expect(page.getByText(/AI isn’t set up/)).toHaveCount(0);
  await page.getByRole('button', { name: /Find my picks/ }).click();
  await expect(page.getByRole('heading', { name: 'Your picks' })).toBeVisible({ timeout: 30_000 });
});

test('Tonight without any AI choice still works and the notice is one line, not a setup card', async ({ page }, info) => {
  await mockApis(page);
  await seedOnboarded(page, { aiEngine: 'auto' });
  await page.goto('/#/tonight');
  await expect(page.getByText(/AI isn’t set up on this device/)).toBeVisible();
  await expect(page.getByText('Meet your AI movie buff')).toHaveCount(0);
  await page.screenshot({ path: shot('21-tonight-no-ai', info.project.name), fullPage: true });
  await page.getByRole('button', { name: /Find my picks/ }).click();
  await expect(page.getByRole('heading', { name: 'Your picks' })).toBeVisible({ timeout: 30_000 });
});

test('Installed app: Drive reconnects quietly and the clipboard title is offered (Android)', async ({ page }, info) => {
  await mockApis(page);
  await installedApp(page, { android: FILM });
  const drive = await mockGoogle(page);
  await seedOnboarded(page, { driveConnected: true, driveEmail: 'tester@example.com' });

  // No button pressed: the app asked Google quietly and the first sync ran.
  await expect.poll(() => drive.uploads).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __gisPrompts: string[] }).__gisPrompts)).toContain('none');
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toHaveCount(0);

  // The clipboard card asks first; nothing is searched until the user taps.
  await expect(page.getByText(`Search for “${FILM}”?`)).toBeVisible();
  await expect(page).not.toHaveURL(/search/);
  await page.screenshot({ path: shot('22-clipboard-card', info.project.name) });
  await page.getByRole('button', { name: 'Search the clipboard text' }).click();
  await expect(page).toHaveURL(/#\/search\?q=/);
  await expect(page.getByRole('textbox', { name: 'Search movies and TV shows' })).toHaveValue(FILM);
  await expect(page.getByText(`Results for “${FILM}”`)).toBeVisible();
  // Used once: coming back later doesn't offer the same text again.
  await page.reload();
  await expect(page.getByText(/Search for “/)).toHaveCount(0);
});

test('Installed app: if Google needs a tap, the Reconnect chip stays and nothing interrupts', async ({ page }) => {
  await mockApis(page);
  await installedApp(page, {});
  const drive = await mockGoogle(page, null, { silent: 'fail' });
  await seedOnboarded(page, { driveConnected: true, driveEmail: 'tester@example.com', launchClipboardSearch: false });
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toBeVisible();
  expect(drive.uploads).toBe(0);
  await expect(page.getByText(/Search what you copied/)).toHaveCount(0);
  // The user chooses when to sign in.
  await page.getByRole('button', { name: 'Reconnect Drive' }).click();
  await expect.poll(() => drive.uploads).toBe(1);
});

test('Installed app on iPhone/iPad: the card asks, and the tap does the read', async ({ page }) => {
  await mockApis(page);
  await installedApp(page, { ios: FILM });
  await seedOnboarded(page);
  await expect(page.getByText('Search what you copied?')).toBeVisible();
  await page.getByRole('button', { name: 'Search the clipboard text' }).click();
  await expect(page.getByRole('textbox', { name: 'Search movies and TV shows' })).toHaveValue(FILM);
});

test('Browser tab, or switched off in Settings: no quiet reconnect and no clipboard card', async ({ page }) => {
  await mockApis(page);
  await page.addInitScript((t) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => t } }), FILM);
  const drive = await mockGoogle(page);
  await seedOnboarded(page, { driveConnected: true, driveEmail: 'tester@example.com' });
  await expect(page.getByRole('button', { name: 'Reconnect Drive' })).toBeVisible();
  expect(drive.uploads).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __gisPrompts: string[] }).__gisPrompts)).toEqual([]);
  await expect(page.getByRole('region', { name: 'Search what you copied' })).toHaveCount(0);
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'When the app opens' })).toBeVisible();
  await expect(page.getByLabel('Offer to search what I copied')).toBeChecked();
});

test('Clipboard card: a shared "title + link" searches the title only', async ({ page }) => {
  await mockApis(page);
  await installedApp(page, { android: `${FILM} (2019)\nhttps://www.imdb.com/title/tt0000103/` });
  await seedOnboarded(page);
  await expect(page.getByText(`Search for “${FILM}”?`)).toBeVisible();
  await page.getByRole('button', { name: 'Search the clipboard text' }).click();
  await expect(page).toHaveURL(new RegExp(`#/search\\?q=${encodeURIComponent(FILM).replace(/%20/g, '(%20|\\+)')}$`));
  await expect(page.getByRole('textbox', { name: 'Search movies and TV shows' })).toHaveValue(FILM);
  await expect(page.getByText(`Results for “${FILM}”`)).toBeVisible();
});

test('Clipboard card while already on Search: the pasted title replaces what was typed and is searched', async ({ page }) => {
  await mockApis(page);
  await installedApp(page, { android: FILM });
  await seedOnboarded(page);
  await page.goto('/#/search?q=Starfall');
  const box = page.getByRole('textbox', { name: 'Search movies and TV shows' });
  await expect(page.getByText('Results for “Starfall”')).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Search for “${FILM}”?`)).toBeVisible();
  await page.getByRole('button', { name: 'Search the clipboard text' }).click();
  await expect(box).toHaveValue(FILM);
  await expect(page.getByText(`Results for “${FILM}”`)).toBeVisible();
  await expect(page).toHaveURL(/q=Madras/);
});

test('iPhone/iPad: if the copied text is not a title, the tap says so instead of opening an empty page', async ({ page }) => {
  await mockApis(page);
  await installedApp(page, { ios: 'https://example.com/some/page' });
  await seedOnboarded(page);
  await page.getByRole('button', { name: 'Search the clipboard text' }).click();
  await expect(page.getByText(/doesn’t look like a title/)).toBeVisible();
  await expect(page).toHaveURL(/#\/search$/);
});
