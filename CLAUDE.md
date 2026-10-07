# MovieMango: notes for AI coding sessions

Private, free, open movie/TV companion PWA. Live at https://watch.mangoidiots.com (GitHub Pages, HTTPS enforced, Cloudflare DNS-only CNAME), repo github.com/venkatarangan/MovieMango (MIT). The owner is Venkatarangan Thirumalai (Mangoidiots).

## Commands
- `npm run dev` (port 5173) · `npm test` (Vitest) · `npm run e2e` (Playwright, all APIs mocked) · `npm run typecheck` · `npm run build`
- Run `npm test` and `npm run e2e` before committing UI or logic changes, and look at the screenshots in `test-results/screens/`.
- A push to `main` deploys (GitHub Actions → Pages) in about a minute. Hosting, DNS and fixes: `docs/operations.md`.

## Where things are
- Code map and key decisions: `docs/architecture.md`. Local testing: `docs/testing-locally.md`.
- **Session log:** `moviemango-plan.md` keeps every user prompt word for word, with a short response, round by round. Append a new round for each significant request, and update the Status line at the top.
- Branding: `branding/logo.py` regenerates all logo/icon files (copy them to `public/`).

## Product rules
- No backend, ever. User data lives in IndexedDB, plus the user's own Drive `appDataFolder` when connected.
- Users bring their own keys (TMDB required, Gemini optional). Never commit keys. `VITE_*` values are public.
- The AI only re-ranks real TMDB candidates; it must never invent titles. Basic (no AI) mode is used only when the user chooses it.
- Region is India only in v1. Show subscription, free and ads offers only, never rent/buy.
- Each title has a status (Watchlist or Watched) and an optional rating: 👎 Not for me · 👍 Liked it · ❤️ Loved it (`MyRating`, `src/lib/ratings.ts`). Mango ratings (`MangoRating`) are only the Mangoidiots review scale, never a user rating.
- Keep attribution: the TMDB notice ("uses the TMDB API but is not endorsed or certified by TMDB") with its logo, JustWatch for availability, Mangoidiots for reviews.

## Style
- End-user copy: short, friendly, explains what something does and why it's safe or free. Developer docs: terse; readers use AI agents.
- Match existing code style. MUI `sx` `borderRadius` numbers are multiplied by 16 px, so use pixel strings like `'12px'`.

## Gotchas
- Mangoidiots is WordPress.com site **974561** (mangoidiots.com redirects to venkatarangan.com). Review rating tags: Rotten 1523, Raw 1524, Ripe 1525, Delicious 1527. Categories: movies 26, TV 232.
- TMDB provider IDs change after mergers (e.g. Hotstar → JioHotstar); `src/lib/providers.ts` matches by name.
- The WebLLM chunk (~6 MB) is lazy and excluded from the service-worker precache (`vite.config.ts`).
- Playwright runs with `timezoneId: Asia/Kolkata` so India is detected.
- Node isn't installed on Windows here; run npm in WSL (nvm). From Git Bash, prefix `wsl` calls with `MSYS_NO_PATHCONV=1` or `/mnt/c` paths get mangled.
- Headless Chromium in WSL has no emoji font, so emoji show as boxes in screenshots; that's not an app bug. Pixel 7 emulation still reports `hover: hover`, so row arrows show in mobile screenshots (not on real phones).
- Tests on `/mnt/c` (WSL) can stall (jsdom import takes minutes when the disk is busy). Run them from an rsync copy on the Linux filesystem with its own `npm ci`, excluding `*.tsbuildinfo` (a stale one hid a type error that then failed CI). Port 5199 must be free for Playwright.
- `tsconfig.json` has no Node types (it covers `e2e` too), so specs can't import `node:*`; read downloads in the page instead.
- Custom titles have a **negative `tmdbId`**: never send one to TMDB (`isCustom()`).
- TMDB responses are cached hard (`src/api/http.ts`, `src/api/recent.ts`); cached objects are shared, so don't mutate them. Every new TMDB call should go through `tmdbGet`.
- Drive sync is batched (2-minute window, at most 3 Drive calls per sync, one sync at a time, backoff on 429/403 rate limits/5xx). Don't sync per change; see `docs/architecture.md`.
- The Chrome Prompt API has been stable for web pages since Chrome 148. Check fast-moving facts like this before stating limits.

## Open items
- Infra is complete (DNS, Pages, HTTPS). Social features (posts, reactions, friends) are out of scope; they would need a server.
- Google OAuth web client created 2026-10-07 (scopes `drive.appdata`, `openid`, `email`; origins watch.mangoidiots.com, localhost:5173 and :4173). The client ID is in the Actions variable `GOOGLE_CLIENT_ID` and in the local, git-ignored `.env.local`. The app is published but not yet brand-verified, so users see Google's "unverified app" screen until Branding and Verification Center are done (free for these scopes). The Drive API has no per-call cost to the owner; data counts against each user's own Drive.
- GA4 ID not supplied yet (Actions variable `GA_ID`).
- Built 2026-10-07 (v0.3.0): 👎 👍 ❤️ ratings, poster ＋/👎 with Undo, Library Loved/Not for me tabs, list sort/filter/find, genre browse pages, person pages, World picks, language of the week, Tonight "Any language", row arrows, batched Drive sync.
- Built 2026-10-03: Home page, TV episode tracking, custom titles, Markdown import/export, Drive sync options, search links, TMDB caching. "Now on your services" is an in-app Home row only (no notifications).
- Not built: image share cards, Tamil/Hindi UI, YouTube sync, more regions.

## Backlog (build only when the owner asks)
1. ~~Markdown import/export~~: built (`/import`, `src/lib/markdown.ts`).
2. **MCP interface** so a local AI agent (PC/Mac only) can work with the app in that machine's browser. A web page can't host MCP itself; it needs a localhost bridge process or an extension. Opt-in, localhost-only.
3. ~~Custom titles~~: built (`src/lib/custom.ts`, `CustomTitleView`).
4. **Daily/weekend recommendation notifications.** There's no backend, so no web push. Use in-app reminders, the service-worker Notification API and Periodic Background Sync (installed Chrome PWA), and be clear about the limits.
