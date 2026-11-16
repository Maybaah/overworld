# Globe performance, fixture data

- Date: 2026-11-16T02:18:56.702Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `fixture`: 10000 games, 9000 companies, years 1970 to 2026, generatedAt 2026-01-01T00:00:00.000Z
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **FAIL**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

| Scenario | Level | Points | Avg fps | 1% low fps | Median ms | p95 ms | Max ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 79 | 76.4 | 44.3 | 12 | 18 | 24 | 382 | 0.8% | 69 | PASS |
| b-orbit-country | country | 79 | 58.6 | 38.7 | 17.6 | 23.5 | 29.5 | 293 | 11.3% | 53 | FAIL |
| c-orbit-city-europe | city | 597 | 68.7 | 38.2 | 12.1 | 22.7 | 28.6 | 343 | 9.9% | 85 | FAIL |
| d-orbit-company-dense-city | company | 8880 | 12.7 | 9.5 | 76.5 | 99.6 | 105.8 | 63 | 100% | 13 | FAIL |
| e1-year-play-country | country | 79 | 10.4 | 7.6 | 95.4 | 106.8 | 145.8 | 204 | 100% | 9 | FAIL |
| e2-year-play-company | company | 8880 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 4 | FAIL |
| f-game-arcs | company (wanted country) | 8880 | 10.6 | 8.1 | 93.5 | 110.3 | 123.7 | 52 | 100% | 11 | FAIL |
| g-game-filter-toggle | company (wanted country) | 8880 | 11 | 9.4 | 92 | 99.1 | 105.9 | 65 | 100% | 11 | FAIL |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/fixture-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/fixture-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/fixture-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Shanghai (84 companies), slow orbit. Screenshot docs/screenshots/fixture-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2026 at 350 ms/year, country level. Screenshot docs/screenshots/fixture-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2026 at 350 ms/year, company level over Shanghai. Screenshot docs/screenshots/fixture-e2-year-play-company.png
- f-game-arcs: Game selected: Sample Game 6178 (13 roles, 8 role types), arcs animating. Screenshot docs/screenshots/fixture-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Publisher" and "Art / audio" on/off once per second. Screenshot docs/screenshots/fixture-g-game-filter-toggle.png
  - 5 filter toggles; 65 frames over 20 ms, 10 of them within 250 ms after a toggle; worst frame 106 ms; slow frames (ms): 89, 88, 87, 98, 83, 87, 93, 88, 93, 89, 94, 99, 88, 100, 100, 93, 92, 87, 93, 89, 94, 94, 94, 92, 90, 94, 89, 93, 93, 89, 93, 99, 89, 89, 93, 106, 93, 88, 88, 87, 93, 94, 86, 90, 92, 99, 87, 93, 89, 86, 93, 93, 93, 88, 94, 93, 94, 82, 99, 87, 86, 86, 89, 83, 89

## Functional checks

- FAIL **arcs**: expected 12 (from detail data, 9 roles enabled); scene arc objects 0; globe arcsData prop 0
- FAIL **role filter**: "Publisher" aria-pressed true -> false -> true; scene arcs 0 -> 0 (expected 12) -> 0; screenshots differ: true
- PASS **search**: typed "Sample Game 4858", 1 results, first "Sample Game 4858" (is target: true); Enter -> card heading "Sample Game 4858", selectedGameId null
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); points drawn 45 at 1985 vs 79 at 2026; "375 games led worldwide"
- PASS **place click**: clicked US point at (960,540), hover tooltip "United States / 82 games led by 1985"; panel "Place: United States", selectedPlace null; level country -> city
- FAIL **no console errors / failed requests**: 2 console errors, 0 page errors, 2 failed/4xx-5xx requests; excluded as expected on sample data: 0 IGDB cover requests / 0 console messages

## Console and network

- Console errors: 2
  - Failed to load resource: the server responded with a status of 500 (Internal Server Error) http://127.0.0.1:58239/src/myglobe/MyGlobePanel.tsx?t=1794795340858
  - [hmr] Failed to reload /src/myglobe/MyGlobePanel.tsx. This could be due to syntax errors or importing non-existent modules. (see errors above) http://127.0.0.1:58239/@vite/client
- Page errors: 0
- Failed requests: 2
  - HTTP 500 http://127.0.0.1:58239/src/myglobe/MyGlobePanel.tsx?t=1794795340858
  - net::ERR_ABORTED http://127.0.0.1:58239/src/myglobe/MyGlobePanel.tsx?t=1794795340858
- IGDB cover failures (expected on sample data, not counted): 0 requests, 0 console messages

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
