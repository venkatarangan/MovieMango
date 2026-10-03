# Architecture

A static PWA with no backend. The browser talks directly to TMDB, Wikipedia, WordPress.com (Mangoidiots), Google (Drive, Gemini) and Hugging Face (Qwen weights).

| Folder | What's there |
|---|---|
| `src/api` | TMDB, Wikipedia and Mangoidiots clients; rate-limited fetch with an IndexedDB cache |
| `src/ai` | Engines (Gemini Nano, Qwen/WebLLM, Gemini REST), automatic engine choice, prompts |
| `src/reco` | Taste profile, scoring, the Tonight pipeline, Home shelves (`home.ts`) |
| `src/db` | Dexie tables (items, lists, kv settings, cache, titles) |
| `src/sync` | Google sign-in, the Drive app-folder file, merging |
| `src/lib` | India OTT catalogue, languages, export/share, analytics |
| `src/pages`, `src/components` | UI |

**Key decisions**
- **AI never invents titles.** TMDB supplies real candidates (filtered by the user's services, languages, runtime and certificate) and a scoring formula ranks them; the model only re-ranks and explains. If AI fails, the scored list is shown.
- **Engine order:** Nano → Qwen (if downloaded) → Gemini (if a key is saved). Downloads only start when the user taps; Basic mode only when the user picks it.
- **Sync:** one JSON file in Drive's `appDataFolder`, newest-wins per record. Tokens last about an hour, then the header shows "Reconnect Drive". Per-device options: `driveAutoSync` (off = only "Sync now"; pending changes turn the cloud icon orange) and `driveSyncKeys` (off = keys stripped from both sides before merging, so they leave the Drive file).
- **Home** (`/`, `src/pages/Home.tsx`, `src/reco/home.ts`): search with suggestions; "Feeling lucky" = `planTonight` with no engine, time-of-day defaults and a 12-title shortlist, cached for the session; Continue watching (`useShowsInProgress`); watchlist titles on the user's services (provider history in kv `streamSeen`, "New" for 7 days); random movie/TV shelves from one of 6 discover pages per type. Tonight moved to `/tonight`.
- **Search links:** `main.tsx` rewrites `/?q=…` to `#/search?q=…`. `public/opensearch.xml` uses the hash form so the term stays in the browser.
- **TMDB caching** (`src/api/http.ts`, `src/api/recent.ts`, `src/api/tmdb.ts`): call TMDB as little as possible.
  - Read path: session `Map` (500 entries) → Dexie `cache` → network. Concurrent identical requests share one fetch. Params are normalised (sorted keys, sorted `|`/`,` id lists, empty dropped) so equivalent requests share a row.
  - Expired rows are returned instead of an error when offline, on 429/5xx or network failure (then no retry for 2 min). `pruneCache` keeps expired rows 30 days for this, cap 4000.
  - TTL / stale-while-revalidate window: search 1h / none; trending 6h / 1d; discover 12h / 3d; recommendations 7d / 30d; provider catalogue 7d / 60d; season 1d (30d once its last episode is 60+ days old).
  - Details live in the Dexie `titles` table (schema v2), not `cache`: last 100 titles, LRU by `accessedAt`. Core data fresh 30d (7d for running TV, unreleased or <120-day-old movies). Watch providers older than 2d are refreshed in the background via `/{type}/{id}/watch/providers`, old copy served meanwhile. Page 1 of `getRecommendations` comes from stored details. `peekDetails` (no network) and `getWatchProviders` read the same store.
  - `db.cache.clear()` (Settings → Clear cache) also clears memory and `titles` (Dexie middleware in `src/db/index.ts`).
  - Dev builds count requests in `window.__tmdbCalls` (`{ total, byPath }`) and log each with `console.debug`. `tests/tmdbCalls.test.ts` prints counts for a Tonight run.
- **Custom titles** (not in TMDB) are normal items with a **negative `tmdbId`** and a `custom` block (`src/lib/types.ts`, `isCustom()`). Never send a negative id to TMDB: Tonight skips them as seeds and candidates; `/title/:type/-id` renders `CustomTitleView`. Delete = empty lists (a tombstone, so sync doesn't restore it).
- **Markdown import/export** (`src/lib/markdown.ts`): headings name lists, bullets are titles, `- Title (2019) · movie|tv · rating: ripe · tmdb: 123` (also `imdb:`, `custom`, `url:`, `> description`). The parser also takes numbered lists, tables and IMDb/Letterboxd CSVs. `/import` matches rows on TMDB (`src/lib/importMatch.ts`), the user reviews, then `applyImport` adds (never removes).
- **Episodes:** TV progress lives on the item (`episodesSeen` per season, cached `nextEpisode`), so it syncs like any item change. Logic in `src/lib/episodes.ts`; Specials (season 0) don't count; unaired episodes are capped by `last_episode_to_air`. Season lists load only when expanded.
- **Privacy:** fonts are self-hosted; analytics are built in only when `VITE_GA_ID` is set; review HTML is sanitised.
