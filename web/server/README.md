# Steam proxy

Keeps `STEAM_API_KEY` off the browser. One route: `GET /api/steam/owned?profile=<link, vanity name or SteamID64>`.

`steamProxy.ts` uses only web-standard APIs and runs unchanged in Node 22+, in Vite middleware (`vite dev` and `vite preview`, via `vitePlugin.ts`) and in a Cloudflare Worker (`worker.ts`).

## Environment values

- `STEAM_API_KEY` (required): from https://steamcommunity.com/dev/apikey. Locally, put it in the repo-root `.env`; the Vite plugin reads it there and never exposes it to client code. On a Worker, set it as a secret.
- `ALLOWED_ORIGIN` (optional): one origin, for example `https://overworld.example`, that may call the proxy from another origin. Without it the proxy sends no CORS headers (same-origin only).

## Deploying the Worker

Deploying is your decision. With Wrangler, point `main` at `web/server/worker.ts`, add the secret with `wrangler secret put STEAM_API_KEY`, and route `/api/steam/*` to it.

If the static site is hosted on a different origin from the Worker, build it with `VITE_STEAM_PROXY_URL` set to the Worker's origin (no trailing slash), and set `ALLOWED_ORIGIN` on the Worker to the site's origin.

The cache (10 minutes per Steam id) and the rate limit (20 requests per minute per client address) are in memory per instance, so they reset when an instance restarts and are not shared between instances.
