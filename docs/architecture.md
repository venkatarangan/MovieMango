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
- **Custom titles** (not in TMDB) are normal items with a **negative `tmdbId`** and a `custom` block (`src/lib/types.ts`, `isCustom()`). Never send a negative id to TMDB: Tonight skips them as seeds and candidates; `/title/:type/-id` renders `CustomTitleView`. Delete = empty lists (a tombstone, so sync doesn't restore it).
- **Markdown import/export** (`src/lib/markdown.ts`): headings name lists, bullets are titles, `- Title (2019) · movie|tv · rating: ripe · tmdb: 123` (also `imdb:`, `custom`, `url:`, `> description`). The parser also takes numbered lists, tables and IMDb/Letterboxd CSVs. `/import` matches rows on TMDB (`src/lib/importMatch.ts`), the user reviews, then `applyImport` adds (never removes).
- **Privacy:** fonts are self-hosted; analytics are built in only when `VITE_GA_ID` is set; review HTML is sanitised.
