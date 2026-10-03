# Operations

| Item | Setting |
|---|---|
| Repo | github.com/venkatarangan/MovieMango (public) |
| Hosting | GitHub Pages, source **GitHub Actions** (`.github/workflows/deploy.yml`: test → build → deploy on push to `main`) |
| Domain | `watch.mangoidiots.com`, set in Pages settings; `public/CNAME` matches |
| DNS (Cloudflare, managed by the owner) | `CNAME watch → venkatarangan.github.io`, **DNS only** (grey cloud). A proxied record would block GitHub's certificate |
| HTTPS | GitHub-issued certificate; **Enforce HTTPS** on in Settings → Pages |
| Actions variables | `GA_ID` (GA4; empty = no analytics), `GOOGLE_CLIENT_ID` (Drive sign-in; empty = Drive step skipped) |

## Routine tasks
- **Deploy:** push to `main`. **Roll back:** `git revert` the bad commit and push, or re-run an earlier successful workflow.
- **Change analytics or Google sign-in:** edit the Actions variable, then re-run the latest workflow (Actions → Test and deploy → Re-run).
- **Domain health:** `gh api repos/venkatarangan/MovieMango/pages/health`.
- **Optional hardening:** verify `mangoidiots.com` under GitHub profile → Settings → Pages (adds a TXT record in Cloudflare) so nobody else can claim its subdomains.

## External accounts
- **Google Cloud project** (for the OAuth client): not created yet. Steps are in `docs/testing-locally.md`. Publish the consent screen before a public launch; privacy URL `https://watch.mangoidiots.com/privacy.html`.
- **TMDB and Gemini:** each user brings their own key; the project holds none.
