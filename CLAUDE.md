# MovieMango: notes for AI coding sessions

Private, free, open movie/TV companion PWA. Live at https://watch.mangoidiots.com, repo github.com/venkatarangan/MovieMango (MIT). The owner is Venkatarangan Thirumalai (Mangoidiots).

## Commands
- `npm run dev` (port 5173) · `npm test` (Vitest) · `npm run e2e` (Playwright, all APIs mocked) · `npm run typecheck` · `npm run build`
- Run `npm test` and `npm run e2e` before committing UI or logic changes, and look at the screenshots in `test-results/screens/`.
- A push to `main` deploys (GitHub Actions → Pages). See `docs/operations.md`.

## Where things are
- Code map and key decisions: `docs/architecture.md`. Local testing: `docs/testing-locally.md`.
- **Session log:** `moviemango-plan.md` keeps every user prompt word for word, with a short response, round by round. Append a new round for each significant request, and update the Status line at the top.
- Branding: `branding/logo.py` regenerates all logo/icon files (copy them to `public/`).

## Product rules
- No backend, ever. User data lives in IndexedDB, plus the user's own Drive `appDataFolder` when connected.
- Users bring their own keys (TMDB required, Gemini optional). Never commit keys. `VITE_*` values are public.
- The AI only re-ranks real TMDB candidates; it must never invent titles. Basic (no AI) mode is used only when the user chooses it.
- Region is India only in v1. Show subscription, free and ads offers only, never rent/buy.
- Keep attribution: the TMDB notice ("uses the TMDB API but is not endorsed or certified by TMDB") with its logo, JustWatch for availability, Mangoidiots for reviews.

## Style
- End-user copy: short, friendly, explains what something does and why it's safe or free. Developer docs: terse; readers use AI agents.
- Match existing code style. MUI `sx` `borderRadius` numbers are multiplied by 16 px, so use pixel strings like `'12px'`.

## Gotchas
- Mangoidiots is WordPress.com site **974561** (mangoidiots.com redirects to venkatarangan.com). Rating tags: Rotten 1523, Raw 1524, Ripe 1525, Delicious 1527. Categories: movies 26, TV 232.
- TMDB provider IDs change after mergers (e.g. Hotstar → JioHotstar); `src/lib/providers.ts` matches by name.
- The WebLLM chunk (~6 MB) is lazy and excluded from the service-worker precache (`vite.config.ts`).
- Playwright runs with `timezoneId: Asia/Kolkata` so India is detected.
- The Chrome Prompt API has been stable for web pages since Chrome 148. Check fast-moving facts like this before stating limits.

## Open items
- Google OAuth client ID not created yet. Set the Actions variable `GOOGLE_CLIENT_ID`; see `docs/testing-locally.md`.
- GA4 ID not supplied yet (Actions variable `GA_ID`).
- Not built: TV episode tracking, "now on your services" alerts, image share cards, Tamil/Hindi UI, YouTube sync, more regions.
