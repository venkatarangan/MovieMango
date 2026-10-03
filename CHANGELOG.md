# Changelog

## Unreleased

- New Home page: search with suggestions, three instant "Feeling lucky?" picks, Continue watching, watchlist titles now on your services (marked New when a service adds them), and random movie and TV shelves. Tonight moved to its own tab.
- Search links: `/?q=title` and `/#/search?q=title` open Search; browsers can add MovieMango as a search engine; app shortcuts for Search and Tonight.
- Drive sync options: sync automatically or only when you tap, and choose whether your keys go to Drive.
- Far fewer repeat TMDB calls: a session memory cache, the last 100 titles kept on the device, background refresh of streaming info, and cached data served when TMDB is unreachable.

- Your own titles: add movies and series that aren't on TMDB (original-script title, description, director, cast, link), from Search or the Library.
- Markdown export of any list or all lists, and a new Import page: paste Markdown, a plain list or an IMDb/Letterboxd CSV, review the TMDB matches, then import. Includes a ready-made prompt for converting other apps' exports with an AI.
- TV episode tracking: tick episodes, whole seasons or "watched up to here" on a show's page, see your progress and the next episode, and mark an ended show as watched when you're done. Syncs through Drive.

## 0.1.0 (2026-10-03)

First release.

- Tonight: AI picks by time, mood and company, with reasons, from what's streaming on your services in India.
- Four AI options: Gemini Nano, Qwen (on-device), Gemini with your own key, or none.
- Title pages with where-to-watch and Play links, Mangoidiots reviews, mango ratings.
- Favourites, Watchlist, Watched and up to 50 custom lists; text share/export.
- Google Drive sign-in during first run, for backup and sync across devices.
- Light and dark themes; installable PWA.
