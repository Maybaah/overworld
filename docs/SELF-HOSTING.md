# Self-hosting

Overworld is a static site plus one small Cloudflare Worker. Everything except My globe and usage stats works as plain static files.

| Piece | Needs | Without it |
| --- | --- | --- |
| The globe, search, Insights | static hosting | – |
| My globe | the Worker with `STEAM_API_KEY` | the lookup shows "not configured" |
| Usage stats and `/admin.html` | a Supabase project and the Worker | nothing is recorded; the admin page offers sample data |

## 1. Build the site

```bash
npm install
npm install --prefix web
npm run pipeline        # or `npm run fixture` for sample data
npm run build --prefix web
```

`web/dist/` is the whole site, including `admin.html`. Build-time variables go in `web/.env.local` (or the CI environment):

| Variable | What it is |
| --- | --- |
| `VITE_BASE` | path the site is served from, for example `/overworld/` (default `/`) |
| `SITE_URL` | absolute site URL, for share-page previews |
| `VITE_STEAM_PROXY_URL` | origin of the Worker when it is not on the site's own origin |
| `VITE_EVENTS_URL` | where the app sends usage events, for example `/api/e`; unset means no events are sent |
| `VITE_TELEMETRY_HOSTS` | comma-separated hosts allowed to send events, for example `overworld.example,www.overworld.example`; other hosts (previews, forks) send nothing |
| `VITE_SUPABASE_URL` | the Supabase project URL, for the admin page's sign-in |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's publishable (anon) key. Never a secret or service-role key: every `VITE_` value ships to the browser |

## 2. The Worker

`web/server/worker.ts` serves two routes:

- `GET /api/steam/owned`: the Steam relay ([web/server/README.md](../web/server/README.md)).
- `POST /api/e`: the usage events relay. It adds the visitor's country from Cloudflare's `cf-ipcountry` header, never the IP, and forwards the batch to the `log_events` function.

With Wrangler, a minimal `wrangler.toml`:

```toml
name = "overworld-api"
main = "web/server/worker.ts"
compatibility_date = "2026-11-01"
```

Then set its values and route `/api/*` on your domain to it:

```bash
npx wrangler secret put STEAM_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put TELEMETRY_HOSTS      # optional: the same list as VITE_TELEMETRY_HOSTS
```

With `TELEMETRY_HOSTS` set, the relay drops requests whose `Origin` is not on the list.

## 3. Supabase (usage stats)

1. Create a project at <https://supabase.com>. The free tier is enough.
2. Apply the schema. Either paste `supabase/migrations/0001_telemetry.sql` into the SQL editor and run it, or run the script with a personal access token:

   ```bash
   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> node scripts/supabase.mjs migrate
   ```

   Migrations are idempotent; running them again changes nothing.
3. Add yourself as an admin. Addresses are kept out of the repository on purpose:

   ```bash
   SUPABASE_PROJECT_REF=<ref> SUPABASE_ACCESS_TOKEN=<token> node scripts/supabase.mjs add-admin you@example.com
   ```

4. Create the same address as a user: **Authentication → Users → Add user → Send invitation**. The admin page never creates accounts, so a stranger who finds `/admin.html` cannot sign up.
5. Under **Authentication → URL Configuration**, set the site URL and add `https://<your site>/admin.html` to the redirect URLs.
6. Build with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_EVENTS_URL=/api/e` and `VITE_TELEMETRY_HOSTS`, deploy, and open `/admin.html`.

### How the data is kept

- `log_events` validates every field against an allow-list, caps a tab at 2,000 events and 120 a minute, and the whole site at 20,000 a minute.
- Maintenance runs inside `log_events` at most every 10 minutes and on every admin request; no cron job is needed. It rolls closed hours of events and tabs idle for 30 minutes into `event_hours`, then deletes raw rows older than 48 hours.
- `admin_stats` reads `event_hours` plus the raw rows not rolled up yet, and refuses anyone whose signed-in email is not in `overworld_private.admins`.

What is recorded, and what never is: [PRIVACY.md](PRIVACY.md).

## 4. Trying the admin page without a backend

`/admin.html?mock=1` shows the page with generated sample data, in development and in any build.

## 5. The weekly data refresh

`.github/workflows/refresh-data.yml` rebuilds the data weekly when the repository has the API keys as secrets and the variable `REFRESH_ENABLED=true`.
