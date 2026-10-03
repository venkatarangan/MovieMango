# MovieMango architecture

A static, browser-only PWA. There is no MovieMango server: the browser talks directly to TMDB, Wikipedia/Wikidata, WordPress.com (Mangoidiots), Google (Drive, Gemini) and Hugging Face (Qwen weights).

```
            ┌──────────────── Browser (watch.mangoidiots.com) ────────────────┐
            │  React + MUI pages ── TanStack Query ── api/* (polite fetch)    │
            │        │                                   │ cache (IndexedDB)  │
            │  reco/tonight ── ai/engine ── Nano | Qwen(WebGPU) | Gemini REST │
            │        │                                                        │
            │  db/ (Dexie: items, lists, kv, cache) ── sync/ ── Google Drive  │
            └─────────────────────────────────────────────────────────────────┘
   TMDB (+JustWatch)   Wikipedia/Wikidata   WordPress.com 974561   Google APIs   Hugging Face
```

## Source layout

| Folder | Responsibility |
|---|---|
| `src/api/` | `http.ts`: per-host pacing, retries on 429/5xx, IndexedDB-backed cache with TTL and in-flight de-duplication. `tmdb.ts`, `wiki.ts`, `mangoidiots.ts`: typed clients |
| `src/ai/` | `nano.ts` (Chrome Prompt API), `qwen.ts` (WebLLM, lazy-loaded ~6 MB chunk), `gemini.ts` (REST with the user's key), `engine.ts` (detection and choice), `tasks.ts` (prompts plus zod-validated JSON) |
| `src/reco/` | `moods.ts` (inputs, mood→genre table, certificates), `profile.ts` (taste profile), `score.ts` (pure scoring), `tonight.ts` (the pipeline) |
| `src/db/` | Dexie schema, settings (with the synced subset and change listeners), list/item operations |
| `src/sync/` | `google.ts` (GIS token flow), `drive.ts` (appDataFolder file I/O), `merge.ts` (pure merge), `sync.ts` (state, triggers, connect/reconnect) |
| `src/lib/` | OTT provider catalogue (India), languages and locale detection, text export, share/download, JSON backup, analytics |
| `src/components/`, `src/pages/` | UI. Pages other than Tonight are lazy-loaded |

## Data model (IndexedDB `moviemango`)

| Table | Key | Contents |
|---|---|---|
| `items` | `movie:123` / `tv:456` | A title snapshot (title, year, poster, genres, runtime, language, votes, keywords, people) plus `lists[]`, mango `rating`, `feedback: 'never'`, `notTonightUntil`, timestamps |
| `lists` | `l_…` | Custom lists (max 50 active); soft-deleted with `deleted: true` for sync |
| `kv` | `settings` | Settings, including `settingsUpdatedAt` for cross-device merging |
| `cache` | request key | API responses with expiry; pruned on start (expired rows, then the oldest beyond 4,000) |

## Tonight pipeline (`reco/tonight.ts`)

1. **Free text (AI only):** parsed into minutes, mood, want, audience, type, languages and things to avoid; these override the chips.
2. **Providers:** the TMDB provider catalogue for India is matched by name to the 10 supported services (IDs change after mergers, so known IDs are kept as fallbacks).
3. **Candidates:** TMDB `discover` (user's services and languages, `flatrate|free|ads`, runtime limit, mood genres, certificate for movies), "acclaimed" discover, serendipity pages for "Surprise me", recommendations seeded from the strongest favourites, and the watchlist. "Rewatch" uses favourites and Ripe/Delicious titles only.
4. **Filter:** drops "never", "not tonight" (7 days), already watched (unless rewatching), other languages (unless surprise) and avoided genres.
5. **Score:** `0.45 taste + 0.25 mood + 0.15 time + 0.10 quality + 0.05 freshness` plus bonuses (watchlist +0.12, recommended +0.08, multiple sources).
6. **Enrich the top 28** (details, cached for 3 days), then require availability on the user's services, a runtime that fits and an allowed certificate.
7. **Mangoidiots** (if enabled): look up reviews for the top 14 (5-second cap). Delicious +0.08, Ripe +0.05, Rotten −0.08.
8. **AI re-rank:** viewer profile, context (day, time, mood, optional news tone) and the 14 numbered candidates go to the model, which returns `{picks:[{n, why}]}`. Only valid candidate numbers are kept. If AI fails, the scored order is used with template reasons.

## AI engines (`ai/engine.ts`)

- **Auto:** Gemini Nano if `available`, else Qwen if its weights are cached, else Gemini if a key is saved. Downloads (Nano, Qwen) only start from a user tap. With nothing ready, the UI offers: add a key, download Qwen, or Basic.
- **Explicit choice:** used if ready, otherwise the UI says what's needed.
- **Basic:** only when the user chooses it.
- All engines return JSON: `responseConstraint` (Nano), `response_format` with a schema and thinking off (Qwen3), `responseJsonSchema` with a plain-JSON fallback (Gemini). Output passes through `extractJson` and zod.

## Google Drive sync (`sync/`)

- GIS token client; scopes `drive.appdata openid email`. Popups open only from user actions. Tokens (~1 h) are kept in `sessionStorage` for the tab.
- One file, `moviemango-sync.json`, in `appDataFolder`, holding items, lists, synced settings and `settingsUpdatedAt`.
- `mergePayloads`: newest-wins per title and per list; the settings block comes from the side changed last, but an empty API key never replaces a saved one.
- Triggers: Dexie table hooks and settings saves (debounced 15 s), tab hidden, app start with a valid token, Sync now. A 401 → status `needs-auth` → the header shows **Reconnect Drive**.

## Caching and politeness

| Source | Min gap per request | Cache TTL |
|---|---|---|
| TMDB | 60 ms | search 1 h, discover 12 h, details 3 d, provider catalogue 7 d, trending 6 h |
| Wikipedia / Wikidata | 200 ms | summaries 7 d, news 3 h |
| WordPress.com (Mangoidiots) | 250 ms | review lookups 7 d (including "no review"), posts 1 d, shelf 6 h |
| Gemini | 1 s | not cached |

TMDB poster images are cached by the service worker (CacheFirst, 600 entries, 30 days). The WebLLM engine chunk is cached on first use, not precached.

## Privacy-relevant choices

- Fonts are self-hosted (no Google Fonts requests).
- Analytics are left out of the build entirely without `VITE_GA_ID`. With it: consent mode with ads denied, page paths with IDs stripped, feature events only, and an opt-out in Settings.
- Backup files exclude API keys. The Drive copy includes them so a new device can skip setup; the Privacy page says so.
- Review HTML from WordPress is sanitised with DOMPurify before rendering.
