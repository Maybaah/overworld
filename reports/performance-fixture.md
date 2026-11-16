# Globe performance, fixture data

- Date: 2026-11-16T02:05:52.190Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `fixture`: 10000 games, 9000 companies, years 1970 to 2026
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **PASS**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

| Scenario | Level | Points | Avg fps | 1% low fps | Median ms | p95 ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 79 | 88.6 | 55.5 | 11.8 | 17 | 443 | 0% | 89 | PASS |
| b-orbit-country | country | 79 | 88.5 | 55.2 | 11.9 | 16.4 | 443 | 0% | 89 | PASS |
| c-orbit-city-europe | city | 597 | 90.7 | 55.7 | 11.6 | 12.6 | 453 | 0% | 90 | PASS |
| d-orbit-company-dense-city | company | 8880 | 93.3 | 55.6 | 11.6 | 12.5 | 467 | 0% | 91 | PASS |
| e1-year-play-country | country | 79 | 88.5 | 54.4 | 11.8 | 16.7 | 1734 | 0.1% | 87 | PASS |
| e2-year-play-company | company | 8880 | 86.4 | 50.5 | 11.6 | 17.5 | 1695 | 0.3% | 80 | PASS |
| f-game-arcs | country | 79 | 71.9 | 53.9 | 12 | 18 | 359 | 0% | 67 | PASS |
| g-game-filter-toggle | country | 79 | 69.4 | 42.4 | 12.2 | 18.1 | 416 | 1.4% | 75 | PASS |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/fixture-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/fixture-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/fixture-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Shanghai (84 companies), slow orbit. Screenshot docs/screenshots/fixture-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2026 at 350 ms/year, country level. Screenshot docs/screenshots/fixture-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2026 at 350 ms/year, company level over Shanghai. Screenshot docs/screenshots/fixture-e2-year-play-company.png
- f-game-arcs: Game selected: Sample Game 6178 (13 roles, 8 role types), arcs animating. Screenshot docs/screenshots/fixture-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Publisher" and "Art / audio" on/off once per second. Screenshot docs/screenshots/fixture-g-game-filter-toggle.png
  - 5 filter toggles; 6 frames over 20 ms, 5 of them within 250 ms after a toggle; worst frame 25 ms; slow frames (ms): 22, 23, 23, 23, 25, 25

## Functional checks

- PASS **arcs**: expected 12 (from detail data, 9 roles enabled); scene arc objects 12; globe arcsData prop 12
- PASS **role filter**: "Publisher" aria-pressed true -> false -> true; scene arcs 12 -> 8 (expected 8) -> 12; screenshots differ: true
- PASS **search**: typed "Sample Game 4858", 1 results, first "Sample Game 4858" (is target: true); Enter -> card heading "Sample Game 4858", selectedGameId 15573
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); points drawn 45 at 1985 vs 79 at 2026; "375 games led worldwide"
- PASS **place click**: clicked US point at (960,540), hover tooltip "United States / 2290 games led by 2026"; panel "Place: United States", selectedPlace {"level":"country","key":"US"}; level country -> city
- PASS **no console errors / failed requests**: 0 console errors, 0 page errors, 0 failed/4xx-5xx requests; excluded as expected on sample data: 0 IGDB cover requests / 0 console messages

## Console and network

- Console errors: 0
- Page errors: 0
- Failed requests: 0
- IGDB cover failures (expected on sample data, not counted): 0 requests, 0 console messages

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
