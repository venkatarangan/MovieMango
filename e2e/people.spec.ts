import { expect, test, type Page } from '@playwright/test';
import { mockApis, mockGoogle, seedOnboarded } from './fixtures';

const shot = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

/** Per-title "where does it stream" requests (not discover or catalogue calls). */
function countProviderCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/3\/(movie|tv)\/(\d+)\/watch\/providers/);
    if (m) calls.push(m[2]);
  });
  return calls;
}

const rows = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('moviemango');
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => (open.result.close(), resolve(req.result));
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
    store,
  );

test('Favourite a person, see them in Library → People, then un-favourite (no title is added anywhere)', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);

  await page.goto('/#/library?tab=people');
  await expect(page.getByText('No favourite people yet')).toBeVisible();
  await expect(page.getByText(/adds nothing to your lists/)).toBeVisible();

  await page.goto('/#/person/1336965');
  await expect(page.getByRole('heading', { name: 'Nayanthara' })).toBeVisible();
  const fav = page.getByRole('button', { name: 'Add to favourites' });
  await fav.click();
  await expect(page.getByText('Nayanthara is now a favourite. Nothing was added to your lists.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favourite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: shot('60-person-favourite', info.project.name) });
  expect(await rows(page, 'items')).toHaveLength(0);
  expect(await rows(page, 'people')).toMatchObject([{ id: 1336965, name: 'Nayanthara', department: 'Acting' }]);

  // Home has a row with their work on my services.
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '🎭 From your favourite people' })).toBeVisible();

  await page.goto('/#/library?tab=people');
  const card = page.getByRole('link', { name: /Nayanthara/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Actor');
  await page.screenshot({ path: shot('61-library-people', info.project.name) });
  // Nothing landed in the other lists.
  await page.getByRole('tab', { name: 'Watchlist' }).click();
  await expect(page.getByText('Nothing in Watchlist yet')).toBeVisible();

  // It survives a reload, opens the person page, and can be removed (with Undo).
  await page.goto('/#/library?tab=people');
  await page.reload();
  await card.click();
  await expect(page).toHaveURL(/#\/person\/1336965/);
  await page.goBack();
  await page.getByRole('button', { name: 'Remove Nayanthara from favourites' }).click();
  await expect(page.getByText('Nayanthara is no longer a favourite.')).toBeVisible();
  await expect(page.getByText('No favourite people yet')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Remove Nayanthara from favourites' }).click();
  await expect(page.getByText('No favourite people yet')).toBeVisible();
  await page.goto('/#/person/1336965');
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Person page: Streaming filter checks a batch lazily, goes in the URL, and works with the tabs', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockApis(page);
  await seedOnboarded(page);
  const calls = countProviderCalls(page);

  // Acting: 101 Hotstar + Netflix · 102 Netflix · 103 Prime + Hotstar · 104 Hotstar. Directing: 108 Hotstar.
  await page.goto('/#/person/1336965');
  await expect(page.getByRole('tab', { name: 'Acting (4)' })).toBeVisible();
  const streaming = page.getByRole('combobox', { name: 'Streaming' });
  await streaming.click();
  // Opening the menu looks up the first batch of titles; counts fill in.
  await expect(page.getByRole('option', { name: 'Netflix (2)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'On my services (4)' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Prime Video (1)' })).toBeVisible();
  await page.screenshot({ path: shot('62-person-streaming-menu', info.project.name) });
  await page.getByRole('option', { name: 'Netflix (2)' }).click();
  await expect(page).toHaveURL(/on=netflix/);
  await expect(page.getByText(/Showing 2 of 4 on Netflix/)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Acting (2 of 4)' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Madras Nights|Panchayat|Kaatru|Silent/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'All · 2' })).toBeVisible();
  await page.screenshot({ path: shot('63-person-netflix', info.project.name), fullPage: true });
  expect(new Set(calls)).toEqual(new Set(['101', '102', '103', '104'])); // each credit once, nothing else
  expect(calls).toHaveLength(4);

  // Saved info means no new checks after a reload; the filter is still on.
  await page.reload();
  await expect(page.getByText(/Showing 2 of 4 on Netflix/)).toBeVisible();
  expect(calls).toHaveLength(4);

  // The Directing tab keeps the filter (108 is on Netflix). Another service gives an empty state, not an error.
  await page.getByRole('tab', { name: /Directing/ }).click();
  await expect(page.getByText(/Showing 1 of 1 on Netflix/)).toBeVisible();
  expect(calls).toHaveLength(5);
  await streaming.click();
  await page.getByRole('option', { name: 'Prime Video (0)' }).click();
  await expect(page.getByText(/None of .* on Prime Video right now/)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Directing (0 of 1)' })).toBeVisible();
  await page.screenshot({ path: shot('64-person-empty', info.project.name) });

  // ⟳ asks TMDB again for titles with saved info and reports what changed.
  await page.route('https://api.themoviedb.org/3/movie/108/watch/providers**', (route) =>
    route.fulfill({ json: { id: 108, results: { IN: { flatrate: [{ provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg' }] } } } }),
  );
  await page.getByRole('button', { name: 'Check where these stream again' }).click();
  await expect(page.getByText('Updated. 1 title changed services.')).toBeVisible();
  await expect(page.getByText(/Showing 1 of 1 on Prime Video/)).toBeVisible();
  expect(calls).toHaveLength(6);

  // Clearing the filter shows everything again.
  await streaming.click();
  await page.getByRole('option', { name: 'Any' }).click();
  await expect(page).not.toHaveURL(/on=/);
  await expect(page.getByText(/Showing/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Person page: a shared link with ?on= works, and the check is bounded for a long filmography', async ({ page }) => {
  await mockApis(page);
  await seedOnboarded(page);
  // 60 released credits: only the newest batch of 24 is looked up.
  await page.route('https://api.themoviedb.org/3/person/55**', (route) =>
    route.fulfill({
      json: {
        id: 55,
        name: 'Prolific Actor',
        known_for_department: 'Acting',
        combined_credits: { cast: Array.from({ length: 60 }, (_, i) => ({ id: 300 + i, media_type: 'movie', title: `Credit ${i}`, genre_ids: [18], original_language: 'hi', release_date: `${1960 + i}-01-01`, poster_path: null, vote_count: 10, character: 'Role' })), crew: [] },
      },
    }),
  );
  const calls = countProviderCalls(page);
  await page.goto('/#/person/55?on=mine');
  await expect(page.getByText(/Showing \d+ of 60 on my services\. Checked 24 of 60 released titles\./)).toBeVisible({ timeout: 40_000 });
  expect(calls).toHaveLength(24);
  await page.getByRole('button', { name: 'Check 24 more' }).click();
  await expect(page.getByText(/Checked 48 of 60/)).toBeVisible({ timeout: 40_000 });
  expect(calls).toHaveLength(48);
});

test('Favourite people sync to Drive in the normal batch, and a removal made elsewhere stays removed', async ({ page }) => {
  await page.clock.install();
  await mockApis(page);
  const stamp = 1_700_000_000_000;
  const drive = await mockGoogle(page, {
    app: 'MovieMango',
    version: 1,
    savedAt: stamp,
    items: [],
    lists: [],
    people: [
      { id: 3, name: 'Drive Person', profilePath: null, addedAt: stamp, updatedAt: stamp },
      { id: 4, name: 'Removed Person', profilePath: null, addedAt: stamp, updatedAt: stamp, deleted: true },
    ],
    settings: {},
    settingsUpdatedAt: 0,
  });
  await seedOnboarded(page, { driveConnected: true, driveEmail: 'tester@example.com', driveAutoReconnect: false });
  await page.getByRole('button', { name: 'Reconnect Drive' }).click();
  await expect.poll(() => drive.downloads).toBe(1);

  await page.goto('/#/library?tab=people');
  await expect(page.getByRole('link', { name: /Drive Person/ })).toBeVisible();
  await expect(page.getByText('Removed Person')).toHaveCount(0);

  // Favouriting here joins the batch: one upload after the window, no extra Drive calls.
  await page.goto('/#/person/1336965');
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  const uploads = drive.uploads;
  await page.clock.fastForward('01:00');
  expect(drive.uploads).toBe(uploads);
  await page.clock.fastForward('01:05');
  await expect.poll(() => drive.uploads).toBe(uploads + 1);
  const sent = (drive.file as { people: { id: number; deleted?: boolean }[] }).people;
  expect(sent.map((p) => [p.id, !!p.deleted]).sort()).toEqual([[1336965, false], [3, false], [4, true]]);
});

test('Person page: the Streaming menu has "Not streaming", and it lists titles with no service', async ({ page }) => {
  await mockApis(page);
  await seedOnboarded(page);
  // Title 102 is on no service in India right now (the others keep the shared mock).
  await page.route('https://api.themoviedb.org/3/movie/102/watch/providers**', (route) => route.fulfill({ json: { id: 102, results: { IN: {} } } }));
  await page.goto('/#/person/1336965?on=none');
  await expect(page.getByText(/Showing 1 of 4 not streaming on any service/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Acting (1 of 4)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Streaming' }).click();
  await expect(page.getByRole('option', { name: 'Not streaming (1)' })).toBeVisible();
  await page.getByRole('option', { name: 'Not streaming (1)' }).click();
  await expect(page).toHaveURL(/on=none/);
});
