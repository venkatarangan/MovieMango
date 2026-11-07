# Changelog

## 0.3.3 (2026-11-07)

- Tonight shows 10 picks instead of 6, and keeps up to 10 more in reserve: when you sort a pick (Watchlist, Watched, Liked, Loved, Not for me), the next one slides in. Your AI explains the first 10; the reserve has plain reasons, so a small on-device model isn't asked to write 20 reasons at once.
- Tonight looks at titles in waves: 24 first (16 for the quick run), and more only while too few pass your filters. Mangoidiots reviews are checked for the top 16 only. A cold run is about 30 TMDB calls; a repeat costs none.
- Tonight is never empty: your time and mood choices and your last picks are kept on the device (not just in the tab) for six hours, so leaving, reloading or reopening shows them again with no TMDB calls. If there are none yet, a quick run without AI is made, and "Find my picks" has your AI choose and explain.
- Home's 🎲 Feeling lucky now shows Tonight's picks (same run, same cache). Sort a pick on either page and the next one takes its place on both; Shuffle moves on to the next three. If there's no run yet, Home makes the quick one that Tonight then shows.
- The recent-titles store keeps 250 titles (was 100), so a few different moods don't evict each other's details.
- Fixed: picks restored after leaving Tonight lost their service search links.
- About: a small, quiet "Books by the author" note under Credits.

## 0.3.2 (2026-10-07)

- Tonight: each pick has Watchlist (also skips it tonight), Watched, Liked it, Loved it and Not for me; the pick leaves the list, with Undo. "Later" and "Not tonight" are folded into Watchlist.
- Tonight remembers your last picks and choices while the tab is open: leave and come back, and they're still there until you find new ones.

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
