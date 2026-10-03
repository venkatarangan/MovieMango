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
- **Privacy:** fonts are self-hosted; analytics are built in only when `VITE_GA_ID` is set; review HTML is sanitised.
