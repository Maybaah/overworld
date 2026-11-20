# Architecture

Overworld has three parts that only talk through files:

```
 outside APIs ──► pipeline/ ──► web/public/data/*.json ──► web/ (the app) ──► browser
 (IGDB, Steam,     Node, run      static files, shape        React + three.js
  Wikidata, …)     by hand or     fixed by shared/model.ts
                   weekly in CI
                                                   web/server/worker.ts ◄── /api/steam, /api/e
                                                           │
                                                           └──► Supabase (usage stats) ──► /admin.html
```

- **pipeline/** fetches, merges and validates. It never runs in the browser.
- **shared/model.ts** is the contract: the types of every file the pipeline writes and the app reads. Change it on purpose, in its own commit, and bump `SCHEMA_VERSION`.
- **web/** is a static site. It needs no server except the small Worker for My globe and usage stats.

Start reading at the module that owns what you want to change; each section below says which files that is.

## Repository layout

```
shared/model.ts         data contract between pipeline and app
pipeline/src/           run.ts (stage runner), stages/ (one file per source), merge.ts, validate.ts
pipeline/data/          hand-kept corrections, each with an evidence link
web/src/data/           loading, indexes, search, timeline, the app store
web/src/globe/          the 3D globe: camera, layers, mosaic, picking
web/src/ui/             overlay chrome: search, panels, year slider, nav
web/src/insights/       Insights mode
web/src/myglobe/        My globe mode (Steam library)
web/src/guess/          Guess mode (built, not listed in the nav)
web/src/share/          share links, share cards, URL state
web/src/telemetry/      anonymous usage events
web/src/admin/          /admin.html stats page
web/server/             Cloudflare Worker: Steam relay and events relay
web/scripts/            build-time steps: sprites, mosaic layouts, share and search pages, OG image, frame-rate check
supabase/               usage stats schema and its tests
scripts/                Supabase helper
```

## Pipeline

`npm run pipeline` runs the stages in this order. Each one writes a stage file to `pipeline/.cache/stage/` (types in `pipeline/src/raw.ts`) and is skipped next time unless `--refresh` is given. `--only=a,b` runs some stages.

| Stage | File | What it adds |
| --- | --- | --- |
| steamspy | `stages/steamspy.ts` | Steam apps with owner bands and review counts |
| rawg | `stages/rawg.ts` | RAWG games and how many users added them |
| igdb | `stages/igdb.ts` | the game set: every IGDB main game, remake or remaster with enough estimated players; companies and roles |
| countries | `stages/countries.ts`, `stages/countryGames.ts` | each country's best games even below the player floor, plus the hand list `pipeline/data/country-games.json` |
| wikidata | `stages/wikidata.ts` | company headquarters and coordinates |
| people | `stages/people.ts` | key people per game from Wikidata (creator, director, producer, designer, writer, art director, programmer, composer, sound designer), shown on the game card and game pages |
| population | `stages/population.ts` | country populations for per-capita figures |
| mobygames | `stages/mobygames.ts` | extra developer and publisher credits for the most played games |
| merge | `merge.ts` | the final model; pure, no network or files |
| validate | `validate.ts` | checks the output, writes `reports/validation.md` |

Rules worth knowing before changing `merge.ts`:

- **Players** (`audience.ts`): the strongest of Steam reviews × 40, IGDB "Played" share, RAWG adds and IGDB rating count. The relative signals are scaled by their median ratio to Steam over games that have both.
- **Lead studio** (`GameSummary.leadBasis`): hand override, then the only IGDB developer, then a Wikidata-confirmed developer, then drop port houses and studios outside the country of origin, then the first entered.
- **Location** (`Company.locationBasis`): hand correction, Wikidata headquarters, located-in, place of formation, the parent's city for internal divisions, then the country of the games the studio leads. Studios sit where they are now, not where each game was made. Dissolved states map to today's state that holds the city (`countries.ts`).
- Studios and games IGDB lacks get ids from 1,900,000,000 up and source `curated`.

## Data files

Written to `web/public/data/` (git-ignored; `npm run fixture` writes sample data to `web/public/data-fixture/`).

| File | Type | Loaded |
| --- | --- | --- |
| `meta.json` | `DataMeta` | at start |
| `companies.json` | `Company[]` | at start |
| `games.json` | `GameSummary[]`, most played first | at start |
| `details/<n>.json` | `GameDetail[]` for games `n × 250 …` in `games.json` | when a game opens |
| `company-games.json` | `CompanyGamesFile`: per company, flat pairs `[gameId, roleIndex, …]`, `roleIndex` into `ROLE_TYPES` | when a studio opens |
| `steam.json` | Steam app id → game id | My globe |
| `stats.json`, `flows.json` | `StatsFile`, `FlowsFile` | Insights |
| `covers/sprite-<n>.webp`, `mosaic-layouts.bin` | cover sheets and fitted mosaics, from `npm run sprites` and `npm run layouts` | at start |

`Company.precision` is `city` (coordinates of the city), `country` (country centre) or `none` (not drawn, listed in the validation report). Covers are IGDB `image_id`s; the app builds the URL.

## The app

### State

One zustand store, `web/src/data/store.ts`. Panels call its actions (`selectGame`, `selectPlace`, `setMode`, `setYear`, `flyTo` …); the globe and panels read from it. No component talks to another directly. `share/urlState.ts` mirrors the store into the address bar and back, so every view has a link.

`data/indexes.ts` builds lookup maps once after load; `data/timeline.ts` precomputes, for every year, which games each country, city and studio has; `data/search.ts` ranks titles.

### Screen

`App.tsx` mounts `globe/GlobeView.tsx` (the canvas) and `ui/Overlay.tsx` (everything on top). The overlay picks the panels by mode:

| Mode | Left | Right |
| --- | --- | --- |
| explore | `ui/PlacePanel` | `ui/GameCard` |
| myglobe | `myglobe/MyGlobePanel` | `ui/GameCard` |
| insights | `insights/InsightsPanel` | `ui/GameCard` |
| guess | – | `guess/GuessPanel` |

### Globe

`GlobeView.tsx` sets up react-globe.gl and adds its own three.js layers:

| Layer | File | Draws |
| --- | --- | --- |
| countries | `countriesLayer.ts`, `fill.ts` | land fill and borders |
| mosaic | `mosaicLayer.ts`, `mosaic/` | every country filled with its games' covers |
| covers | `coversLayer.ts`, `coverSelect.ts` | floating covers of each place's top game, used when the mosaic is off (Insights shading, Guess) |
| points | `pointsLayer.ts`, `levels.ts` | country, city and studio points; not drawn, but they decide the zoom level and what a click opens |
| markers | `markersLayer.ts` | rings and pins from My globe and Guess |
| arcs | `arcs.ts` (react-globe.gl arcs) | lead studio to every other company, colored by role |
| labels | `mapLabels.ts`, `labels.ts`, `labelPlacement.ts` | country names |

`controls.ts` is the camera (drag, inertia, log-scale zoom), `flight.ts` scripted flights, `picking.ts` and `pointer.ts` what is under the pointer.

### The mosaic

The part with the most moving pieces:

1. `mosaic/build.ts` lays out every country with one template: the most played game sits at the country's core (the inland point farthest from its border), the rest spiral outward by the golden angle in order of popularity. A power diagram (a weighted Voronoi treemap, `mosaic/geometry.ts`) in an equal-area projection then fits each cell's area to popularity^0.7. The selected game is always added to its country, so search can fly to its card.
2. The whole-globe view has about 1,500 cells shared by √(games × area). With zoom detail on (`zoomDetail` in the store, off by default, kept in localStorage), zooming in adds cells for the countries in view, in steps, up to every game.
3. It runs in a worker (`mosaic/mosaic.worker.ts`, messages in `mosaic/protocol.ts`). The worker keeps only the latest request and prefetches the next year.
4. `npm run layouts` fits every year once into `mosaic-layouts.bin` (format in `mosaic/layouts.ts`), so moving the year slider only cuts cells.
5. `mosaicLayer.ts` draws it. Small covers come from sprite sheets packed by `npm run sprites`; sharper tiers load into atlases (`coverAtlas.ts`) only when a cell is big enough on screen, and fade in over the blurrier one. A sharp cover keeps its slot while it stays on screen, so turning the globe never drops a visible cover back to a blurrier one. The sharp atlases have no mipmaps, so the shader averages several taps when a cover is drawn smaller than its slot. Games without a cover get a title card (`titleCovers.ts`).

## Pages built from the data

`npm run build` ends with `web/scripts/build-share-pages.mjs`, which writes plain HTML next to the app:

- `g/<id>/` for the 10,000 most played games: a page with the cover, lead studio, place, genres, platforms, every company with its roles, and `VideoGame` structured data. It is in the sitemap. Links shared from the app add `?share`, and only then `go.js` sends the visitor on to the globe.
- `countries/` and `countries/<name>/`, and `studios/<name>/` for every studio that led at least three games (`seo-pages.mjs`). These are real pages for search engines and people without the globe: games, studios, cities and facts, each linking into the app with `?game=` or `?place=`.
- No page has an inline script: `go.js` does the redirects, so `web/public/_headers` can forbid inline scripts in its Content Security Policy.
- `sitemap.xml` listing the home page and those pages, and `robots.txt`, which keeps the admin page out. The home page also gets its canonical and preview-image tags here, since they need the absolute `SITE_URL`.

## Server

`web/server/worker.ts` is one Cloudflare Worker with two routes. Both handlers use only web-standard APIs, so the Steam one also runs as Vite middleware in development (`vitePlugin.ts`).

- `GET /api/steam/owned` (`steamProxy.ts`): resolves a Steam profile and returns its owned games, keeping `STEAM_API_KEY` off the browser.
- `POST /api/e` (`eventsRelay.ts`): forwards usage events to Supabase with the visitor's country from the edge.

## Usage stats

```
web/src/telemetry  ──batch──►  /api/e  ──►  log_events()  ──►  events, event_sessions
                                                                   │ hourly rollup, 48 h prune
                                                                   ▼
/admin.html (web/src/admin)  ◄──  admin_stats()  ◄──  event_hours + not yet rolled rows
```

- `telemetry/telemetry.ts` queues events and sends them in batches; `telemetry/wiring.ts` turns store changes into events. Explicit `track()` calls sit in search, share, My globe and Insights.
- `supabase/migrations/0001_telemetry.sql` holds the tables and functions; `supabase/telemetry.test.ts` runs them in PGlite.
- What is recorded: [PRIVACY.md](PRIVACY.md). How to set it up: [SELF-HOSTING.md](SELF-HOSTING.md).

## Tests

| Command | Covers |
| --- | --- |
| `npm run test:pipeline` | pipeline stages and merge rules, shared types, the Supabase schema |
| `npm run test:web` | data layer, globe math, panels (Testing Library), share pages, Worker routes, admin |
| `node web/scripts/measure.mjs --data=real` | frame rate and behaviour in a real Chrome; not in CI |

Tests sit next to the file they test (`foo.ts` → `foo.test.ts`).
