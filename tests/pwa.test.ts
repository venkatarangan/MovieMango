import { describe, expect, it } from 'vitest';
import { isInstalledPwa, type PwaEnv } from '../src/lib/pwa';

const modes = (...on: string[]): PwaEnv['matchMedia'] => (q) => ({ matches: on.some((m) => q.includes(`display-mode: ${m}`)) });

describe('installed app detection', () => {
  it('detects iPhone and iPad home-screen apps by navigator.standalone', () => {
    expect(isInstalledPwa({ navigator: { standalone: true }, matchMedia: modes() })).toBe(true);
  });

  it('detects Android installed apps by display-mode', () => {
    expect(isInstalledPwa({ matchMedia: modes('standalone') })).toBe(true);
    expect(isInstalledPwa({ matchMedia: modes('minimal-ui') })).toBe(true);
    expect(isInstalledPwa({ matchMedia: modes('fullscreen') })).toBe(true);
  });

  it('detects a Trusted Web Activity by its referrer', () => {
    expect(isInstalledPwa({ matchMedia: modes(), referrer: 'android-app://com.example.twa' })).toBe(true);
  });

  it('says no in a normal browser tab', () => {
    expect(isInstalledPwa({ navigator: { standalone: false }, matchMedia: modes('browser'), referrer: 'https://www.google.com/' })).toBe(false);
    expect(isInstalledPwa({})).toBe(false);
  });

  it('does not throw when matchMedia fails', () => {
    expect(isInstalledPwa({ matchMedia: () => { throw new Error('nope'); } })).toBe(false);
  });
});
