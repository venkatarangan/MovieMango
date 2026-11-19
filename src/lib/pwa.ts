/**
 * Is MovieMango running as an installed app (home-screen icon) rather than in a browser tab?
 *  - iPhone and iPad (Safari "Add to Home Screen"): `navigator.standalone`. iPadOS asks for desktop sites,
 *    so its user agent says "Mac"; this flag still works there.
 *  - Android (Chrome "Install app", Edge, Samsung Internet): the `display-mode` media query.
 *    A Trusted Web Activity reports itself with an `android-app://` referrer.
 *  - Desktop Chrome/Edge installed apps also match `display-mode`, which is fine.
 * A plain "Create shortcut" on Android opens in a browser tab and isn't detected.
 */
export interface PwaEnv {
  navigator?: { standalone?: boolean };
  matchMedia?: (q: string) => { matches: boolean };
  referrer?: string;
}

export function isInstalledPwa(env: PwaEnv = defaultEnv()): boolean {
  if (env.navigator?.standalone === true) return true;
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  try {
    if (modes.some((m) => env.matchMedia?.(`(display-mode: ${m})`).matches)) return true;
  } catch {
    /* matchMedia unavailable */
  }
  return !!env.referrer?.startsWith('android-app://');
}

function defaultEnv(): PwaEnv {
  if (typeof window === 'undefined') return {};
  return { navigator: window.navigator as PwaEnv['navigator'], matchMedia: window.matchMedia?.bind(window), referrer: document.referrer };
}
