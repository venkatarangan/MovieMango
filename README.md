<p align="center"><img src="branding/moviemango-logo.svg" alt="MovieMango" width="120" /></p>

<h1 align="center">MovieMango</h1>
<p align="center"><b>Ripe picks for your mood and your moment.</b><br/>🔒 Private · 💸 Free · 🔓 Open</p>
<p align="center"><a href="https://watch.mangoidiots.com"><b>watch.mangoidiots.com</b></a></p>

MovieMango is a personal movie and TV companion. Tell it how much time you have and how you feel, and your AI movie buff picks something streaming on **your** services in India, in **your** languages, and tells you why. Tap Play to open it on Netflix, Prime Video, JioHotstar and more.

## Why I built this

I love movies, and not just Indian and Hollywood ones; some of my favourites come from all over the world. For years, my watched list and watchlist were scattered across Google, IMDb, YouTube, JustWatch and Plex, and I kept exporting and importing between them. I didn't want my movie life locked inside OTT apps or big tech, or to pay a subscription just to keep a list in the cloud. I'd meant to build this for years; with Claude's help, I finally did. Now I have one place to track what's good and discover what's next, and my data stays mine, ready for my own AI assistant to work with.

— Venkatarangan Thirumalai, [Mangoidiots](https://mangoidiots.com)

## What you can do

- **Home**: search first, then three "Feeling lucky?" picks, what to continue watching, watchlist titles now on your services, and fresh movie and TV ideas.
- **Tonight**: choose your time, mood and company and get a few picks, each with a reason. Or just type what you want.
- **Where to watch**: subscription and free options on India's top 10 services.
- **Lists**: Favourites, Watchlist, Watched and up to 50 of your own. Rate titles Rotten, Raw, Ripe or Delicious.
- **Mangoidiots reviews**: read the review and rating inside the app.
- **TV progress**: tick episodes or whole seasons and see what's next.
- **Your own titles**: add films and shows that aren't on TMDB, like old TV serials or home videos.
- **Share and import**: send a title or a list as text, export lists as Markdown, and import lists from Markdown, IMDb or Letterboxd (with an AI prompt for other apps).
- **Your data, your Drive**: sign in with Google to back up and sync between devices, automatically or only when you tap.
- **Search links**: `watch.mangoidiots.com/?q=dune` opens a search, and browsers can add MovieMango as a search engine.

## Getting started

1. Open [watch.mangoidiots.com](https://watch.mangoidiots.com). On a phone, use "Add to Home screen".
2. Sign in with Google (optional, for backup and sync).
3. Get a free TMDB key. The app shows you how, step by step.
4. Pick your languages and services, and tap 10 titles you love.
5. Choose an AI: Gemini Nano (built into desktop Chrome), Qwen (runs on your device), your own free Google AI key, or no AI.

## Privacy

There's no MovieMango server. Your lists, ratings and keys live in your browser and, if you connect it, a hidden app folder in your own Google Drive that MovieMango alone can use. On-device AI never sends your prompts anywhere. The public site counts anonymous page views (never your titles or lists); you can turn that off in Settings. [Full privacy note](https://watch.mangoidiots.com/privacy.html).

## For developers

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests
npm run e2e      # browser tests, all APIs mocked (run `npx playwright install chromium` first)
```

React + TypeScript + MUI, Vite, Dexie (IndexedDB), WebLLM. No backend. Optional `.env.local` settings: `VITE_GOOGLE_CLIENT_ID` (Drive sign-in) and `VITE_GA_ID` (analytics; leave it empty for none). See [docs/testing-locally.md](docs/testing-locally.md) and [docs/architecture.md](docs/architecture.md). Pushing to `main` deploys to GitHub Pages.

## Credits

<img src="public/tmdb-logo.svg" alt="TMDB" height="12" /> This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by [JustWatch](https://www.justwatch.com/in). Reviews by [Mangoidiots](https://mangoidiots.com). Summaries from [Wikipedia](https://www.wikipedia.org/) (CC BY-SA). AI by Google Gemini and the Qwen team via [WebLLM](https://github.com/mlc-ai/web-llm).

## License

[MIT](LICENSE)
