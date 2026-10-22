# Liv's Clip Room — GitHub Pages version

Mobile-friendly collaborative review of **355 Twitch clips** from `llivvv_xo` (December 2024–October 2026), with a separate private admin results dashboard.

**Frontend:** GitHub Pages at **https://llivvv-xo.t-b.es/** (recommended spelling with a hyphen).  
**Backend:** Cloudflare Worker + D1 database, on a separate `*.workers.dev` HTTPS URL.

GitHub Pages serves only static files and **cannot save shared votes by itself**. This project makes votes persist in Cloudflare D1 and keeps mod/admin credentials out of the public GitHub repository.

## 0. Important domain detail

`llivvv_xo.t-b.es` is **not a valid HTTPS hostname**: the `_` character is allowed in some DNS record names but not standard certificate hostnames. Use `llivvv-xo.t-b.es`, `llivvvxo.t-b.es`, or `liv.t-b.es` instead. This package defaults to `llivvv-xo.t-b.es`.

If you choose a different subdomain, change **both** `docs/CNAME` and `worker/wrangler.toml` (`ALLOWED_ORIGINS`) before deployment.

## 1. Create a GitHub repository

1. Create a **public repository** on GitHub, for example `liv-clip-room`. GitHub Pages on the free plan works with public repositories.
2. Upload **the contents of this folder**, preserving the `docs/` and `worker/` folders. Do **not** upload the ZIP as one file. No credentials are bundled.
3. In repository **Settings → Pages**, set **Build and deployment → Deploy from a branch**, branch **`main`**, folder **`/docs`**, then **Save**.
4. Initially GitHub may show a URL like `https://YOURUSERNAME.github.io/liv-clip-room/` but the review buttons will not work until the Worker is deployed and configured.

`docs/` is the only folder GitHub Pages publishes. The Worker source in `worker/` is stored in GitHub but not hosted/executed by Pages. The public GitHub repo includes the names and thumbnails of public clips, so don't add private clips or private info.

## 2. Deploy the shared voting backend on Cloudflare

You need a [Cloudflare account](https://dash.cloudflare.com/) and [Node.js](https://nodejs.org/) installed on your computer. **You do not need to move DNS for `t-b.es` to Cloudflare.** Only the API runs on Cloudflare and can use a free `*.workers.dev` address.

Open Terminal / PowerShell in the **`worker/` folder** from this project:

```sh
npm install
npx wrangler login
npx wrangler d1 create liv-clip-room-db
```

Copy the **database ID (UUID)** that the last command prints. Open `worker/wrangler.toml` and replace `REPLACE_WITH_DATABASE_ID` with that ID (leave the quotation marks).

Create the database tables:

```sh
npx wrangler d1 execute liv-clip-room-db --remote --file=./schema.sql
```

Set a **separate strong secret for each audience** (these commands will ask you to type or paste the values; they are stored by Cloudflare and **not** in GitHub):

```sh
npx wrangler secret put ADMIN_KEY
```

Use a long, unguessable **admin password**. Mod reviewers do not need a password. Don't put it in `docs/api-config.js`, `wrangler.toml`, screenshots, Discord public channels, or GitHub commits.

Deploy the API:

```sh
npx wrangler deploy
```

Wrangler prints a URL similar to:

```
https://liv-clip-room-api.YOUR-CLOUDFLARE-SUBDOMAIN.workers.dev
```

Try opening **`YOUR-WORKER-URL/health`** in a browser. It should return `{"ok":true,"clips":355}`.

Cloudflare Worker + D1 free allowances are generally plenty for a handful of mods. Hosting limits and terms can change. Cloudflare, not GitHub, stores and serves reviews.

## 3. Connect GitHub Pages to the Worker

Open `docs/api-config.js` and replace the placeholder with the **actual URL** Wrangler printed:

```js
window.LIV_API_URL = 'https://liv-clip-room-api.YOUR-CLOUDFLARE-SUBDOMAIN.workers.dev';
```

Include `https://` and **no trailing slash**. Commit/push this edit to GitHub. The API URL is public information; it's **not** a secret.

The API accepts browser requests from `https://llivvv-xo.t-b.es` by default. If you want to test before custom-domain DNS works, you can temporarily edit the `ALLOWED_ORIGINS` line in `worker/wrangler.toml`, for example:

```
ALLOWED_ORIGINS = "https://llivvv-xo.t-b.es,https://YOURUSERNAME.github.io"
```

Run `npx wrangler deploy` after changing it. The setting takes **origins**, not full page paths; don't append `/liv-clip-room`.

**Don't use `*` for CORS.** The Worker separately checks the admin password, but restricting origins helps reduce casual cross-site requests.

## 4. Point `llivvv-xo.t-b.es` to GitHub Pages

In your GitHub repo, open **Settings → Pages → Custom domain** and enter:

```
llivvv-xo.t-b.es
```

Save it. GitHub may add or update `docs/CNAME` automatically; confirm it contains only `llivvv-xo.t-b.es`.

At **the DNS provider for `t-b.es`**, add:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name / Host | `llivvv-xo` |
| Target / Points to | `YOURUSERNAME.github.io` |
| TTL | Default / Auto |

The target is **your GitHub username + `.github.io`**, without `https://` or `/liv-clip-room`.

Wait for DNS/HTTPS to become available, then go back to GitHub Pages settings and enable **Enforce HTTPS**. GitHub notes that DNS changes can take up to 24 hours, though often less.

Once DNS is configured, the site URL should be **https://llivvv-xo.t-b.es/** and your results dashboard **https://llivvv-xo.t-b.es/admin.html**. GitHub Pages serves `admin.html`, not `/admin`.

## 5. Test before posting to mod chat

1. Visit the public-facing site and enter a display name + **mod code**.
2. Open a clip and mark **Include**; wait for **Saved ✓**.
3. Reload; verify the decision stays selected.
4. Open **`/admin.html`**, enter your **admin password**, and check that one Include appears with the mod's name and comment.
5. Click **Export CSV** and confirm that it includes the clip link and comment.
6. Check the mod page from a phone. Twitch embedded playback is not reliable in all mobile browsers, so the **Open on Twitch** link is also provided.
7. **Only share in mod chat after Liv agrees.** Share only the website URL; never share the admin password.

## Reviewing and administering

- Mods can **Include / Maybe / Skip**, add notes, filter and sort, and revisit decisions.
- Each mod has a unique random reviewer ID stored in **that browser's localStorage**. Opening the site on another device creates a different reviewer identity; this isn't Twitch/Discord verified login.
- The shared mod code provides access. Anyone who gets it can enter any display name and submit decisions. The tool is for a trusted mod team, not a formal secure ballot.
- Visit `/admin.html` for aggregate results, comments, per-mod activity, sorting and CSV export. The admin password is never bundled into the website.
- Export CSV periodically as your backup. You can also export the Cloudflare D1 database using Wrangler/D1 tools.
- The public repository and static assets can be viewed by others, even though the reviews are access-controlled. Use only public Twitch clips.

## Folder structure

```
/docs/
  index.html       Mod review page
  admin.html       Admin results page
  app.js           Reviewer frontend
  admin.js         Admin frontend
  styles.css       Mobile/desktop styling
  api-config.js    Public Worker URL: EDIT AFTER DEPLOY
  CNAME            llivvv-xo.t-b.es
  .nojekyll        Keep Pages from processing files through Jekyll
/worker/
  src.js           Voting and results API
  clips-data.js    Metadata for 355 clips
  schema.sql       Database schema
  wrangler.toml    Worker config; EDIT DATABASE ID
  package.json     Wrangler and test commands
  tests/           Automated API tests
```

## Local testing

The Worker has no real credentials in the repo. For local testing, you can add a **private** file named `worker/.dev.vars` (already gitignored):

```
ADMIN_KEY=choose-a-private-local-admin-password
```

Run `npx wrangler d1 execute liv-clip-room-db --local --file=./schema.sql`, then `npx wrangler dev` inside `worker/`. In `wrangler.toml`, add `http://localhost:8000` temporarily to `ALLOWED_ORIGINS`. Serve the `docs/` folder locally using `python -m http.server 8000` and change `docs/api-config.js` *locally* to `http://localhost:8787` for this test only (the frontend accepts an HTTP Worker address for localhost testing). Do not commit local testing credentials or temporary settings.

Run automated tests without Cloudflare access:

```sh
cd worker
npm test
```

### Troubleshooting

- **“Backend not configured yet”**: edit `docs/api-config.js`, commit and wait for Pages to redeploy.
- **“Failed to fetch” on login**: check the Worker URL, HTTPS, and `ALLOWED_ORIGINS` (including correct spelling of the domain). Browser devtools Network tab can identify CORS problems.
- **401 error**: wrong admin password.
- **503 error**: missing Worker secrets or the secrets are identical.
- **500 error**: missing D1 binding, missing `schema.sql` tables, or an API error. Check Worker logs with `npx wrangler tail`.
- **Twitch iframe blank**: open the clip on Twitch using the direct link. Twitch has embedding/browser restrictions.
- **GitHub Pages shows 404**: make sure Pages source is main `/docs`, CNAME is set, DNS CNAME targets the right `.github.io` user, and allow for propagation.

Sources: [GitHub Pages custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) · [Cloudflare D1 Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/d1/) · [Let's Encrypt preferred hostname syntax](https://letsencrypt.org/documents/isrg-cp-v2.7/)
