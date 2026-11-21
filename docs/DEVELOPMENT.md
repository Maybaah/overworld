# Developing Overworld

Everything you need to run, test and change Overworld on your own machine. To put it on the internet, see [SELF-HOSTING.md](SELF-HOSTING.md). How the code fits together: [ARCHITECTURE.md](ARCHITECTURE.md).

## Quick start

Node 22 or newer.

```bash
git clone https://github.com/Maybaah/overworld.git
cd overworld
npm install
npm run fixture
npm run dev
```

The app opens at `http://localhost:5173` on 10,000 obviously fake games, with no API keys. `/admin.html?mock=1` shows the usage stats page with sample numbers.

## With real data

Copy `.env.example` to `.env`, fill in the keys, then build the data:

```bash
npm run pipeline
npm run sprites
npm run layouts
npm run dev:real
```

The first pipeline run takes hours, mostly MobyGames' rate limit. Every response is cached in `pipeline/.cache/`, and stages that already ran are skipped, so an interrupted run picks up where it stopped. `-- --refresh` fetches again; `-- --only=merge,validate` reruns single stages.

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | IGDB, required | <https://dev.twitch.tv/console/apps> |
| `RAWG_API_KEY` | console and older games | <https://rawg.io/apidocs> |
| `MOBYGAMES_API_KEY` | extra credits, optional | <https://www.mobygames.com/info/api/> |
| `STEAM_API_KEY` | My globe | <https://steamcommunity.com/dev/apikey> |
| `WIKIDATA_USER_AGENT_CONTACT` | a contact for Wikidata's API policy | a URL or email of your choice |

Keys live only in `.env`, which is git-ignored.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | the app on sample data |
| `npm run dev:real` | the app on real data from `web/public/data/` |
| `npm test` | all tests; `test:pipeline` and `test:web` run one side |
| `npm run typecheck` | TypeScript, pipeline and app |
| `npm run build` | production build into `web/dist/`, with `/admin.html` and share pages |
| `npm run deploy` | build and deploy to Cloudflare (`wrangler.toml`) |
| `npm run data:upload` | upload `web/public/data/` to the `data` GitHub release, which the push deploy builds from |
| `npm run data:download` | replace `web/public/data/` with the copy from that release |
| `npm run pipeline` | fetch, merge, write and validate the data |
| `npm run sprites`, `npm run layouts` | cover sprite sheets and yearly mosaic layouts, after the pipeline |
| `npm run supabase -- migrate` | apply the usage stats schema to your Supabase project |

## Project layout

```
shared/model.ts   the data contract between the pipeline and the app
pipeline/         fetch stages, merge, validation, hand-kept corrections
web/src/          data layer, globe, panels, modes, sharing, telemetry, admin page
web/server/       the Cloudflare Worker: Steam relay and events relay
web/scripts/      build steps: sprites, mosaic layouts, share pages
supabase/         usage stats schema and its tests
docs/             architecture, development, self-hosting, privacy, API research
```

## Before a pull request

```bash
npm run typecheck
npm test
npm run build
```

All three must pass; CI runs the same. The ground rules are in [CONTRIBUTING.md](../CONTRIBUTING.md).
