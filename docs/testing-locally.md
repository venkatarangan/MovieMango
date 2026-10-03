# Testing MovieMango locally

## Quick start (no Google sign-in needed)

```bash
cd /mnt/c/devtemp/moviemango
npm install          # first time only
npm run dev          # http://localhost:5173
```

Google sign-in (Drive sync) switches on only when the build has a Google OAuth client ID (`VITE_GOOGLE_CLIENT_ID`). Without one, everything else works:

| Area | Without a Google client ID |
|---|---|
| First run, step 2 (Google Drive) | Says Drive sync isn't configured in this build and shows **Continue** |
| Header | No cloud icon or "Reconnect Drive" chip |
| Settings → Google Drive | Says it isn't configured. **Back up to file** / **Restore from file** still work |
| Tonight, search, title pages, reviews, lists, ratings, share/export | Work normally |

## What you still need

- **A TMDB key** (free). The app's TMDB step walks you through it:
  1. Sign up at <https://www.themoviedb.org/signup> and confirm your email.
  2. Open <https://www.themoviedb.org/settings/api>, choose **Create** → **Developer**, accept the terms.
  3. Type of use **Personal**, name **MovieMango (personal use)**, URL **https://watch.mangoidiots.com**, a one-line summary.
  4. Copy the **API Read Access Token** (or the shorter API Key) into the app.
- **For AI picks, any one of:**
  - Desktop **Chrome 148+**: Gemini Nano. Tap **Enable** and Chrome downloads the model once (needs about 22 GB free disk, and a GPU with more than 4 GB VRAM or 16 GB RAM).
  - A **Google AI Studio key** (free) for Gemini cloud: <https://aistudio.google.com/apikey>.
  - A browser with **WebGPU** for Qwen (a one-time download of about 1.4–2 GB).
  - Or choose **Basic (no AI)**, which ranks picks with a formula.

## Handy tips

- **Redo first-run setup:** Settings → **Erase everything**, or clear site data for `localhost:5173` in the browser's dev tools.
- **Phone testing on the same Wi-Fi:** `npx vite --host` and open the shown network address. Gemini Nano and WebGPU need a secure context, and a LAN IP over plain http isn't one, so use the Gemini key or Basic mode on the phone, or test the deployed HTTPS site.
- **Production build preview:** `npm run build && npm run preview` (http://localhost:4173). This is the only mode where the service worker (offline/PWA) is active.

## Turning on Google sign-in later

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. **Google Auth Platform**: set up branding, add the scopes `.../auth/drive.appdata`, `openid` and `.../auth/userinfo.email`, choose audience **External**, and add yourself as a **test user**.
3. **Clients → Create client → Web application**, with authorised JavaScript origins `http://localhost:5173`, `http://localhost:4173` and `https://watch.mangoidiots.com`.
4. Create `.env.local` in the project root:
   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```
5. Restart `npm run dev`, then connect from **Settings → Google Drive backup and sync**. You don't need to redo setup.

## Automated tests

```bash
npm test                                   # 35 unit tests (Vitest)
npx playwright install chromium            # first time only
npm run e2e                                # browser tests on phone + desktop sizes, all APIs mocked
npm run typecheck
```

The browser tests mock TMDB, WordPress.com, Wikipedia, Google sign-in and Drive, so they need no keys or network. Screenshots land in `test-results/screens/`.
