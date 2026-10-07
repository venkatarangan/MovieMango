import { expect, type Page, type Route } from '@playwright/test';

const COLORS = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#A1887F', '#90A4AE', '#FFD54F'];
const LANGS = ['ta', 'hi', 'en'];
const GENRES = [[53, 80], [35, 10749], [18], [28, 12], [10751, 16], [9648, 53], [35], [878, 12], [99], [18, 10749]];
const NAMES = ['Kaatru Veliyidai', 'Panchayat Days', 'Silent Harbour', 'Madras Nights', 'Little Comets', 'The Ninth Clue', 'Laugh Riot', 'Starfall', 'Monsoon Diaries', 'Tea Estate'];

export const title = (id: number) => {
  const i = id % 10;
  return {
    id,
    title: `${NAMES[i]}${id >= 110 ? ` ${Math.floor(id / 10)}` : ''}`,
    original_language: LANGS[id % 3],
    genre_ids: GENRES[i],
    release_date: `${2000 + (id % 25)}-06-01`,
    vote_average: 6 + (id % 30) / 10,
    vote_count: 200 + id * 7,
    popularity: 100 - (id % 50),
    poster_path: `/poster${id}.jpg`,
    backdrop_path: `/backdrop${id}.jpg`,
    overview: 'A warm, sharply observed story about family, ambition and the little choices that change everything.',
  };
};

/** TV shows: Specials + two seasons of 6. Odd ids are still airing (S2 E5 and E6 air in 2030); even ids have ended. */
const EPISODE_NAMES = ['Pilot', 'The Long Way Home', 'Monsoon', 'Second Chances', 'Night Shift', 'The Wedding'];
const airing = (id: number) => id % 2 === 1;
const tvSeasons = (id: number) => ({
  status: airing(id) ? 'Returning Series' : 'Ended',
  seasons: [
    { season_number: 0, episode_count: 2, name: 'Specials', air_date: '2024-01-01', poster_path: null },
    { season_number: 1, episode_count: 6, name: 'Season 1', air_date: '2024-01-05', poster_path: null },
    { season_number: 2, episode_count: 6, name: 'Season 2', air_date: '2025-02-07', poster_path: null },
  ],
  last_episode_to_air: { season_number: 2, episode_number: airing(id) ? 4 : 6, air_date: '2025-03-01', name: 'Last aired' },
  next_episode_to_air: airing(id) ? { season_number: 2, episode_number: 5, air_date: '2030-10-12', name: EPISODE_NAMES[4] } : null,
});
const season = (id: number, n: number) => ({
  season_number: n,
  episodes: Array.from({ length: n === 0 ? 2 : 6 }, (_, i) => ({
    episode_number: i + 1,
    name: n === 0 ? `Special ${i + 1}` : EPISODE_NAMES[i],
    air_date: n === 2 && airing(id) && i >= 4 ? `2030-10-${12 + (i - 4) * 7}` : `${2023 + n}-0${n + 1}-${String(1 + i * 4).padStart(2, '0')}`,
    runtime: 42,
    overview: '',
    still_path: null,
  })),
});

const page = (ids: number[]) =>({ page: 1, total_pages: 1, total_results: ids.length, results: ids.map(title) });

function tmdb(path: string, search: URLSearchParams) {
  if (path === '/configuration') return { images: {} };
  if (path.startsWith('/watch/providers/'))
    return { results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg' }, { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg' }, { provider_id: 2336, provider_name: 'JioHotstar', logo_path: '/hotstar.jpg' }] };
  const langOffset = { ta: 0, hi: 300, en: 600 }[search.get('with_original_language') ?? ''] ?? 0;
  // Discover has many pages, like the real thing (browse pages show 100 at a time).
  const many = (p: ReturnType<typeof page>) => ({ ...p, page: Number(search.get('page') ?? 1), total_pages: 40, total_results: 800 });
  if (path.startsWith('/discover/tv')) return many(page(Array.from({ length: 12 }, (_, i) => 200 + i + langOffset + Number(search.get('page') ?? 1) * 20)));
  if (path.startsWith('/discover/movie')) {
    const offset = langOffset + (Number(search.get('page') ?? 1) - 1) * 20 + (search.get('sort_by')?.includes('vote_average') ? 40 : 0) + (search.get('primary_release_date.lte') ? 80 : 0);
    return many(page(Array.from({ length: 20 }, (_, i) => 100 + i + offset)));
  }
  if (path === '/search/keyword') return search.get('query')?.includes('heist') ? { page: 1, total_pages: 1, total_results: 2, results: [{ id: 10051, name: 'heist' }, { id: 9748, name: 'bank heist' }] } : page([]);
  const pm = path.match(/^\/person\/(\d+)$/);
  if (pm) {
    const id = Number(pm[1]);
    const director = id === 99;
    const credit = (tid: number, extra: object) => ({ ...title(tid), media_type: 'movie', ...extra });
    return {
      id,
      name: director ? 'Vetrimaaran' : 'Nayanthara',
      known_for_department: director ? 'Directing' : 'Acting',
      biography: 'An Indian filmmaker known for gritty, grounded stories. '.repeat(8),
      birthday: '1975-09-04',
      place_of_birth: 'Chennai, India',
      profile_path: null,
      combined_credits: {
        cast: director
          ? []
          : [
              ...[101, 102, 103, 104].map((t) => credit(t, { character: `Role ${t}` })),
              credit(105, { character: 'Herself' }),
              { ...title(240), title: undefined, name: 'Chat Show', media_type: 'tv', genre_ids: [10767], character: 'Guest', first_air_date: '2024-01-01' },
            ],
        crew: director ? [credit(106, { job: 'Director' }), credit(107, { job: 'Director' }), credit(107, { job: 'Writer' })] : [credit(108, { job: 'Director' })],
      },
    };
  }
  // Typed searches (imports): every title whose name matches, as three versions (e.g. "Starfall", "Starfall 11", "Starfall 12").
  const typed = path.match(/^\/search\/(movie|tv)$/);
  if (typed) {
    const q = (search.get('query') ?? '').toLowerCase();
    const ids = NAMES.flatMap((n, i) => (q && (n.toLowerCase().includes(q) || q.includes(n.toLowerCase())) ? [100 + i, 110 + i, 120 + i] : []));
    const p = page(ids);
    return typed[1] === 'tv' ? { ...p, results: p.results.map((r) => ({ ...r, name: r.title, title: undefined, first_air_date: r.release_date, release_date: undefined })) } : p;
  }
  if (path.startsWith('/find/')) return { movie_results: [title(105)], tv_results: [] };
  if (path.startsWith('/search') && search.get('query')?.includes('zzz')) return page([]);
  if (path.startsWith('/trending') || path.startsWith('/search')) return { ...page([101, 102, 103, 104, 105, 106, 107, 108]), results: page([101, 102, 103, 104, 105, 106, 107, 108]).results.map((r) => ({ ...r, media_type: 'movie' })) };
  if (path.endsWith('/recommendations')) return page([150, 151, 152, 153]);
  const sm = path.match(/^\/tv\/(\d+)\/season\/(\d+)$/);
  if (sm) return season(Number(sm[1]), Number(sm[2]));
  const m = path.match(/^\/(movie|tv)\/(\d+)$/);
  if (m) {
    const id = Number(m[2]);
    const t = title(id);
    const providers = [
      { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg' },
      { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg' },
      { provider_id: 2336, provider_name: 'JioHotstar', logo_path: '/hotstar.jpg' },
    ];
    return {
      ...t,
      name: m[1] === 'tv' ? t.title : undefined,
      first_air_date: m[1] === 'tv' ? t.release_date : undefined,
      number_of_seasons: m[1] === 'tv' ? 2 : undefined,
      ...(m[1] === 'tv' ? tvSeasons(id) : {}),
      genres: t.genre_ids.map((g) => ({ id: g, name: { 53: 'Thriller', 80: 'Crime', 35: 'Comedy', 10749: 'Romance', 18: 'Drama', 28: 'Action', 12: 'Adventure', 10751: 'Family', 16: 'Animation', 9648: 'Mystery', 878: 'Science Fiction', 99: 'Documentary' }[g] ?? 'Drama' })),
      runtime: m[1] === 'movie' ? 95 + (id % 40) : undefined,
      episode_run_time: m[1] === 'tv' ? [42] : undefined,
      tagline: 'Every choice has a sequel.',
      credits: { cast: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: ['Nayanthara', 'Fahadh Faasil', 'Tabu', 'Vijay Sethupathi', 'Sai Pallavi', 'Irrfan Khan', 'Revathi', 'Nawazuddin S.'][i], character: 'Role', profile_path: null })), crew: [{ id: 99, name: 'Vetrimaaran', job: 'Director' }] },
      videos: { results: [{ key: 'abc', site: 'YouTube', type: 'Trailer', official: true, name: 'Trailer' }] },
      'watch/providers': { results: { IN: { link: 'https://www.themoviedb.org/movie/1/watch', flatrate: [providers[id % 3]], ads: id % 2 ? [providers[(id + 1) % 3]] : [] } } },
      release_dates: { results: [{ iso_3166_1: 'IN', release_dates: [{ certification: id % 4 ? 'UA' : 'U' }] }] },
      keywords: { keywords: [] },
      external_ids: { wikidata_id: 'Q1' },
      recommendations: page([160, 161, 162, 163, 164, 165, 166]),
    };
  }
  return null;
}

function posterSvg(seed: number, w = 342, h = 513) {
  const c = COLORS[seed % COLORS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#27323F"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w / 2}" cy="${h * 0.38}" r="${w * 0.22}" fill="#fff" opacity=".25"/></svg>`;
}

export async function mockApis(page: Page) {
  await page.route('https://api.themoviedb.org/3/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const body = tmdb(url.pathname.replace(/^\/3/, ''), url.searchParams);
    if (!body) return route.fulfill({ status: 404, body: '{}' });
    await route.fulfill({ json: body });
  });
  await page.route('https://image.tmdb.org/**', (route) => {
    const n = Number(route.request().url().match(/(\d+)\.jpg/)?.[1] ?? 1);
    const logo = /netflix|prime|hotstar/.exec(route.request().url())?.[0];
    if (logo) {
      const fill = { netflix: '#E50914', prime: '#1A98FF', hotstar: '#0F1E4A' }[logo];
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92"><rect width="92" height="92" rx="18" fill="${fill}"/></svg>` });
    }
    return route.fulfill({ contentType: 'image/svg+xml', body: posterSvg(n) });
  });
  await page.route('https://public-api.wordpress.com/**', (route) => {
    const url = route.request().url();
    const post = {
      id: 33975,
      date: '2023-08-20T10:00:00',
      link: 'https://venkatarangan.com/blog/2023/08/jailer/',
      title: { rendered: 'Madras Nights (2003), a slow-burn treat' },
      excerpt: { rendered: '<p>Madras Nights takes its time, and rewards you for it. The performances are lived-in and the city is a character.</p>' },
      content: { rendered: '<p>Madras Nights takes its time, and rewards you for it.</p><h3>What works</h3><p>The performances are lived-in, and the city is a character of its own.</p><p>Verdict: <strong>Ripe</strong>.</p>' },
      tags: [1525],
      jetpack_featured_media_url: 'https://i0.wp.com/venkatarangan.com/cover-1.jpg',
    };
    if (/posts\/\d+/.test(url)) return route.fulfill({ json: post });
    if (url.includes('search=')) return route.fulfill({ json: url.includes('Madras') ? [post] : [] });
    return route.fulfill({ json: [post, { ...post, id: 2, title: { rendered: 'Starfall (2017), all sparkle no soul' }, tags: [1524] }, { ...post, id: 3, title: { rendered: 'Tea Estate (2019), pure comfort' }, tags: [1527] }] });
  });
  // Review covers are 1550×600, like the real ones.
  await page.route('https://i0.wp.com/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: posterSvg(3, 1550, 600) }));
  await page.route('https://www.wikidata.org/**', (route) => route.fulfill({ json: { entities: { Q1: { sitelinks: { enwiki: { title: 'Some Film' } } } } } }));
  await page.route('https://en.wikipedia.org/**', (route) =>
    route.fulfill({ json: { title: 'Some Film', extract: 'Some Film is an Indian drama film. It was well received for its performances and music.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Some_Film' } }, news: [] } }),
  );
  await page.route('https://www.googletagmanager.com/**', (route) => route.abort());
}

/** Fake Google sign-in (GIS) and a fake Drive appDataFolder holding at most one file. */
export async function mockGoogle(page: Page, existing: unknown = null) {
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: { callback: (r: object) => void }) => ({
            requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'test-token', expires_in: 3600 }), 50),
          }),
          hasGrantedAllScopes: () => true,
          revoke: () => {},
        },
      },
    };
  });
  // Counts each kind of Drive call, so tests can check batching and skipped downloads.
  const drive = { file: existing as unknown, modifiedTime: '2026-01-01T00:00:00.000Z', uploads: 0, downloads: 0, metas: 0, lists: 0 };
  await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => route.fulfill({ json: { email: 'tester@example.com' } }));
  await page.route('https://www.googleapis.com/drive/v3/files**', (route) => {
    const url = route.request().url();
    if (url.includes('alt=media')) return (drive.downloads++, route.fulfill({ json: drive.file }));
    if (/\/files\/f1\?/.test(url)) return (drive.metas++, drive.file ? route.fulfill({ json: { id: 'f1', modifiedTime: drive.modifiedTime } }) : route.fulfill({ status: 404, json: { error: { message: 'File not found' } } }));
    drive.lists++;
    return route.fulfill({ json: { files: drive.file ? [{ id: 'f1', modifiedTime: drive.modifiedTime }] : [] } });
  });
  await page.route('https://www.googleapis.com/upload/drive/v3/files**', async (route) => {
    const req = route.request();
    const body = req.postData() ?? '';
    drive.uploads++;
    drive.file = req.method() === 'PATCH' ? JSON.parse(body) : JSON.parse(body.split('\r\n\r\n')[2].split('\r\n--')[0]);
    drive.modifiedTime = new Date(Date.parse(drive.modifiedTime) + 1000).toISOString();
    return route.fulfill({ json: { id: 'f1', modifiedTime: drive.modifiedTime } });
  });
  return drive;
}

/** Skips onboarding: writes settings straight into the app's IndexedDB, then reloads. */
export async function seedOnboarded(page: Page, extra: Record<string, unknown> = {}) {
  await page.goto('/#/about');
  await expect(page.getByText(/This product uses the TMDB API/)).toBeVisible();
  await page.evaluate(
    (more) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('moviemango');
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'settings', value: { onboarded: true, tmdbToken: 'eyJ' + 'a'.repeat(80), aiEngine: 'basic', ...more } });
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    extra,
  );
  await page.reload();
}
