# Third-party notices

Overworld's own code is under the [MIT License](LICENSE). It ships, or is built from, the work of others listed here, each under its own terms. The full dependency tree with exact versions is in `package-lock.json`; each package's license text is in `node_modules/<package>/LICENSE` after `npm install`.

## Libraries in the built site

These are bundled into `web/dist/`.

| Library | License | Author |
| --- | --- | --- |
| [React](https://react.dev), React DOM | MIT | Meta Platforms, Inc. and affiliates |
| [three.js](https://threejs.org) | MIT | three.js authors |
| [globe.gl](https://github.com/vasturiano/globe.gl), [react-globe.gl](https://github.com/vasturiano/react-globe.gl) and their kapsule, three-render-objects and tween helpers | MIT | Vasco Asturiano and others |
| [zustand](https://github.com/pmndrs/zustand) | MIT | Paul Henschel |
| [d3](https://d3js.org) modules (array, color, delaunay, format, geo, geo-voronoi, interpolate, scale, selection, time, tricontour), [internmap](https://github.com/mbostock/internmap) | ISC | Mike Bostock and others |
| [topojson-client](https://github.com/topojson/topojson-client) | ISC | Mike Bostock |
| [delaunator](https://github.com/mapbox/delaunator), [earcut](https://github.com/mapbox/earcut) | ISC | Volodymyr Agafonkin, Mapbox |
| [robust-predicates](https://github.com/mourner/robust-predicates) | Unlicense | Volodymyr Agafonkin |
| [h3-js](https://github.com/uber/h3-js) | Apache-2.0 | Uber Technologies, Inc. |
| [Turf](https://turfjs.org) (boolean-point-in-polygon, helpers, invariant), [point-in-polygon-hao](https://github.com/rowanwins/point-in-polygon-hao) | MIT | Turf contributors, Rowan Winsemius |
| [Tween.js](https://github.com/tweenjs/tween.js) | MIT | tween.js authors |
| [polished](https://polished.js.org) | MIT | Brian Hough and others |
| [Preact](https://preactjs.com) | MIT | Jason Miller and others |
| [lodash-es](https://lodash.com) | MIT | OpenJS Foundation and others |
| [Supabase JS](https://github.com/supabase/supabase-js), only in `/admin.html` | MIT | Supabase |
| [tslib](https://github.com/microsoft/tslib) | 0BSD | Microsoft Corporation |

The Apache-2.0 license of h3-js asks that its notice travel with copies; its `LICENSE` file is in `node_modules/h3-js/`.

## Fonts

| Font | License | Author |
| --- | --- | --- |
| [Geist Sans and Geist Mono](https://vercel.com/font), through [Fontsource](https://fontsource.org) | SIL Open Font License 1.1 | Vercel, with basement.studio |

The fonts are bundled into the site and embedded in the default share image (`web/public/og-default.png`). The license text is in `node_modules/@fontsource/geist-sans/LICENSE`.

## Map and place data

| Data | Used for | License |
| --- | --- | --- |
| [Natural Earth](https://www.naturalearthdata.com), through [world-atlas](https://github.com/topojson/world-atlas) by Mike Bostock (ISC) | country shapes and borders on the globe | public domain |
| [world-countries](https://github.com/mledoze/countries) by Mohammed Le Doze | country names, regions, areas and centres in the pipeline | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1.0/) |
| [GeoNames](https://www.geonames.org), through [all-the-cities](https://github.com/zeke/all-the-cities) by Zeke Sikelianos (MIT) | city coordinates for hand corrections and the hand-kept country list | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Wikidata](https://www.wikidata.org) | studio headquarters and coordinates, country populations | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

## Game data

The pipeline builds `web/public/data/` from these sources. The data is not in this repository; a deployed site serves it, and it keeps each source's terms.

| Source | Used for | Terms |
| --- | --- | --- |
| [IGDB](https://www.igdb.com), through the Twitch API | games, companies, roles, genres, covers | [IGDB API terms](https://api-docs.igdb.com/#about) |
| [MobyGames](https://www.mobygames.com) | extra developer and publisher credits | [MobyGames API terms](https://www.mobygames.com/info/api/) |
| [RAWG](https://rawg.io) | player signals; each game card links its RAWG page, as RAWG asks | [RAWG API terms](https://rawg.io/apidocs) |
| [SteamSpy](https://steamspy.com), Steam store and Steam Web API | player estimates, review counts, the libraries in My globe | [Steam Web API terms](https://steamcommunity.com/dev/apiterms) |

Game titles, cover art and screenshots belong to their publishers and developers. Covers are loaded from IGDB's image service; `npm run sprites` packs small copies of them into sprite sheets for the globe. The screenshots in `docs/readme/` show these covers.

Overworld is not affiliated with or endorsed by IGDB, Twitch, Wikidata, MobyGames, RAWG, SteamSpy, Valve or any game company.

## Build and test tools

Vite, TypeScript, Vitest, Testing Library, jsdom, tsx, sharp, Puppeteer, PGlite and the other `devDependencies` are used to build and test Overworld and are not part of the built site. Each is under its own license, listed in `package-lock.json`.
