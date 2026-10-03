# Testing locally

```bash
npm install
npm run dev        # http://localhost:5173
```

**You need** a free TMDB key; the app walks you through getting one.

**Google sign-in is optional.** Without `VITE_GOOGLE_CLIENT_ID`, the Drive step says it isn't configured and moves on, and everything else works. File backup and restore are in Settings.

**AI options:** desktop Chrome 148+ (Gemini Nano, tap Enable), a Google AI Studio key, a WebGPU browser (Qwen, ~2 GB one-time download), or Basic (no AI).

**Tips**
- Redo first run: Settings → Erase everything.
- Search links work locally too: `http://localhost:5173/?q=dune` or `http://localhost:5173/#/search?q=dune`.
- Production build with the service worker: `npm run build && npm run preview` (port 4173).
- Tests: `npm test`, and `npm run e2e` (mocks every API; screenshots go to `test-results/screens/`).

## Enabling Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. In **Google Auth Platform**, choose audience **External**, add yourself as a test user, and add the scopes `drive.appdata`, `openid` and `userinfo.email`.
3. Create a **Web application** client with JavaScript origins `http://localhost:5173`, `http://localhost:4173` and `https://watch.mangoidiots.com`.
4. Add `VITE_GOOGLE_CLIENT_ID=…` to `.env.local` and restart. For the live site, set the GitHub Actions variable `GOOGLE_CLIENT_ID`.
5. Before going public, publish the app in Google Auth Platform (testing mode allows only listed users). Use `https://watch.mangoidiots.com/privacy.html` as the privacy policy URL.
