# Architecture

A static PWA with no backend. The browser talks directly to TMDB, Wikipedia, WordPress.com (Mangoidiots), Google (Drive, Gemini) and Hugging Face (Qwen weights).

| Folder | What's there |
|---|---|
| `src/api` | TMDB, Wikipedia and Mangoidiots clients; rate-limited fetch with an IndexedDB cache |
| `src/ai` | Engines (Gemini Nano, Qwen/WebLLM, Gemini REST), automatic engine choice, prompts |
| `src/reco` | Taste profile, scoring, and the Tonight pipeline |
| `src/db` | Dexie tables (items, lists, settings, cache) |
| `src/sync` | Google sign-in, the Drive app-folder file, merging |
| `src/lib` | India OTT catalogue, languages, export/share, analytics |
| `src/pages`, `src/components` | UI |

**Key decisions**
- **AI never invents titles.** TMDB supplies real candidates (filtered by the user's services, languages, runtime and certificate) and a scoring formula ranks them; the model only re-ranks and explains. If AI fails, the scored list is shown.
- **Engine order:** Nano → Qwen (if downloaded) → Gemini (if a key is saved). Downloads only start when the user taps; Basic mode only when the user picks it.
- **Sync:** one JSON file in Drive's `appDataFolder`, newest-wins per record. Tokens last about an hour, then the header shows "Reconnect Drive".
- **TMDB caching** (`src/api/http.ts`, `src/api/recent.ts`, `src/api/tmdb.ts`): call TMDB as little as possible.
  - Read path: session `Map` (500 entries) → Dexie `cache` → network. Concurrent identical requests share one fetch. Params are normalised (sorted keys, sorted `|`/`,` id lists, empty dropped) so equivalent requests share a row.
  - Expired rows are returned instead of an error when offline, on 429/5xx or network failure (then no retry for 2 min). `pruneCache` keeps expired rows 30 days for this, cap 4000.
  - TTL / stale-while-revalidate window: search 1h / none; trending 6h / 1d; discover 12h / 3d; recommendations 7d / 30d; provider catalogue 7d / 60d; season 1d (30d once its last episode is 60+ days old).
  - Details live in the Dexie `titles` table (schema v2), not `cache`: last 100 titles, LRU by `accessedAt`. Core data fresh 30d (7d for running TV, unreleased or <120-day-old movies). Watch providers older than 2d are refreshed in the background via `/{type}/{id}/watch/providers`, old copy served meanwhile. Page 1 of `getRecommendations` comes from stored details. `peekDetails` (no network) and `getWatchProviders` read the same store.
  - `db.cache.clear()` (Settings → Clear cache) also clears memory and `titles` (Dexie middleware in `src/db/index.ts`).
  - Dev builds count requests in `window.__tmdbCalls` (`{ total, byPath }`) and log each with `console.debug`. `tests/tmdbCalls.test.ts` prints counts for a Tonight run.
- **Privacy:** fonts are self-hosted; analytics are built in only when `VITE_GA_ID` is set; review HTML is sanitised.
