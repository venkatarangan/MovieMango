# Changelog

## Unreleased

### Added
- **Interactive Google Drive sign-in in first run** (step 2 of 6) with a Google-branded button. A new device restores lists, ratings, settings and keys, and skips ahead.
- Drive sync to a hidden `appDataFolder` file: newest-wins merge, debounced sync, header status icon, one-tap **Reconnect Drive**, and a Settings panel (sync now, disconnect).
- Static `public/privacy.html` for Google OAuth verification.
- Docs: `docs/testing-locally.md`, `docs/architecture.md`, this changelog.

### Fixed
- `tsconfig.tsbuildinfo` is no longer tracked.

## 0.1.0 (2026-10-03)

First build.

- **Tonight**: mood, time, audience and free-text inputs; TMDB candidates on the user's Indian OTT services and languages; scoring; AI re-rank with a reason for each pick; Later / Not tonight / Never feedback.
- **AI engines**: Gemini Nano (Chrome Prompt API), Qwen3 on WebGPU (WebLLM / Hugging Face), Gemini with the user's AI Studio key, and Basic (only when chosen).
- **Title pages**: India where-to-watch (subscription / free / ads) with Play buttons, mango ratings, Mangoidiots rating + excerpt + AI summary + in-app review reader, Wikipedia summary, cast, trailer, more like this.
- **Library**: Favourites, Watchlist, Watched, up to 50 custom lists, editable AI taste portrait.
- **Share/export**: share sheet with `.txt` on phones, download/copy elsewhere; JSON backup and restore.
- **Onboarding**: bring-your-own TMDB key with step-by-step instructions; region and language detection; tap 10 favourites tailored to languages and services.
- **Branding**: Cine-specs logo set (Mangoidiots mango in 3D glasses); light/dark theme; PWA.
- Attribution to TMDB, JustWatch, Mangoidiots, Wikipedia/Wikidata and the AI models; optional GA4 with opt-out; MIT license; GitHub Pages workflow.
