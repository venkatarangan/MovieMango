# Operations

| Item | Setting |
|---|---|
| Repo | github.com/venkatarangan/MovieMango (public) |
| Hosting | GitHub Pages, source **GitHub Actions** (`.github/workflows/deploy.yml`: test → build → deploy on push to `main`) |
| Domain | `watch.mangoidiots.com`, set in Pages settings; `public/CNAME` matches |
| DNS (Cloudflare, managed by the owner) | `CNAME watch → venkatarangan.github.io`, **DNS only** (grey cloud). A proxied record would block GitHub's certificate |
| HTTPS | Let's Encrypt certificate issued by GitHub (renews automatically); **Enforce HTTPS** is on, so http redirects to https |
| Actions variables | `GA_ID` (GA4; empty = no analytics), `GOOGLE_CLIENT_ID` (Drive sign-in; empty = Drive step skipped) |

## Routine tasks
- **Deploy:** push to `main`. **Roll back:** `git revert` the bad commit and push, or re-run an earlier successful workflow.
- **Change analytics or Google sign-in:** edit the Actions variable, then re-run the latest workflow (Actions → Test and deploy → Re-run).
- **Domain health:** `gh api repos/venkatarangan/MovieMango/pages --jq '{cname, https_enforced, cert: .https_certificate.state}'`.
- **Certificate stuck on "none":** remove the custom domain and add it back (Settings → Pages, or `gh api -X PUT …/pages --input - <<<'{"cname": null}'`, then set `cname` again). That worked within a minute on 2026-10-03.
- **Optional hardening:** verify `mangoidiots.com` under GitHub profile → Settings → Pages (adds a TXT record in Cloudflare) so nobody else can claim its subdomains.

## External accounts
- **Google Cloud project** (for the OAuth client): web client created 2026-10-07 and published; brand verification (Branding and Verification Center) still pending, so users see the "unverified app" screen. Setup steps are in `docs/testing-locally.md`; privacy URL `https://watch.mangoidiots.com/privacy.html`.
- **Drive API quota:** sync is batched (at most 3 calls per sync, backoff on rate limits), and calls cost the owner nothing; data counts against each user's Drive.
- **TMDB and Gemini:** each user brings their own key; the project holds none.
