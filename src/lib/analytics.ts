/**
 * Google Analytics 4, only when VITE_GA_ID is set at build time and the user hasn't turned it off.
 * We send page views and feature names only — never titles, lists, moods, ratings or keys.
 */
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let started = false;
let enabled = false;

export const analyticsConfigured = () => !!GA_ID;

export function setAnalytics(on: boolean) {
  enabled = on && !!GA_ID;
  if (!enabled || started || typeof document === 'undefined') {
    if (started) window.gtag?.('consent', 'update', { analytics_storage: on ? 'granted' : 'denied' });
    return;
  }
  started = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

/** Page path without ids, e.g. "/title/movie" rather than "/title/movie/12345". */
export function trackPage(path: string) {
  if (!enabled) return;
  const clean = path.replace(/\/\d+(?=\/|$)/g, '').replace(/\?.*$/, '');
  window.gtag?.('event', 'page_view', { page_path: clean, page_location: `${location.origin}${clean}` });
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>) {
  if (!enabled) return;
  window.gtag?.('event', name, params);
}
