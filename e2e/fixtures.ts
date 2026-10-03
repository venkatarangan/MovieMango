import type { Page, Route } from '@playwright/test';

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

const page = (ids: number[]) => ({ page: 1, total_pages: 1, total_results: ids.length, results: ids.map(title) });

function tmdb(path: string, search: URLSearchParams) {
  if (path === '/configuration') return { images: {} };
  if (path.startsWith('/watch/providers/'))
    return { results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg' }, { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg' }, { provider_id: 2336, provider_name: 'JioHotstar', logo_path: '/hotstar.jpg' }] };
  const langOffset = { ta: 0, hi: 300, en: 600 }[search.get('with_original_language') ?? ''] ?? 0;
  if (path.startsWith('/discover/tv')) return page(Array.from({ length: 12 }, (_, i) => 200 + i + langOffset + Number(search.get('page') ?? 1) * 20));
  if (path.startsWith('/discover/movie')) {
    const offset = langOffset + (Number(search.get('page') ?? 1) - 1) * 20 + (search.get('sort_by')?.includes('vote_average') ? 40 : 0) + (search.get('primary_release_date.lte') ? 80 : 0);
    return page(Array.from({ length: 20 }, (_, i) => 100 + i + offset));
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
      genres: t.genre_ids.map((g) => ({ id: g, name: { 53: 'Thriller', 80: 'Crime', 35: 'Comedy', 10749: 'Romance', 18: 'Drama', 28: 'Action', 12: 'Adventure', 10751: 'Family', 16: 'Animation', 9648: 'Mystery', 878: 'Science Fiction', 99: 'Documentary' }[g] ?? 'Drama' })),
      runtime: m[1] === 'movie' ? 95 + (id % 40) : undefined,
      episode_run_time: m[1] === 'tv' ? [42] : undefined,
      tagline: 'Every choice has a sequel.',
      credits: { cast: Array.from({ length: 8 }, (_, i) => ({ id: i, name: ['Nayanthara', 'Fahadh Faasil', 'Tabu', 'Vijay Sethupathi', 'Sai Pallavi', 'Irrfan Khan', 'Revathi', 'Nawazuddin S.'][i], character: 'Role', profile_path: null })), crew: [{ id: 99, name: 'Vetrimaaran', job: 'Director' }] },
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
      jetpack_featured_media_url: '',
    };
    if (/posts\/\d+/.test(url)) return route.fulfill({ json: post });
    if (url.includes('search=')) return route.fulfill({ json: url.includes('Madras') ? [post] : [] });
    return route.fulfill({ json: [post, { ...post, id: 2, title: { rendered: 'Starfall (2017), all sparkle no soul' }, tags: [1524] }, { ...post, id: 3, title: { rendered: 'Tea Estate (2019), pure comfort' }, tags: [1527] }] });
  });
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
  const drive = { file: existing as unknown, uploads: 0 };
  await page.route('https://www.googleapis.com/oauth2/v3/userinfo', (route) => route.fulfill({ json: { email: 'tester@example.com' } }));
  await page.route('https://www.googleapis.com/drive/v3/files**', (route) => {
    const url = route.request().url();
    if (url.includes('alt=media')) return route.fulfill({ json: drive.file });
    return route.fulfill({ json: { files: drive.file ? [{ id: 'f1', modifiedTime: new Date().toISOString() }] : [] } });
  });
  await page.route('https://www.googleapis.com/upload/drive/v3/files**', async (route) => {
    const req = route.request();
    const body = req.postData() ?? '';
    drive.uploads++;
    drive.file = req.method() === 'PATCH' ? JSON.parse(body) : JSON.parse(body.split('\r\n\r\n')[2].split('\r\n--')[0]);
    return route.fulfill({ json: { id: 'f1' } });
  });
  return drive;
}
