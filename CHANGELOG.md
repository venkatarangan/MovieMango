# Changelog

## 0.3.1 (2026-10-07)

- The version is in every footer (linked to this changelog), in Settings, and on the Welcome screens. Phones get a short footer at the end of each page.
- Welcome lists a fourth promise: 🧠 Local AI, which runs on your device by default.
- Home: save, watch or 👎 a suggestion (Movies/Shows for you, World picks, this week's language, Feeling lucky) and the next one takes its place; Undo puts it back. Feeling lucky picks have ＋ and 👎 too, and the rows no longer suggest titles already on your watchlist.
- Reviews: covers show whole, without cropping; the full review opens with its cover; "Add to watchlist" finds the reviewed film and saves it, or opens Search to pick when unsure.

## 0.3.0 (2026-10-07)

- Ratings: 👎 Not for me · 👍 Liked it · ❤️ Loved it, right under Watchlist and Watched on every title. 👍 and ❤️ mark it watched; 👎 keeps it out of your picks.
- Quick ＋ and 👎 on every poster: save to Watchlist or Watched, 👍, ❤️, or hide a title, with Undo.
- Library: Watchlist, Watched, ❤️ Loved, 👎 Not for me and My lists, each with Films/Shows chips, eight sort orders, filters (genre, language, your rating, decade) and a find box.
- Genre pages: tap a genre on a title to see the newest 100, then the next 100; filter by a theme word, year or decade, language or your services.
- Cast and director pages: tap a name to see everything they acted in or directed.
- Discovery beyond your languages: a 🌏 World picks row and a weekly language row on Home, and "Any language (subtitles OK)" in Tonight.
- Lighter Drive sync: changes made within 2 minutes go up together, and it also syncs when you open, leave or come back to the app. Retries politely when Google is busy.
- Arrows on Home rows for mouse users; the footer links Mangoidiots and says "Local AI by default".

## 0.2.0 (2026-10-03)

- Home page: search with suggestions, three instant "Feeling lucky?" picks, Continue watching, watchlist titles now on your services (marked New when a service adds them), and random movie and TV shelves. Tonight has its own tab.
- Search links: `/?q=title` and `/#/search?q=title` open Search; browsers can add MovieMango as a search engine; app shortcuts for Search and Tonight.
- Drive sync options: sync automatically or only when you tap, and choose whether your keys go to Drive.
- Far fewer repeat TMDB calls: a session memory cache, the last 100 titles kept on the device, background refresh of streaming info, and cached data served when TMDB is unreachable.
- Your own titles: add movies and series that aren't on TMDB (original-script title, description, director, cast, link), from Search or the Library.
- Markdown export of any list or all lists, and an Import page: paste Markdown, a plain list or an IMDb/Letterboxd CSV, review the TMDB matches, then import. Includes a ready-made AI prompt for other apps' exports.
- TV episode tracking: tick episodes, whole seasons or "watched up to here" on a show's page, see your progress and the next episode, and mark an ended show as watched when you're done. Syncs through Drive.

## 0.1.0 (2026-10-03)

First release.

- Tonight: AI picks by time, mood and company, with reasons, from what's streaming on your services in India.
- Four AI options: Gemini Nano, Qwen (on-device), Gemini with your own key, or none.
- Title pages with where-to-watch and Play links, and Mangoidiots reviews with their mango ratings.
- Watchlist, Watched and up to 50 of your own lists; text share/export.
- Google Drive sign-in during first run, for backup and sync across devices.
- Light and dark themes; installable PWA.
