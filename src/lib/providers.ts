import type { TmdbProvider, TmdbRegionProviders } from '../api/tmdb';

/**
 * India v1 catalogue: the top OTT services we show. TMDB provider IDs change after mergers
 * (e.g. Disney+ Hotstar → JioHotstar), so we match by name at runtime and keep known IDs as a fallback.
 * Search URLs are best effort; when a service has none we open its home page.
 */
export interface ServiceDef {
  key: string;
  name: string;
  match: RegExp;
  fallbackIds: number[];
  color: string;
  home: string;
  search?: (query: string) => string;
}

const q = encodeURIComponent;

export const SERVICES: ServiceDef[] = [
  { key: 'netflix', name: 'Netflix', match: /^netflix/i, fallbackIds: [8, 175], color: '#E50914', home: 'https://www.netflix.com/', search: (s) => `https://www.netflix.com/search?q=${q(s)}` },
  { key: 'prime', name: 'Prime Video', match: /^amazon prime video/i, fallbackIds: [119, 2100], color: '#1A98FF', home: 'https://www.primevideo.com/', search: (s) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q(s)}` },
  { key: 'jiohotstar', name: 'JioHotstar', match: /hotstar|jio ?cinema/i, fallbackIds: [122, 220, 2336], color: '#0F1E4A', home: 'https://www.hotstar.com/in', search: (s) => `https://www.hotstar.com/in/explore?search_query=${q(s)}` },
  { key: 'zee5', name: 'ZEE5', match: /^zee ?5/i, fallbackIds: [232], color: '#8230C6', home: 'https://www.zee5.com/', search: (s) => `https://www.zee5.com/search?q=${q(s)}` },
  { key: 'sonyliv', name: 'SonyLIV', match: /^sony ?liv/i, fallbackIds: [237], color: '#E0A526', home: 'https://www.sonyliv.com/' },
  { key: 'aha', name: 'aha', match: /^aha\b/i, fallbackIds: [532], color: '#FF6B00', home: 'https://www.aha.video/' },
  { key: 'sunnxt', name: 'Sun NXT', match: /^sun ?nxt/i, fallbackIds: [309], color: '#F15A24', home: 'https://www.sunnxt.com/' },
  { key: 'appletv', name: 'Apple TV+', match: /^apple tv(\+|\s*plus)?$/i, fallbackIds: [350], color: '#111111', home: 'https://tv.apple.com/in', search: (s) => `https://tv.apple.com/in/search?term=${q(s)}` },
  { key: 'mxplayer', name: 'MX Player', match: /^mx ?player/i, fallbackIds: [515], color: '#2B6CF6', home: 'https://www.mxplayer.in/' },
  { key: 'youtube', name: 'YouTube', match: /^youtube$/i, fallbackIds: [192], color: '#FF0000', home: 'https://www.youtube.com/', search: (s) => `https://www.youtube.com/results?search_query=${q(s)}` },
];

export const DEFAULT_SERVICES = ['netflix', 'prime', 'jiohotstar'];

export const serviceByKey = (key: string) => SERVICES.find((s) => s.key === key);

export function serviceForProvider(p: Pick<TmdbProvider, 'provider_id' | 'provider_name'>): ServiceDef | undefined {
  return SERVICES.find((s) => s.match.test(p.provider_name.trim())) ?? SERVICES.find((s) => s.fallbackIds.includes(p.provider_id));
}

/** Maps each service key to every TMDB provider ID that belongs to it in this region. */
export function resolveProviderIds(catalogue: TmdbProvider[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of SERVICES) out[s.key] = [...s.fallbackIds];
  for (const p of catalogue) {
    const s = serviceForProvider(p);
    if (s && !out[s.key].includes(p.provider_id)) out[s.key].push(p.provider_id);
  }
  return out;
}

export type Access = 'subscription' | 'free' | 'ads';

export interface Availability {
  service: ServiceDef;
  access: Access;
  providerName: string;
  logoPath: string;
}

/** Subscription, free and ad-supported offers only (no rent/buy), one entry per service, best access first. */
export function availabilityFrom(region?: TmdbRegionProviders): Availability[] {
  if (!region) return [];
  const out = new Map<string, Availability>();
  const add = (list: TmdbProvider[] | undefined, access: Access) => {
    for (const p of list ?? []) {
      const service = serviceForProvider(p);
      if (service && !out.has(service.key)) out.set(service.key, { service, access, providerName: p.provider_name, logoPath: p.logo_path });
    }
  };
  add(region.flatrate, 'subscription');
  add(region.free, 'free');
  add(region.ads, 'ads');
  return SERVICES.map((s) => out.get(s.key)).filter((a): a is Availability => !!a);
}

export function playUrl(service: ServiceDef, title: string) {
  return service.search ? service.search(title) : service.home;
}
