import { describe, expect, it } from 'vitest';
import changelog from '../CHANGELOG.md?raw';
import pkg from '../package.json';
import lock from '../package-lock.json';
import { APP_VERSION } from '../src/lib/appInfo';

describe('version', () => {
  it('comes from package.json, matches the lockfile and has a CHANGELOG entry', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    // Every release (each push to main) gets a dated entry, newest first.
    expect(changelog).toMatch(new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')} \\(\\d{4}-\\d{2}-\\d{2}\\)`, 'm'));
    expect(changelog.indexOf(`## ${pkg.version} `)).toBe(changelog.indexOf('## '));
  });
});
