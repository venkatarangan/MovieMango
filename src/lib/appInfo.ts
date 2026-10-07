/** From package.json at build time (vite.config.ts). Bump with `npm version patch|minor --no-git-tag-version`. */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0';
/** Short commit id of this build: set by the deploy workflow, 'dev' for local builds. */
export const BUILD_ID: string = (import.meta.env.VITE_BUILD_SHA as string | undefined)?.slice(0, 7) || 'dev';
export const SOURCE_URL = 'https://github.com/venkatarangan/MovieMango';
