# MovieMango: Prompt and Design Response

*Date: 2026-10-03*

> **Status:** §1–6 design, §7–8 first build, §9–10 Drive sign-in, §11–12 local testing and docs, §13–14 publishing, §15–16 key-cost notes and infra check, §17–18 HTTPS. **Later rounds replace earlier ones where they differ.** Notes for future sessions: `CLAUDE.md`.

---

## 1. The prompt (verbatim)

> I wish to build a free and open source, personal app, a web app that runs from github pages. an app that is modern UX, material UI like, works on mobile and web. it is a personal movie and tv show helper for a user. all the data remains in the local browser and user created data periodically saved to users personal google drive after getting oauth connected. it allows me to search for movie or a tv show, provide me replies from free and open data sources like wikipedia, The Movie Database (TMDB) and other services through API seamlessly. we can cache the looked up data, but no need to store all the fetched data locally. the app should allow users to save their favourite movies & tv shows, save their watchlist, watched list. and allow them to create custom lists to a maximum of fifty in total. it should say if possible in which OTT service the movie is playing in India (to begin with only India in v1, it can be expanded for other countries later) - from Netflix, Amazon Prime Video India, Jio Hotstar (the first three are super important), Zee, Sony Liv, and a few other top services (no need to go beyond the top 10). It can list only those that are available for free and for subscription. where do we fetch this data in a free and open way. Do these OTT services themselves provide free API - if so use them with care and respect the speed and throttle restriction - we are in no way going to resell or use the data in any commercial way, this is only for that individual user, we can even ask the users to signin with their account on each ott services for us to fetch the data by search if there is a clean way to do that without affecting enduser account.
>
> The App can use AI to make recommendations based on the favourite and with what's on watchlist, based on a consolidated model of everything we know about the user, time of the day, day, top news and likely sentiment. the user can also express their preference - how much time they currently have to watch, what mood they are in, what mood they are looking, already watched show or tv, or something new, or something serendipidious and so on. Basically a personal movie recommender, a movie and tv show expert at the user's call. It can even launch the OTT service player directly in a new browser tap to play the videos or launch the installed local app if on mobile.
>
> For the AI the choices I am thinking:
> 1) The app uses Prompt API for local AI when available, downloading as needed, if none available or non prompt api supported browsers, then use "WebGPU with a small Gemma or Qwen model" as available. All fails, then tell the user the support is not available.
>
> 2) Say Gemini AI if you think we can use it in the free quota available and the app in that case can be deployed on Firebase, in which case we can ask each user to create and supply their own free firebase/google cloud account - will that work.

---

## 2. Response

### TL;DR

- **The plan works as a static site on GitHub Pages.** It doesn't need a backend or Firebase.
- **OTT availability for India:** use **TMDB's "watch providers" data**, which comes from JustWatch. It's free for non-commercial use and covers India, including Netflix, Prime Video, JioHotstar, ZEE5 and SonyLIV. For **direct "play" deep links**, you can add the **Streaming Availability API** (free tier: 100 requests/day) as an optional extra.
- **None of the OTT services offer a public API.** Signing in with the user's OTT accounts and scraping isn't a clean option either: it breaks their terms of service, can get the account flagged, and browsers block it anyway. **Don't do it.**
- **AI:** offer both of your options as a tiered fallback: **Chrome Prompt API (Gemini Nano) → WebGPU small model (Qwen/Gemma via WebLLM) → bring-your-own Gemini API key → "AI unavailable"**. The Gemini option **doesn't need Firebase.** The user pastes a free AI Studio API key, and the browser calls Gemini directly.
- **The most important design rule for AI:** don't let the model come up with titles. **TMDB generates the candidates, filtered to what's streamable in India. The LLM only re-ranks them and explains its picks.** This keeps small local models useful and stops them from making up movies.

---

### 2.1 Feasibility on GitHub Pages (static hosting)

| Need | Works statically? | How |
|---|---|---|
| Search and metadata | ✅ | TMDB, Wikipedia and TVmaze all allow browser calls (CORS) |
| Local data | ✅ | IndexedDB (via Dexie.js) |
| Google Drive backup | ✅ | Google Identity Services token flow in the browser, no server |
| OTT availability | ✅ | TMDB watch providers (+ optional Streaming Availability API) |
| Local AI | ✅ | Prompt API / WebGPU in the browser |
| Cloud AI | ✅ | Gemini API called from the browser with the user's own key |
| Offline / installable | ✅ | PWA (service worker + manifest) |

**API keys on a static site:** anything shipped in the JS bundle is public. For a personal open-source app, the clean approach is **BYOK (bring your own key)**. A Settings screen asks for the user's own TMDB key (free, takes 2 minutes), and optionally a Gemini key and a Streaming Availability key. Keys stay in that browser's IndexedDB and in the user's Drive backup. They never go in the repo. Each person who forks the repo also registers their own Google OAuth Client ID. The Client ID is public by design, so that's fine.

---

### 2.2 Data sources

| Source | What we use it for | Cost / limits | Notes |
|---|---|---|---|
| **TMDB API v3** | Search, details, cast, posters, trailers, `recommendations`, `similar`, `discover`, **watch providers per region** | Free, non-commercial; generous rate limit (~50 req/s per IP) | Requires the "This product uses the TMDB API but is not endorsed or certified by TMDB" attribution and logo |
| **JustWatch (via TMDB)** | OTT availability in India: `flatrate` (subscription), `free`, `ads`, `rent`, `buy` | Included with TMDB | **Must credit JustWatch** wherever provider data is shown. TMDB returns a JustWatch page link, not per-service deep links |
| **Wikipedia REST API** | Plot/background summary (`/page/summary/{title}`), and the **"In the news"** feed (`/feed/featured/{yyyy}/{mm}/{dd}`) for the news/sentiment signal | Free, CORS with `origin=*` | Send a descriptive `Api-User-Agent` header |
| **Wikidata** | Cross-IDs (IMDb ID, some platform IDs such as Netflix ID), awards, original language | Free SPARQL/REST | Useful for building deep links when available |
| **TVmaze** | Episode lists, air schedules for TV | Free, no key, CORS | Good companion to TMDB for TV |
| **OMDb** (optional) | IMDb rating, Rotten Tomatoes / Metacritic scores | Free key, 1,000/day | Not "open" data but free; BYOK |
| **Streaming Availability API** (optional) | **Deep links** into Netflix / Prime / Hotstar etc. for a title, India supported | Free tier 100 req/day via RapidAPI, BYOK | Call it only when the user taps "Play", and cache the result |

#### OTT services: do they have APIs?

- **Netflix:** closed its public API in 2014. No partner access for individuals.
- **Prime Video, JioHotstar, ZEE5, SonyLIV, Aha, Sun NXT, etc.:** no public catalogue APIs.
- **"Sign in with your OTT account and we'll search for you":** **not recommended, and not technically clean.**
  - A web page can't read another site's session: same-origin policy, CORS and third-party cookie blocking all prevent it.
  - The only way would be a browser extension that scrapes logged-in pages. That violates every one of these services' terms of service and could get the user's account flagged or locked. It would also break every time the sites change.
  - JustWatch already aggregates exactly this data, and TMDB passes it on legally. **So use TMDB.**

#### India v1 provider list (top 10, subscription + free only)

Resolve provider IDs **at runtime** from `GET /watch/providers/movie?watch_region=IN` (and `/tv`). Don't hard-code them, because IDs change after mergers like Disney+ Hotstar → JioHotstar. Configured allow-list, by display name:

1. Netflix ⭐
2. Amazon Prime Video ⭐
3. JioHotstar ⭐
4. ZEE5
5. SonyLIV
6. Aha
7. Sun NXT
8. Apple TV+
9. MX Player (free/ads)
10. YouTube (free) *or* Lionsgate Play / ManoramaMAX / Hoichoi, depending on what you watch

**Filter:** show only the monetisation types `flatrate`, `free` and `ads`. Hide `rent` and `buy`, as you asked.

**Discovery tip:** TMDB `discover` accepts `watch_region=IN&with_watch_providers=8|119|...&with_watch_monetization_types=flatrate|free|ads`. This means "what can I watch right now on my subscriptions" is a single API call.

#### Launching the player

| Platform | Approach |
|---|---|
| Desktop | Open the service's title URL in a new tab, e.g. `https://www.netflix.com/title/{id}` |
| Android / iOS | Use the same **https** URLs. Netflix, Prime Video and JioHotstar register App Links / Universal Links, so the **installed app opens automatically**. On Android, `intent://` URLs are a fallback |
| No deep link known | Fall back to the service's search URL with the title, or to the JustWatch link from TMDB |

The service-specific title IDs come from the Streaming Availability API (best) or Wikidata (partial).

---

### 2.3 Local data model and Google Drive sync

**IndexedDB stores (Dexie):**

- `userItems`: `{ tmdbId, mediaType, lists: ['favourite','watchlist','watched', <customListIds>], rating?, notes?, watchedOn?, updatedAt, deleted? }`
- `customLists`: `{ id, name, emoji/colour, order, updatedAt, deleted? }`. **Capped at 50.** Built-in lists (Favourites, Watchlist, Watched) don't count toward the cap. *(This is my interpretation: confirm.)*
- `preferences`: region, providers you subscribe to, languages, AI tier choice, API keys
- `cache`: API responses with a TTL (details 7 days, watch providers 24 hours, search 1 hour), and an LRU cap of about 20 MB. **Only items the user saved are kept permanently.** For those, store a small snapshot (title, year, poster path, genres, runtime) so lists still render offline.

**Drive sync:**

- **Scope: `drive.appdata`.** This is a hidden, app-private folder in the user's Drive. Google treats it as a non-sensitive scope, so the app doesn't need a security assessment, and the app can't see any of the user's other files.
- Use the Google Identity Services **token client** (browser-only, no backend). Access tokens last about 1 hour. Re-request them silently, or prompt the user, when a sync runs.
- Store one file, `moviemango-backup.json`. Sync is **debounced**: 30 seconds after a change, plus on app open and on tab hide.
- **Merging:** each record has its own `updatedAt`, with last-write-wins per record and tombstones (`deleted: true`) for removals. This keeps phone and laptop edits from overwriting each other.
- In OAuth consent screen "Testing" mode, up to 100 test users can sign in. That's plenty for personal use, and verification isn't needed.

---

### 2.4 AI recommender

#### Tiered engine (your option 1 + option 2 combined)

```
detect() →
  1. Chrome Prompt API (Gemini Nano)           — on-device, free, private
  2. WebGPU + small model via WebLLM           — on-device, one-time download
  3. Gemini API with user's own AI Studio key  — cloud, free tier
  4. "AI recommendations unavailable" + non-AI fallback (TMDB recommendations/similar)
```

The user can also **pin** a tier in Settings, for example "always use Gemini cloud" on a weak phone.

**Tier 1: Prompt API (`LanguageModel` global)**
- Chrome shipped it with Gemini Nano in Chrome 148 (May 2026). It's **stable for extensions**, but for **ordinary web pages it's still behind an origin trial** as of this writing. Full web stable is expected around late 2026 or early 2027.
- **Action:** register your `*.github.io` origin for the origin trial, and add the token as a `<meta http-equiv="origin-trial">` tag.
- The model download is about 4 GB the first time. Check `LanguageModel.availability()` first, show download progress, and let the user opt in.
- Microsoft Edge has an equivalent Prompt API backed by Phi-4-mini, behind flags. Use the same code path. Firefox and Safari: not available.

**Tier 2: WebGPU small model**
- **WebLLM (MLC)** is the most mature option. Good candidates: **Qwen3-1.7B** or **Qwen2.5-1.5B-Instruct** (~1–1.2 GB at q4), or **Gemma-2-2B-it / Gemma 3 1B**. Alternatives are Transformers.js v3 (WebGPU) and MediaPipe LLM Inference (Gemma 3n).
- Cache the weights in Cache Storage, so the download happens only once.
- Phones with less than 6 GB RAM may struggle. Default to the smallest model on mobile.

**Tier 3: Gemini, without Firebase**
- **You don't need Firebase, or a Firebase project per user.** Asking every user to set up Firebase/GCP would be heavy and confusing.
- Instead, the user creates a free key at **Google AI Studio** (no credit card), pastes it into Settings, and the app calls `generativelanguage.googleapis.com` from the browser.
- Free tier: **Flash / Flash-Lite models only** (Pro models left the free tier in April 2026). Expect roughly **15 requests/minute and low thousands per day**. Google doesn't publish a fixed table anymore, so check the live quota in AI Studio. A personal recommender uses maybe 5–20 calls a day, so this is ample.
- **Privacy caveat to show in the UI:** on the free tier, Google may use prompts to improve its products. Prompts will contain the user's taste profile, so be clear about that.
- Use **Firebase AI Logic** only if you later host a shared, multi-user instance where *you* pay. It's not needed for a personal app.

#### Recommendation pipeline (grounded, hallucination-resistant)

```
1. Build taste profile (local, deterministic)
   - genres/keywords/cast/directors/languages weighted from Favourites (×3),
     Watched with high rating (×2), Watchlist (×1), disliked (−)
   - typical runtime, decade, TV vs movie ratio

2. Gather context
   - time of day, weekday/weekend, (optional) local weather
   - "mood of the day": Wikipedia "In the news" headlines → LLM classifies tone
     (e.g. heavy news day → suggest lighter/comforting picks) — opt-in, light touch
   - user's explicit inputs: time available, current mood, desired mood,
     rewatch vs new vs serendipity, movie/TV/either, language, who's watching

3. Generate candidates (TMDB — real titles only)
   - /recommendations + /similar for top favourites
   - /discover filtered by: my subscribed providers in IN, runtime ≤ time available,
     genres mapped from mood, language, min vote count
   - serendipity: sample from adjacent genres / other languages / older decades
   - exclude Watched (unless rewatch mode)
   → ~40–60 candidates with compact metadata

4. LLM re-ranks + explains
   - prompt = profile summary + context + candidate list (id, title, year, genres,
     runtime, 1-line overview, provider)
   - output JSON (use responseConstraint / JSON schema): top 5–8 ids with a
     one-sentence "why you'll like this now" each
   - validate ids ∈ candidates; drop anything else

5. Present
   - cards with poster, provider chips, runtime, "▶ Play on Netflix" button,
     "Not tonight" / "Never" feedback that updates the profile
```

**Mood → genre mapping** is a small editable table, for example: *"tired, want comfort" → comedy, family, feel-good, short runtime*; *"want to think" → mystery, drama, documentary*. The LLM can adjust it, but the table makes the non-AI fallback work too.

**"Movie expert at my call":** add a chat panel that uses the same tier engine. Ground it with tool-style lookups: the app fetches TMDB/Wikipedia facts for the titles mentioned and injects them into the prompt, so the model answers from real data.

---

### 2.5 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast, static output, works well with GitHub Pages |
| UI | **React + MUI (Material UI)**, Material 3 theming, dark mode | Most mature Material component set, responsive |
| Routing | Hash router (or a 404.html redirect) | GitHub Pages has no SPA rewrites |
| State/data | TanStack Query (API cache) + Dexie (IndexedDB) | Query handles TTL/retry/throttle; Dexie handles persistence |
| PWA | vite-plugin-pwa (Workbox) | Installable on Android/iOS/desktop; offline lists |
| Auth/Drive | Google Identity Services + Drive REST v3 | No backend |
| AI | `LanguageModel` (Prompt API), `@mlc-ai/web-llm`, `@google/genai` | Three tiers behind one `AiEngine` interface |
| Deploy | GitHub Actions → GitHub Pages | Free |
| License | MIT or Apache-2.0 | Note the third-party data terms (TMDB/JustWatch attribution) in the README |

**Rate-limit politeness:** a single request queue per API with a token bucket (TMDB ≤ 20 req/s, Wikipedia ≤ 5 req/s, Streaming Availability only on Play tap), exponential backoff on 429 errors, and caching responses before calling again.

---

### 2.6 Suggested screens

1. **Home / Tonight:** "What should I watch?" prompt chips (time, mood, new/rewatch/surprise) → AI picks. Below that: "New on your services", plus your Watchlist shortcut.
2. **Search:** unified movie + TV search, filter "only on my services".
3. **Title detail:** poster, summary (TMDB + Wikipedia), cast, trailer, **"Where to watch in India"** chips (Subscription / Free) with ▶ Play, and add-to-list buttons.
4. **Library:** Favourites, Watchlist, Watched, and Custom Lists (max 50).
5. **Ask the expert:** chat.
6. **Settings:** my subscriptions, region (IN), API keys, AI tier and model download, Google Drive connect / sync now / restore, export/import JSON, attributions.

---

### 2.7 Roadmap

| Phase | Scope |
|---|---|
| **v0.1** | Vite/React/MUI shell, TMDB search + detail, India watch providers, lists in IndexedDB, PWA, GitHub Pages deploy |
| **v0.2** | Google Drive appdata sync + merge, export/import |
| **v0.3** | Non-AI recommender (profile + TMDB discover), mood/time filters |
| **v0.4** | AI tiers (Prompt API → WebLLM → Gemini BYOK), LLM re-rank + explanations |
| **v0.5** | Deep-link Play via Streaming Availability API, news/sentiment context, expert chat |
| **v1.0** | Polish, accessibility, multi-region groundwork (region becomes a setting) |

---

### 2.8 Risks and open questions

- **Prompt API on the open web** is still an origin trial. The origin-trial token has to be renewed, and the behaviour could change before it ships as stable.
- **TMDB/JustWatch India data** is good but not perfect, especially for regional catalogues on Aha and Sun NXT. Show "Data by JustWatch" and a "last checked" time.
- **Deep links** are best-effort: the free tier has 100 requests/day, and some services change URL formats.
- **News-based mood inference** can feel intrusive. Keep it opt-in and subtle.
- **To confirm:**
  1. Does "max fifty lists" mean 50 *custom* lists (my assumption), or 50 lists including the built-in ones?
  2. Which OTT services do you personally subscribe to? This will be the default "my services" filter.
  3. Languages to prioritise, e.g. Tamil, Hindi, English, Malayalam?
  4. App name: is "MovieMango" the working name?

---

### Sources

- [Google ships Chrome Prompt API embedding Gemini Nano (Chrome 148)](https://www.shopifreaks.com/google-ships-chrome-prompt-api-embedding-gemini-nano-despite-formal-opposition-from-mozilla-apple-microsoft-and-w3c/)
- [Chrome's Prompt API: extension-stable vs web origin trial](https://jwatte.com/blog/chrome-prompt-api-free-browser-llm.md)
- [Gemini Nano in the browser, Chrome 148](https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en)
- [Gemini API pricing changes, April 2026 (free tier Flash-only)](https://agentdeals.dev/gemini-api-pricing-changes)
- [Gemini API pricing in 2026](https://geotoolbox.ai/blog/gemini-api-pricing)
- [Streaming Availability API (GitHub)](https://github.com/movieofthenight/streaming-availability-api)
- [streaming-availability npm package](https://npmjs.org/package/streaming-availability)
- TMDB API docs: https://developer.themoviedb.org/docs
- Wikimedia REST API: https://api.wikimedia.org/wiki/Core_REST_API
- Google Drive appDataFolder: https://developers.google.com/drive/api/guides/appdata
- WebLLM: https://github.com/mlc-ai/web-llm

---

## 3. Follow-up prompt (verbatim)

> 1. Yes, 50 is over and above the 3 basic one. 2. by default keep them to netflix, amazon prime and hotstar, allow users to select more. 3. by default english, tamil and hindi, users can select more. 4. MovieMango will be the name for the project and repo. the logo can be made from combining mangoidiots logo (mangoidiots.com) and movie related ideas, keep it minimalist. 5. regarding ai, let us go with google gemini in pcs and mac when running from google chrome and where prompt api is available and in other cases let us ask the user for google ai studio key, make it configurable for the user to switch between the two when both are available. 6. the recommendation personalised and based on mood, time available, etc. is the core value of the app. 7. this will entirely be free and open source, so feel free to use the best libraries and frameworks including AGPL, no restrictions. 8. allow users to export as a text file the details of the movie or tv show they are seeing and the data in their lists to others using share cards in mobile and as a downloadable text file in other places. 9. do you have any other suggestions? 10. acknowledgement to tmbd, justwatch as appropriate in all docs, about. 11. give a nice byline for the app, highlight in the docs and about us the app is private, free and open. 12. i will give the google analytics tag later. 13. I will also supply why I wrote this app text later - for now leave a place holder. 14. we can go with github.

---

## 4. Response: decisions and updated design

### 4.1 Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Lists | Three built-in lists (**Favourites, Watchlist, Watched**) plus **up to 50 custom lists** |
| 2 | Default OTT services | **Netflix, Amazon Prime Video, JioHotstar**. The user can add more from the India top-10 list |
| 3 | Default languages | **English (`en`), Tamil (`ta`), Hindi (`hi`)**. The user can add more (`ml`, `te`, `kn`, `bn`, `mr`, `ko`, `ja`, `es`, …) |
| 4 | Name / repo | **MovieMango**. Repo `github.com/<you>/MovieMango` |
| 5 | AI | **On-device Gemini Nano** (Chrome Prompt API) where available. **Otherwise Gemini cloud with the user's own Google AI Studio key.** The user can switch when both are available. The WebGPU tier from §2.4 is **dropped for v1** |
| 6 | Core value | **Personalised recommendations by mood and time available.** These get the most design and test effort |
| 7 | License | Fully FOSS. **AGPL-3.0** is recommended for the repo (see 4.8). Any OSS library is allowed |
| 8 | Share / export | Text export of a title or a list. **Share sheet on mobile, `.txt` download elsewhere** |
| 10 | Attribution | TMDB and JustWatch, plus Wikipedia, in the README, About page, exports and wherever their data appears |
| 12 | Analytics | Google Analytics tag to be supplied later. There's a config slot, and it stays off until then |
| 13 | "Why I built this" | Placeholder in the README and About page |
| 14 | Hosting | GitHub repo + GitHub Pages + GitHub Actions |

### 4.2 Byline

**Primary:** **"MovieMango: Ripe picks for your mood and your moment."**
**Values line, shown with it everywhere:** **"Private. Free. Open."**

The byline nods to the Mangoidiots rating scale (Rotten / Raw / Ripe / Delicious) and states the core value: mood and time.

Alternates, if you want them:
- "What to watch, right now: picked for your mood."
- "Your pocket film buff. Private, free and open."

### 4.3 Logo (minimalist, from the Mangoidiots mango)

The Mangoidiots mark is a yellow mango (`#FED201`) with a green leaf (`#8CC63F`), navy glasses and a moustache (`#27323F`). I drafted two flat vector concepts in `branding/`:

| Concept | File | Idea | Best use |
|---|---|---|---|
| **A: "Cine-specs"** | `branding/concept-a-3d-glasses.svg` | The Mangoidiots mango wearing **red/cyan 3D movie glasses** | Main logo, About page, README, share cards |
| **B: "Play mango"** | `branding/concept-b-play.svg` | The glasses become a **play button**, and the moustache stays | App icon, favicon, PWA maskable icon (it reads better at 32 px) |

**Recommendation:** use them as a pair. **A** is the brand mark, and **B** is the app icon. Both are drafts made from geometric shapes (`branding/make.py` regenerates them). A designer pass, or another iteration together, will refine the curves. `branding/preview.png` shows both side by side with 32 px previews.

### 4.4 AI engine (revised)

```
On app start:
  nano = 'LanguageModel' in self && await LanguageModel.availability()
         // 'available' | 'downloadable' | 'downloading' | 'unavailable'
  key  = settings.geminiApiKey

  engines available:
    • On-device: Gemini Nano (Chrome desktop)   if nano !== 'unavailable'
    • Cloud: Gemini via your AI Studio key      if key present

  default: On-device if available, else Cloud.
  if neither: show a friendly card → "Add a free Google AI Studio key" (deep-link to
              aistudio.google.com/apikey, 3-step guide) — and still show non-AI picks.

  Settings → "AI engine": [ On-device (private, no key) | Cloud (faster, smarter) ]
  Home screen: small chip showing the active engine; tap to switch when both exist.
```

**Facts that shape this:**
- **Where Gemini Nano runs:** the Prompt API runs in **Chrome on desktop only**: Windows, macOS, Linux and Chromebook Plus. It doesn't run in Chrome on Android, on iOS, or in other browsers. Chrome also needs enough free disk space for the ~4 GB model, plus a capable GPU or enough RAM. So in practice, **phones will use the cloud key.**
- **The origin trial is still needed for websites** as of Chrome 148. Register the GitHub Pages origin (or a custom domain, see 4.7) and ship the token in a `<meta>` tag. Renew it when Chrome asks. When the API goes fully stable, delete the tag.
- **First-run download:** use `LanguageModel.create({ monitor })` to show download progress. Explain that the download happens once and then works offline.
- **Cloud:** call the `@google/genai` SDK straight from the browser. Let the user pick the model, with a Flash-Lite / Flash default fetched from `models.list`, and don't hard-code version strings. Show the note: *"On Google's free tier, prompts may be used to improve Google's products."*
- **Both engines use the same JSON schema.** The Prompt API uses `responseConstraint`; Gemini uses `responseSchema`. The output is validated with `zod`, and only IDs from the TMDB candidate list are accepted (see §2.4).

### 4.5 The core recommender: "Tonight" flow

Recommendations are the core value, so **they must work well even with no AI available.** AI improves the ranking and adds explanations, but it isn't required.

**Inputs (3 taps, with smart defaults):**

| Input | Options | Default |
|---|---|---|
| Time I have | 30 min · 1 hr · 2 hr · 3 hr+ · "a series to binge" | Guessed from the time of day and day of week |
| Mood now | Tired · Stressed · Happy · Bored · Sad · Curious | (none) |
| Want to feel | Laugh · Cry · Thrill · Think · Comfort · Wow | Mapped from "mood now" |
| Discovery | Rewatch a favourite · Something new · Surprise me | Something new |
| With | Solo · Partner · Family · Kids | Solo |
| Type | Movie · Series · Either | Either |

**Pipeline:** taste profile → TMDB candidates (filtered to *your* services in India, *your* languages, runtime ≤ time available, certification for "With") → **deterministic score** → (optional) **LLM re-rank + one-line "why"** → 5 picks + 1 "wild card".

**Deterministic score:** `taste_similarity × 0.45 + mood_fit × 0.25 + time_fit × 0.15 + quality (vote avg, weighted by count) × 0.10 + freshness/serendipity × 0.05`. Make the weights tunable in a debug panel.

**Learning:** "Not tonight" lowers a title temporarily, and "Never" hides it. After a title moves to Watched, a quick **mango rating** prompt updates the profile.

**Test harness:** keep a small set of fixture personas, for example "Tamil thriller fan, 45 min, tired", and snapshot their top picks. That way, changes to the weights or prompts can be judged by what they change.

### 4.6 Share and export

**What can be exported:**
1. **A single title**, from the title page
2. **A single list**: Favourites, Watchlist, Watched or any custom list
3. **Everything**, as human-readable text. (The full JSON backup/restore in Settings is a separate feature.)

**How:**

| Context | Behaviour |
|---|---|
| Mobile (Web Share API available) | `navigator.share({ title, text, url })`. If `navigator.canShare({ files })`, also attach `MovieMango-<name>.txt`. **Optional share card:** a PNG image with the poster, title, year, runtime, "Where to watch in India" chips, your mango rating and the MovieMango logo, rendered on the device with `html-to-image`. It goes out through the same share sheet to WhatsApp, Instagram and so on |
| Desktop / no Web Share | **Download `.txt`** (Blob + `<a download>`), plus a **Copy to clipboard** button |

**Text format (title):**
```
🎬 Jailer (2023) · Movie · 2h 48m · Tamil
Action, Comedy, Thriller · TMDB 7.0/10 · My rating: Ripe 🥭
Director: Nelson Dilipkumar · Cast: Rajinikanth, Mohanlal, Shiva Rajkumar

A retired jailer goes on a manhunt to find his son's killers...

Where to watch (India): Netflix (subscription), Sun NXT (subscription)
More: https://www.themoviedb.org/movie/<id>

Shared from MovieMango: ripe picks for your mood and your moment.
Data: TMDB (not endorsed or certified by TMDB) · Streaming availability: JustWatch
```

**Text format (list):** a header with the list name, count and date, then one line per title: `1. Title (Year) · Type · Runtime · Where to watch · My rating`. The same credit footer goes at the end.

### 4.7 Hosting on GitHub

- **Repo:** `MovieMango`. **Pages:** `https://<you>.github.io/MovieMango/`, deployed from GitHub Actions on every push to `main`.
- **Optional custom domain:** `moviemango.mangoidiots.com`, set up with a CNAME. It ties in your brand and gives the app a clean origin for the Prompt API origin trial and Google OAuth. **Decide this before registering the origin trial and OAuth client,** because both are tied to the origin.
- **Config without secrets:** set the OAuth Client ID, origin-trial token and Google Analytics ID through `VITE_*` build variables in GitHub Actions. All three are public values. The user's own API keys stay on the user's device.

### 4.8 License

The decision is **AGPL-3.0** for MovieMango itself. It guarantees that anyone who hosts a modified MovieMango has to publish their source too, which fits "free and open". All the libraries suggested here (MIT/Apache/BSD) can be used in an AGPL project. If you'd rather make reuse as easy as possible, MIT is the alternative. It's your call, and it can be changed early on with no cost.

### 4.9 Attribution: where and what

| Place | TMDB | JustWatch | Wikipedia |
|---|---|---|---|
| **About page** | TMDB logo + "This product uses the TMDB API but is not endorsed or certified by TMDB." + link | "Streaming availability data provided by JustWatch." + link | "Summaries from Wikipedia, CC BY-SA 4.0." |
| **Title page** | Small TMDB credit in the footer | "Data by JustWatch" under the "Where to watch" chips | "From Wikipedia" link under the summary |
| **README / docs** | Same as the About page | Same | Same |
| **Exports / share cards** | Credit line | Credit line | (only if a Wikipedia summary is included) |

The TMDB logo must be less prominent than the MovieMango logo, which is a TMDB rule. Gemini and Google Drive are credited as services the app uses on the About and Privacy pages.

### 4.10 About page and README structure

```
MovieMango
Ripe picks for your mood and your moment.
🔒 Private · 💸 Free · 🔓 Open

Private — Your lists, ratings and taste profile live only in your browser and,
          if you connect it, in a hidden app folder in *your own* Google Drive.
          No MovieMango server exists. On-device AI keeps prompts on your machine.
Free    — No ads, no subscriptions, no accounts with us. Ever.
Open    — Source code on GitHub under AGPL-3.0. Fork it, audit it, improve it.

Why I built this
  [PLACEHOLDER — author to supply]

How it works · Your data & privacy · AI engines · Acknowledgements (TMDB, JustWatch,
Wikipedia, Google Gemini) · License · Source code · Report an issue
```

### 4.11 Analytics vs "private": one thing to get right

Google Analytics on a page that promises "private" will be noticed. Here's how to keep the claim honest:
- **Off until you supply the tag.** After that, use Consent Mode with everything **denied by default**, and show a one-line opt-in banner.
- **Send only anonymous page views and feature events,** like "used Tonight" or "exported a list". **Never send titles, lists, moods, ratings or keys.**
- Word the claim carefully: *"Your data never leaves your device or your Drive. If you opt in, we count anonymous page views."*
- Alternative, if you'd rather skip GA: **GoatCounter**, which is open source, cookie-free and free for non-commercial use.

### 4.12 Other suggestions (#9)

In priority order:

1. **Mango ratings.** Your own rating scale for titles is **Rotten / Raw / Ripe / Delicious**, the Mangoidiots scale. It's on-brand, quick to tap, and feeds directly into the taste profile.
2. **"Now on your services" alerts.** When the app opens, recheck a few watchlist titles a day for provider changes. If a title becomes streamable on your services, badge it. This is one of the most useful things a watchlist can do.
3. **Mangoidiots review link.** mangoidiots.com runs on WordPress.com, so the title page can search its REST API. If you've reviewed the title, it shows "Read the Mangoidiots review".
4. **Cold start onboarding.** Pick your services and languages, then tap 10 titles you love from a poster grid. That gives you a good profile in 60 seconds. Later: import from IMDb or Letterboxd CSV exports.
5. **TV progress.** Track "next episode", and add "continue a series" as a "Tonight" option. TVmaze has free episode data for this.
6. **Watching with Family/Kids** uses TMDB's Indian certifications (U / UA / A) as a hard filter.
7. **Offline-first PWA.** Lists, cached title pages and the last set of recommendations all work without a network connection.
8. **UI in Tamil and Hindi later.** Set up `react-i18next` from day one so translating later is cheap.
9. **Known data gaps to show honestly:** TMDB/JustWatch doesn't reliably track dubbed audio languages, and regional catalogues on smaller services can lag.

### 4.13 Updated stack

| Area | Choice |
|---|---|
| App | Vite + React + TypeScript, **MUI** (Material 3 theme in mango yellow and navy, with dark mode) |
| Data | Dexie (IndexedDB), TanStack Query, `zod` |
| PWA | `vite-plugin-pwa` (Workbox) |
| AI | Chrome Prompt API (`LanguageModel`), `@google/genai` |
| Google | Google Identity Services token client + Drive v3 `appDataFolder` |
| Share | Web Share API, `html-to-image` for share cards |
| i18n | `react-i18next` |
| Quality | Vitest, Playwright (smoke test on mobile and desktop viewports), ESLint + Prettier |
| CI/CD | GitHub Actions → GitHub Pages |

### 4.14 Updated roadmap

| Phase | Scope |
|---|---|
| **v0.1** | Repo, CI/CD to Pages, app shell + theme + logo, TMDB search and title page, India "where to watch" (defaults: Netflix / Prime / JioHotstar), lists (3 + 50 custom), attribution, About page with placeholders |
| **v0.2** | Settings (services, languages, keys), share/export (text, share sheet, download), JSON backup/restore |
| **v0.3** | **"Tonight" recommender, non-AI version**: profile, mood/time inputs, scoring, feedback, persona test harness |
| **v0.4** | AI engines: Gemini Nano (origin trial) + Gemini cloud (own key), engine switcher, LLM re-rank + "why" |
| **v0.5** | Google Drive sync, mango ratings, "now on your services" alerts, share cards (image) |
| **v1.0** | Onboarding, TV progress, Mangoidiots review link, analytics (consent-gated), polish and accessibility |

### 4.15 Still needed from you

1. **Pick the logo:** A + B as a pair (my recommendation), or a different direction.
2. **Domain:** `<you>.github.io/MovieMango` or a custom domain such as `moviemango.mangoidiots.com`. This must be settled before the OAuth and origin-trial setup.
3. **License:** AGPL-3.0 (recommended) or MIT.
4. **Later:** the Google Analytics tag and the "Why I built this" text.

---

## 5. Third-round prompt (verbatim)

> 1. logo, let us go with cine-specs option, ensure it is drawn tastefully. 2. your byline suggestion is fine. 3. You are wrong, prompt ai is freely available I suppose, if you are doubtful, go with downloading WebGPU and Qwen Model from Huggingface, fallback and configurable will be Google AI Studio. 4. AI personalised improvement is the core value, lowest denominator can be what you suggested with no AI and it has to be user configured. 5. Sharing OK. 6. Google Analytics is needed, savvy users can github repo clone and get it removed. 7. Allow users to see the Mangoidiots rating and even read the mangoidiots review summary and the full review on the app itself using wordpress.com public api as mangoidiots is hosted there. 8. A 60 second setup is fine, but it should be tailored on the location of the user and languages they choose. 9. yes, track tv episode is fine. 10. Yes to family filter, allow all ratings if users ask for them. 11. the app lives at watch.mangoidiots.com. 12. license if none of the framework you are going to use require agpl, go with mit otherwise agpl. 13. in future versions we can allow youtube watchlist sync and support as well.

---

## 6. Response: current design (supersedes §2 and §4 where they differ)

### 6.1 Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Logo | **Cine-specs**, redrawn. Final assets are in `branding/` (see 6.2) |
| 2 | Byline | **"Ripe picks for your mood and your moment."** + **"Private. Free. Open."** |
| 3 | AI | **Chrome Prompt API → WebGPU + Qwen (from Hugging Face) → Google AI Studio key.** The user can choose any of these (see 6.3) |
| 4 | Core value | **AI-personalised recommendations.** The non-AI "Basic" mode exists only when the **user chooses it** |
| 5 | Sharing | As in §4.6 |
| 6 | Analytics | **Google Analytics is in.** The tag is supplied later through config. Forks can remove it |
| 7 | Mangoidiots | Show the **Mangoidiots rating**, the **review summary** and the **full review** inside the app, through the WordPress.com public API (see 6.5) |
| 8 | Onboarding | 60-second setup **tailored to the user's location and chosen languages** (see 6.6) |
| 9 | TV | Episode tracking (see 6.8) |
| 10 | Family filter | Certification filter by audience, with **"Show all ratings"** when the user asks (see 6.7) |
| 11 | Domain | **https://watch.mangoidiots.com** (see 6.9) |
| 12 | License | **MIT.** No dependency needs AGPL (see 6.11) |
| 13 | Future | YouTube watchlist sync and support (see 6.12) |

### 6.2 Logo: Cine-specs (final draft)

The mark is the Mangoidiots mango in red/cyan 3D cinema glasses. It's redrawn for polish:
- An **asymmetric mango body** with a soft lower-right shade crescent and a top-left highlight, so it has depth without a gradient
- Two **leaves**: the main leaf has a midrib, plus a smaller second leaf. An **olive S-curve stem** (`#5A6B2E`) stays visible in dark mode, where the earlier navy stem disappeared
- **Rounded-rectangle 3D glasses** with navy frames, a curved bridge, temples, and a diagonal shine on each lens. The lenses are coral red `#EF5350` and cyan `#26C6DA`
- A symmetrical **handlebar moustache**, the Mangoidiots signature
- Brand palette: mango `#FED201`, shade `#F2B705`, leaf `#8CC63F`, navy `#27323F`, cream `#FFF8E1`

| File | Use |
|---|---|
| `moviemango-logo.svg` / `-512.png` / `-192.png` | Main mark, transparent background |
| `moviemango-icon-maskable.svg` / `-512.png` / `-192.png` | PWA icon on cream, kept inside the maskable safe zone |
| `apple-touch-icon-180.png` | iOS home screen |
| `favicon.svg` / `favicon-32.png` / `favicon-16.png` | Simplified: no shine, highlight or leaf rib, so it stays crisp at small sizes |
| `preview.png` | Contact sheet in light and dark, plus the icon and favicon sizes |
| `logo.py` | Regenerates everything (`pip install cairosvg`) |

### 6.3 AI engine (final)

**Correction:** you were right. **The Prompt API is in stable Chrome for ordinary websites as of Chrome 148**, and no origin trial is needed. Only the extra sampling-parameters feature is in a trial. Chrome's official requirements for Gemini Nano are:
- Windows 10/11, macOS 13+, Linux, or a Chromebook Plus
- **22 GB free disk space**
- A GPU with more than 4 GB VRAM, *or* 16 GB RAM and 4+ CPU cores

**Chrome on Android and iOS is not supported.** That's where the WebGPU + Qwen tier comes in: it covers phones, Safari, Firefox and lower-spec PCs.

**Engines:**

| Engine | Where it runs | Notes |
|---|---|---|
| **Gemini Nano** (Chrome Prompt API) | Chrome desktop that meets the requirements | Free, private, works offline after Chrome downloads the model once |
| **Qwen on WebGPU** (WebLLM, weights from Hugging Face `mlc-ai`) | Any browser with WebGPU: Chrome/Edge desktop, Chrome Android, Safari 26 | Default **Qwen3-1.7B** (q4); **Qwen3-0.6B** on low-memory or mobile devices. **Ask before downloading** (show the size, ~0.5–1.5 GB), then keep it in browser storage so it's a one-time download |
| **Gemini cloud** (Google AI Studio key) | Anywhere | Free tier. The user pastes a key. Fastest and smartest; prompts leave the device |
| **Basic (no AI)** | Anywhere | **Used only when the user chooses it in Settings** |

**Settings → AI engine:** `Auto (recommended)` · `Gemini Nano (on-device)` · `Qwen (on-device)` · `Gemini (cloud, my key)` · `Basic (no AI)`

**Auto** tries Nano, then Qwen (asking before the download), then Gemini cloud if a key is saved. If none of them is available, it shows: *"AI isn't available on this device yet."* with three buttons: **[Add Google AI Studio key]** · **[Try on-device Qwen]** · **[Use Basic mode]**. The app never drops to Basic silently. A chip on Home shows the active engine and lets the user switch between the engines this device supports.

**What AI adds (the core value):**
1. **Re-rank + "why this, now"** for the TMDB candidates (grounded: only candidate IDs are accepted, as in §2.4).
2. **Free-text intent:** for example, *"something light, under 90 minutes, Tamil, not a romance"* is parsed into filters and mood.
3. **Taste portrait:** a short, editable paragraph like "You love slow-burn Malayalam thrillers and 90s Tamil comedies…". The user can correct it, and it steers future picks.
4. **Context blend:** time of day, weekday or weekend, the "In the news" tone (opt-in), plus your inputs.
5. **Refine in conversation:** "lighter", "shorter", "more like #2", "something I'd never pick".
6. **Mangoidiots-aware**, optional: give a boost to titles Mangoidiots rated Ripe or Delicious, and use review text as extra evidence about a title.

### 6.4 Analytics

- GA4 loads from `VITE_GA_ID`. It's **left out of the build when the variable is empty**, so forks get no analytics by default. The README explains how to remove or replace it.
- It sends only **page views and feature events**, never titles, lists, moods, ratings, review reads or keys.
- The About and Privacy pages say this plainly. Settings has an **"Anonymous usage stats"** toggle (on by default). This keeps the "Private" promise honest and is sensible under India's DPDP Act.

### 6.5 Mangoidiots: ratings and reviews in the app

I checked the WordPress.com public API, and it works from the browser:
- The API returns `Access-Control-Allow-Origin` for `https://watch.mangoidiots.com`.
- The Mangoidiots site is **WordPress.com site ID `974561`**. `mangoidiots.com` redirects to `venkatarangan.com`, so query by ID, not by domain.
- Base URL: `https://public-api.wordpress.com/wp/v2/sites/974561/`
- Categories: **Movies `26`** (~1,400 posts), **Television `232`** (~95)
- **Rating tags:** **Rotten `1523`** · **Raw `1524`** · **Ripe `1525`** · **Delicious `1527`**

**Flow:**
1. **Find the review.** On a title page, call `posts?search=<title>&categories=26,232&_fields=id,title,link,date,excerpt,tags`.
2. **Match it.** Review titles look like `Title (Year), tagline`, for example *"Yezhu Kadal Yezhu Malai (2026), a train toilet rat"*. Normalise both titles (case, accents, punctuation, transliteration variants), compare, and confirm with the year. Cache the TMDB-ID → post-ID mapping, including "no review found", for 7 days.
3. **Rating badge.** Map the post's tags to Rotten, Raw, Ripe or Delicious, and show the mango badge next to the TMDB score.
4. **Summary.** Show the post `excerpt`. An optional "AI summary" turns the full review into 3 lines using the active engine.
5. **Full review in the app.** Fetch `posts/<id>?_fields=title,content,link,date` and render `content.rendered` in a reader view, sanitised with **DOMPurify**, with images lazy-loaded. Include a byline and an **"Open on Mangoidiots"** link.
6. **Browse.** Add a "Mangoidiots reviews" shelf, filterable by rating, for example *"All Delicious Tamil films on my services"*.

Rate limits: about one search per title page view, all cached. That's well within what the public API allows.

### 6.6 60-second onboarding, tailored

1. **Where and what language.** Detect without asking for permission: the timezone from `Intl` (`Asia/Kolkata` → India) and `navigator.languages`. Show what was detected:
   - **Region:** India (other countries marked "coming soon")
   - **Languages:** English, Tamil and Hindi pre-ticked, plus anything detected from the browser (for example, `ml-IN` adds Malayalam)
   - **Services:** Netflix, Prime Video and JioHotstar pre-ticked; the other top-10 services can be added with one tap
2. **"Tap 10 you love."** A grid of ~36 posters from TMDB `discover`, using `watch_region=IN`, the chosen languages (spread proportionally) and streamable on the chosen services. It mixes movies and TV, decades and genres. Swiping reveals more. An optional "not for me" long-press counts as negative evidence.
3. **AI engine.** Auto-detect, with a one-line explanation and a choice.
4. **Optional: connect Google Drive** for backup.
5. **First "Tonight" picks**, right away.

### 6.7 Audience and certification filter

| "Watching with" | Default certification limit (India / CBFC, as TMDB reports it) |
|---|---|
| Kids | U |
| Family | U, UA (including UA 7+ / 13+ where TMDB has them) |
| Partner / Solo | All |

- A **"Show all ratings"** toggle lifts the limit for the session, or permanently from Settings.
- Titles with no certification data are shown with an "unrated" note, and are hidden in Kids mode.

### 6.8 TV episode tracking

- For each show: season and episode checkboxes, "mark season watched", and a **Next up** chip.
- A **Continue watching** row on Home. "Continue a series" is one of the "Tonight" options.
- New-episode badges use air dates from TMDB and TVmaze, checked when the app opens and throttled.
- Watched episodes are synced through Drive along with everything else.

### 6.9 watch.mangoidiots.com setup

- **DNS (Cloudflare):** add a `CNAME watch → <github-user>.github.io` record set to **DNS only** (grey cloud), so GitHub can issue the HTTPS certificate. Make sure the existing `mangoidiots.com → venkatarangan.com` redirect rule doesn't catch `watch.` as well.
- **GitHub Pages:** a `CNAME` file containing `watch.mangoidiots.com`, plus **Enforce HTTPS**.
- **Google OAuth (Drive):**
  - Add `https://watch.mangoidiots.com` as an authorised JavaScript origin.
  - This is a **public** app, so the consent screen must be **published to production**. Testing mode only allows 100 hand-added users.
  - Verify `mangoidiots.com` in Google Search Console. `drive.appdata` is a non-sensitive scope, so only brand verification should be needed.
  - Serve static `/privacy.html` and `/about.html` pages; the verification form needs plain URLs.
- **TMDB key:** for a public site, **ship a project TMDB key** (registered for watch.mangoidiots.com) so new users get through the 60-second setup with no key step. Users can still override it with their own key in Settings. Gemini stays bring-your-own-key.

### 6.10 Docs and About: attribution and "Private, Free, Open"

As in §4.9 and §4.10, with these changes:
- **The Mangoidiots credit** is added: *"Reviews and mango ratings by Mangoidiots (mangoidiots.com), © Venkatarangan Thirumalai."*
- **The license line** now reads MIT.
- **Model credits:** Gemini Nano (Google), Qwen (Alibaba Qwen team, Apache-2.0, via MLC/WebLLM and Hugging Face), Gemini API (Google).
- **The privacy text** now covers the opt-out analytics toggle.
- **"Why I built this":** still a placeholder.

### 6.11 License: MIT

None of the planned dependencies need AGPL:

| Dependency | License |
|---|---|
| React, MUI, TanStack Query, zod, html-to-image, react-i18next, Workbox / vite-plugin-pwa, Vite | MIT |
| Dexie | Apache-2.0 |
| WebLLM | Apache-2.0 |
| @google/genai | Apache-2.0 |
| DOMPurify | MPL-2.0 / Apache-2.0 |

Qwen3 weights are Apache-2.0 and are downloaded at runtime, not bundled. **So the repo license is MIT.**

### 6.12 Future: YouTube

- Add YouTube as a provider. TMDB already lists "YouTube" (free) for some Indian titles.
- **"Play on YouTube"** deep links, and full movies that are free on official channels.
- **Sync:** the YouTube Data API **doesn't expose Watch Later or watch history** (they've been blocked since 2016). Sync will therefore work with **the user's own playlists and liked videos**, through the `youtube.readonly` scope. That scope is sensitive, so it needs Google verification, which is a reason to keep it for v2+.

### 6.13 Updated roadmap

| Phase | Scope |
|---|---|
| **v0.1** | Repo (MIT), CI/CD to watch.mangoidiots.com, app shell + Cine-specs branding + dark mode, TMDB search and title pages, India "where to watch", lists (3 + 50), attribution, About and Privacy, GA slot |
| **v0.2** | Tailored 60-second onboarding, Settings, share/export, JSON backup |
| **v0.3** | **AI engines** (Nano → Qwen WebGPU → Gemini key; Basic as a user option) + "Tonight" with re-rank, "why", free-text intent and taste portrait |
| **v0.4** | **Mangoidiots** rating, summary, in-app review reader and review shelf; certification filter |
| **v0.5** | Google Drive sync, TV episode tracking, "now on your services" alerts, image share cards |
| **v1.0** | Conversational refine, news and context blend, polish, accessibility, performance |
| **v2+** | YouTube provider and playlist sync, more regions, Tamil and Hindi UI |

### 6.14 Next step

Scaffold the **MovieMango** repo with v0.1. Needed from you:
1. Your **GitHub username or org**, and whether I should create the repo with `gh`.
2. *(Later)* the GA measurement ID, the TMDB key for the public site, and the "Why I built this" text.

### Sources (round 3)

- [Chrome Prompt API docs: status and hardware requirements](https://developer.chrome.com/docs/ai/prompt-api)
- [Prompt API sampling-parameters origin trial](https://developer.chrome.com/blog/prompt-multimodal-origin-trial)
- WordPress.com REST API (checked live): `https://public-api.wordpress.com/wp/v2/sites/974561/`

---

## 7. Fourth-round prompt (verbatim)

> go ahead with the development and local repo. let us ask the users for their tmdb key but give a link to get one, and give instructions to follow. i will give the github username, etc once I have tested the app locally.

---

## 8. Response: first build (v0.1.0)

### 8.1 Decisions this round

- **TMDB key: bring your own.** Onboarding and Settings show a 4-step guide with links (sign up → Settings → API → form values → paste the token). The key is verified against TMDB before it's saved. Both the v4 Read Access Token and the v3 API Key work.
- **Local git repo** on `main`. GitHub username, remote, GA ID and the "Why I built this" text come later.

### 8.2 What's built

| Area | Status |
|---|---|
| App shell | Vite 8 + React 19 + TypeScript + MUI 9, hash routing, PWA (installable, offline lists), light/dark theme in the Cine-specs palette, self-hosted fonts, lazy-loaded pages |
| Onboarding | 5 steps: welcome → TMDB key → region/languages/services (detected from time zone + browser, defaults en/ta/hi and Netflix/Prime/JioHotstar) → tap 10 you love (tailored by language and services) → AI engine |
| Tonight | Time, feeling, want, discovery, audience, type, and free text (needs AI); TMDB candidates → scoring → checks (services, runtime, certification) → AI re-rank with reasons; Later / Not tonight / Never feedback |
| AI engines | Gemini Nano (Prompt API) → Qwen3 on WebGPU (WebLLM, Hugging Face) → Gemini (AI Studio key, REST) → Basic (only when chosen). Auto choice plus manual switch; downloads only on request; JSON-schema output validated with zod |
| Title page | Details, India where-to-watch with Play buttons, mango rating, Mangoidiots rating + excerpt + AI summary + full in-app review reader, Wikipedia summary, cast, trailer, more like this, share |
| Library | Favourites, Watchlist, Watched, up to 50 custom lists (create, rename, delete), taste portrait (AI-written, editable), export of each list or everything |
| Reviews | Mangoidiots shelf filtered by rating, with paging and an in-app reader |
| Share/export | Share sheet with an attached `.txt` on phones; download / copy elsewhere; TMDB + JustWatch credits in every export |
| Settings | Services, languages, AI engine + Gemini model + Qwen model, personalisation toggles, TMDB key, JSON backup/restore, cache clear, erase all, analytics opt-out |
| Attribution | TMDB (logo + required notice), JustWatch, Mangoidiots, Wikipedia/Wikidata, AI models: on the About page, in the footer, on title pages, in exports and in the README |
| Analytics | GA4 only when `VITE_GA_ID` is set at build time; page views with IDs stripped plus feature names; consent mode with ads denied; opt-out in Settings |
| Deploy | GitHub Actions → GitHub Pages, `public/CNAME` = watch.mangoidiots.com |
| Tests | 32 unit tests (scoring, profile, providers, Mangoidiots matching, export text, engine choice, AI output handling, lists cap, backup merge, locale, and the full Tonight pipeline against a mocked TMDB) + Playwright smoke tests on phone and desktop viewports, including dark mode |

### 8.3 Not built yet

- Google Drive sync (needs an OAuth client ID). JSON backup/restore covers this for now.
- TV episode tracking, "now on your services" alerts, image share cards, Tamil/Hindi UI.
- Search deep links for SonyLIV, aha, Sun NXT and MX Player open the service's home page.

### 8.4 Verified, and not yet verified

- **Verified:** type check, unit tests, production build, and browser smoke tests with mocked APIs. The live Mangoidiots WordPress API was checked with real requests (CORS, search, rating tags).
- **Not verified yet:** live TMDB responses (no key during the build), live Gemini Nano, Qwen and Gemini cloud generation, and real OTT Play links.

---

## 9. Fifth-round prompt (verbatim)

> Prompt the user in first run and get the google drive login. It has to be interactive with the user

---

## 10. Response: Google Drive sign-in and sync

### 10.1 First-run flow (now 6 steps)

Welcome → **Google Drive** → TMDB key → You (languages and services) → Tap 10 you love → AI engine.

The Drive step:
- Explains what's stored and where (one file in a hidden app folder in the user's own Drive; nothing else visible; no MovieMango server).
- Shows a Google-branded **Sign in with Google** button. The Google popup (account chooser, then consent) opens only from that tap.
- On success it shows the connected email and either "first backup saved", or, for a returning user, **"Welcome back! We brought over N titles and M lists"**.
- **Returning users skip ahead**: when Drive brings back a TMDB key and favourites, setup jumps straight to the AI step. With only a key, it skips the key step.
- **Not now** is allowed, but first shows a warning that the lists would live only in this browser.
- Errors (popup blocked, window closed, permission unticked) are explained in plain words, with **Try again**.

### 10.2 Sync behaviour

- Google Identity Services token flow, browser-only. Scopes: `drive.appdata` + `openid email`, all non-sensitive.
- One JSON file, `moviemango-sync.json`, in `appDataFolder`. It holds titles, lists (with tombstones), synced settings (languages, services, keys, Gemini model, toggles, taste portrait) and their timestamps. Per-device choices (AI engine, theme) aren't synced.
- Merge is newest-wins per title, per list and for the settings block. An empty key never overwrites a saved one, so a new device picks up the user's keys.
- Triggers: about 15 s after any change, when the tab is hidden, on app start (if the token is still valid), and **Sync now**.
- Tokens last about 1 hour and are kept for the current tab only. When one expires, the header shows **Reconnect Drive**, which is one tap. A cloud icon shows synced / syncing / error.
- Settings has a **Google Drive backup and sync** panel: connected account, last sync, Sync now, Sign in again, Disconnect (revokes the token).

### 10.3 To test locally

Create a Google OAuth **Web** client (steps in the README: enable the Drive API, consent screen with the three scopes, yourself as a test user, origins `http://localhost:5173` and `https://watch.mangoidiots.com`). Put the client ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID`. Without it, the Drive step tells the user it isn't configured and continues.

### 10.4 Verified

- 3 new unit tests for the merge rules (35 in total).
- Playwright tests with Google sign-in and Drive stubbed: first-run sign-in → first backup → 10 favourites reach Drive after a sync; and a returning user on a new device restores 6 titles, a custom list, the TMDB key, languages, services and the taste portrait, then lands on the AI step.
- Not yet verified against real Google: that needs your OAuth client ID.

---

## 11. Sixth- and seventh-round prompts (verbatim)

> can I test the locally app without google oauth capabilities

> commit everything we did here in this session and write markdowns

---

## 12. Response: local testing and documentation

**Testing without Google OAuth: yes.** Drive sign-in switches on only when `VITE_GOOGLE_CLIENT_ID` is set. Without it:
- First-run step 2 says Drive sync isn't configured and shows **Continue**.
- The header has no sync icon, and Settings says Drive isn't configured (file backup/restore still works).
- Everything else works. A TMDB key is still needed. For AI, use Chrome 148+ (Gemini Nano), a Google AI Studio key, WebGPU (Qwen), or Basic mode.

Full guide: `docs/testing-locally.md`.

**Docs written this round:**

| File | Contents |
|---|---|
| `docs/testing-locally.md` | Running without Google sign-in, getting a TMDB key, AI options, tips, enabling Google sign-in later, automated tests |
| `docs/architecture.md` | System overview, source layout, data model, Tonight pipeline, AI engine choice, Drive sync, caching and rate limits, privacy-relevant choices |
| `CHANGELOG.md` | 0.1.0 and the unreleased Drive sign-in work |
| `docs/original-prompt.txt` | The session's original prompt (was `input.txt`) |
| `README.md` | Links to the docs above |

**Housekeeping:** `tsconfig.tsbuildinfo` was removed from git and is now ignored.

---

## 13. Eighth-round prompt (verbatim)

> overall write the readme, docs and app main screen and about - keep them short and to point, no need to be unnecessarily verbose, especially on the technical side, as devs are smart and likely to use ai agents to understand the code and the app, for end-user give explanations. publish to github, setup the github pages at watch.mangoidiots.com, give me instructions for dns entry with cloudflare I will do it manually. the reason for me to use this app is (rephrase and reword to sound nice, write it short and convey the spirit and point of what I am trying here without being too long and boring) "I am a movie fan, like to watch world movies apart from Indian and Hollywood movies, keeping track of movies tv shows that are good, that I would like to watch, discovering new ones based on my likes, and not having the data locked with OTT Services, big tech or pay ridiculous subscription just for a cloud database storage has been something I have been wanting to avoid and I was planning to write an app myself for years, but never found the time. i have saved my movie watched list, watch list in google, imdb, youtube, justwatch, plex and had to manually keep exporting and importing, managing it across services and finding what I want when I want has always been a problem. thanks to claude ai, now I could write an app that solves my problem for me, without spending much and keep owning data I generate with me, so that in future I can use my AI assistant to operate on it".

---

## 14. Response: concise docs, "Why I built this", publishing

- **"Why I built this"** (README and About): a short rewrite of the author's story covering world cinema, lists scattered across Google, IMDb, YouTube, JustWatch and Plex, no lock-in or cloud subscription, built at last with Claude, and data owned and ready for a personal AI assistant.
- **Shortened:** README (end-user first, a short developer section), About page, Tonight page wording, `docs/testing-locally.md`, `docs/architecture.md` and the changelog.
- **Published:** `github.com/venkatarangan/MovieMango` (public), GitHub Pages deployed from Actions with the custom domain `watch.mangoidiots.com`.
- **Cloudflare DNS (done manually by the owner):** a `CNAME` record `watch` → `venkatarangan.github.io`, **DNS only** (grey cloud). Then turn on **Enforce HTTPS** in GitHub Pages once the certificate is issued.

---

## 15. Ninth-round prompts (verbatim)

> dns entry is done. have you included for enduser while using the app instructions on how to get tmdb api key and google cloud ai studio api key in a simple way, make it clear to them there are no costs for normal usage and give them link to the respective sites for more details to convince them.

> can you dns and basics in infra are in order. commit and write markdownds for future sessions

---

## 16. Response: "it's free" notes, infra check, session notes

- **Key instructions in the app:** both the TMDB and the Google AI Studio steps were already there. Each now also has a green **"💸 Free. No cost for normal use."** note with links to the provider's own pages:
  - **TMDB:** free for personal, non-commercial use, no card or payment details asked. Links: TMDB API terms, TMDB API FAQ.
  - **Gemini:** a free tier with no card and no billing account, so the user can't be charged; past the daily limit, requests pause until the next day; no Google Cloud setup needed. Links: Gemini API pricing (free tier), free-tier limits.
- **Infra check:** the CNAME resolves straight to GitHub (DNS only, as intended); the site, `privacy.html`, manifest, service worker and logos are all served; github.io redirects to the custom domain. The HTTPS certificate was still being issued; Enforce HTTPS is switched on once it's ready.
- **For future sessions:** `CLAUDE.md` (context, commands, rules, gotchas, open items) and `docs/operations.md` (hosting, DNS, variables, routine tasks).

---

## 17. Tenth-round prompt (verbatim)

> can you check now and enable https. and then update markdown and claude.md

---

## 18. Response: HTTPS enabled

- The certificate was still pending, so the custom domain was removed and re-added in Pages. GitHub issued a Let's Encrypt certificate for `watch.mangoidiots.com` within a minute (valid to 2027-01-01, renews automatically).
- **Enforce HTTPS** is on. `https://watch.mangoidiots.com` returns 200, `http://` redirects to `https://`, and `venkatarangan.github.io/MovieMango` redirects to the custom domain.
- Updated `docs/operations.md` (HTTPS status and the fix for a stuck certificate) and `CLAUDE.md` (infra complete, social features out of scope).
