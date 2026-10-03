<p align="center">
  <img src="branding/moviemango-logo.svg" alt="MovieMango logo" width="140" />
</p>

<h1 align="center">MovieMango</h1>
<p align="center"><b>Ripe picks for your mood and your moment.</b><br/>🔒 Private · 💸 Free · 🔓 Open</p>

MovieMango is a personal movie and TV helper. Tell it how much time you have, how you feel and how you want to feel, and your AI movie buff picks what to watch from what's streaming on **your** services in India, in **your** languages. It explains each pick, and Play opens the title on Netflix, Prime Video, JioHotstar and others.

Live at **https://watch.mangoidiots.com** (once deployed).

## Private, free and open

- **Private.** Your lists, ratings, taste portrait and keys live only in your browser (IndexedDB). There is no MovieMango server and no account with us. On-device AI (Gemini Nano, Qwen) never sends your prompts anywhere.
- **Free.** No ads, no subscriptions. You bring your own free TMDB key, and optionally a free Google AI Studio key.
- **Open.** MIT-licensed. Fork it, audit it, improve it.

## Why I built this

> _[Placeholder: the author's note on why MovieMango exists will go here.]_

## Features

- **Tonight**: pick time available, current mood, the feeling you want, discovery mode (new / rewatch / surprise), audience (solo, partner, family, kids) and movie or series. Or just type what you're after.
- **AI movie buff** with four engines, chosen automatically or by you:
  1. **Gemini Nano** via Chrome's built-in Prompt API (desktop Chrome 148+; on-device)
  2. **Qwen3** on WebGPU via [WebLLM](https://github.com/mlc-ai/web-llm), downloaded once from Hugging Face (on-device; works on phones with WebGPU)
  3. **Gemini** via the user's own Google AI Studio key (cloud)
  4. **Basic**: no AI, used only when the user chooses it

  The AI only re-ranks real TMDB candidates and writes a one-line "why"; it can't invent titles.
- **Where to watch in India**: subscription, free and ad-supported offers (no rent/buy) on the top 10 services, with Play buttons that open the service's site or app.
- **Mangoidiots reviews**: the Mangoidiots mango rating (Rotten / Raw / Ripe / Delicious), the review summary, an optional AI summary, and the full review in an in-app reader, plus a reviews shelf.
- **Lists**: Favourites, Watchlist, Watched, plus up to 50 custom lists. Rate titles on the mango scale.
- **Taste portrait**: a short, editable description of your taste that steers every pick.
- **Share and export**: any title or list as text, through the share sheet on phones or as a `.txt` download elsewhere. Full JSON backup and restore.
- **60-second setup**: detects India from the time zone and languages from the browser, then lets you tap 10 titles you love.
- Installable PWA, light and dark themes, works offline for your lists.

## Getting a TMDB key

MovieMango needs a free key from The Movie Database. The app walks you through it; in short:

1. Create a free account at [themoviedb.org/signup](https://www.themoviedb.org/signup) and confirm your email.
2. Open [Settings → API](https://www.themoviedb.org/settings/api), choose **Create** / **Request an API key**, then **Developer**, and accept the terms.
3. Fill in the form: type of use **Personal**, application name **MovieMango (personal use)**, URL **https://watch.mangoidiots.com**, and a one-line summary.
4. Copy the **API Read Access Token** (or the shorter API Key) and paste it into MovieMango.

## Getting a Google AI Studio key (optional)

Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in, choose **Create API key**, and paste it into **Settings → AI movie buff**. The free tier needs no credit card. On the free tier, Google may use prompts to improve its products.

## Run it locally

Requires Node.js 22+.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npx playwright install chromium && npm run e2e   # browser smoke tests with mocked APIs
npm run build        # production build in dist/
```

Gemini Nano and WebGPU need a secure context; `localhost` counts.

### Configuration

Copy `.env.example` to `.env.local`. Every value is public (it ships to the browser):

| Variable | Purpose |
|---|---|
| `VITE_GA_ID` | Google Analytics 4 measurement ID. **Leave empty to build with no analytics at all.** |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for Drive backup (coming in a later version). |

Analytics, when enabled, sends only page views (with IDs stripped) and feature names. It never sends titles, lists, moods, ratings or keys, ad features are off, and users can opt out in Settings. To remove analytics from your fork, leave `VITE_GA_ID` empty, or delete `src/lib/analytics.ts` and its imports.

## Deploy (GitHub Pages + watch.mangoidiots.com)

1. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds and publishes to GitHub Pages.
2. In the repo: **Settings → Pages → Source: GitHub Actions**. Add Actions variables `GA_ID` (and later `GOOGLE_CLIENT_ID`).
3. `public/CNAME` contains `watch.mangoidiots.com`. In Cloudflare DNS add `CNAME watch → <github-user>.github.io` set to **DNS only** (grey cloud), and make sure the `mangoidiots.com → venkatarangan.com` redirect rule doesn't match the `watch.` subdomain. Then enable **Enforce HTTPS** in GitHub Pages.

## Project structure

```
src/
  api/        TMDB, Wikipedia/Wikidata, Mangoidiots (WordPress.com) clients; polite fetch + cache
  ai/         engines (Gemini Nano, Qwen/WebLLM, Gemini REST), engine choice, prompts/tasks
  reco/       taste profile, scoring, moods, and the Tonight pipeline
  db/         Dexie (IndexedDB) tables, settings, list operations
  lib/        providers (India OTT), languages, text export, share, backup, analytics
  components/ UI building blocks
  pages/      Tonight, Search, Title, Library, Reviews, Settings, About, Privacy, Welcome
branding/     logo sources and generator (python3 logo.py)
tests/        unit tests;  e2e/  Playwright smoke tests with mocked APIs
```

## How recommendations work

1. **Candidates** come from TMDB: discover filtered to your services in India (subscription, free or ads), your languages, the runtime that fits and the genres for your mood; recommendations seeded from your favourites; and your watchlist.
2. **Scoring**: `taste 0.45 + mood 0.25 + time 0.15 + quality 0.10 + freshness 0.05`, plus small bonuses (watchlist, "because you loved…", Mangoidiots Ripe/Delicious). See `src/reco/score.ts`.
3. **Checks**: the top titles are verified for where to watch, runtime and certification (Kids: U; Family: U/UA, unless "Show all ratings" is on).
4. **AI**: the best 14 go to the AI, which picks 6 and writes the reasons. If the AI fails, the ranked list is used, so you always get picks.

## Acknowledgements

- <img src="public/tmdb-logo.svg" alt="TMDB" height="12" /> This product uses the TMDB API but is not endorsed or certified by TMDB. Titles, posters, credits and ratings come from [The Movie Database (TMDB)](https://www.themoviedb.org/).
- Streaming availability (where to watch in India) is provided by [JustWatch](https://www.justwatch.com/in), via TMDB.
- Reviews and mango ratings by [Mangoidiots](https://mangoidiots.com) (mangoidiots.com), © Venkatarangan Thirumalai.
- Summaries from [Wikipedia](https://www.wikipedia.org/) (CC BY-SA 4.0); identifiers from [Wikidata](https://www.wikidata.org/) (CC0).
- AI: Gemini Nano and the Gemini API by Google; Qwen by the Alibaba Qwen team (Apache-2.0), run with [WebLLM](https://github.com/mlc-ai/web-llm) from [Hugging Face](https://huggingface.co/mlc-ai).
- Built with React, Material UI, Dexie, TanStack Query, Vite and Workbox.

## License

[MIT](LICENSE). Data and reviews remain under their owners' terms (see Acknowledgements).
