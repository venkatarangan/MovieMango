import { describe, expect, it } from 'vitest';
import { availabilityFrom, playUrl, resolveProviderIds, serviceByKey } from '../src/lib/providers';

describe('providers', () => {
  it('matches renamed services by name and keeps fallback IDs', () => {
    const ids = resolveProviderIds([
      { provider_id: 9999, provider_name: 'JioHotstar', logo_path: '' },
      { provider_id: 2100, provider_name: 'Amazon Prime Video with Ads', logo_path: '' },
      { provider_id: 1, provider_name: 'Some Other Service', logo_path: '' },
    ]);
    expect(ids.jiohotstar).toContain(9999);
    expect(ids.jiohotstar).toContain(122);
    expect(ids.prime).toEqual(expect.arrayContaining([119, 2100]));
  });

  it('lists subscription, free and ads offers only, never rent or buy', () => {
    const a = availabilityFrom({
      flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png' }],
      free: [{ provider_id: 192, provider_name: 'YouTube', logo_path: '/y.png' }],
      rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '' }],
      buy: [{ provider_id: 3, provider_name: 'Google Play Movies', logo_path: '' }],
    });
    expect(a.map((x) => [x.service.key, x.access])).toEqual([
      ['netflix', 'subscription'],
      ['youtube', 'free'],
    ]);
  });

  it('builds search links, or falls back to the home page', () => {
    expect(playUrl(serviceByKey('netflix')!, 'Jailer')).toBe('https://www.netflix.com/search?q=Jailer');
    expect(playUrl(serviceByKey('sonyliv')!, 'x')).toBe('https://www.sonyliv.com/');
  });
});
