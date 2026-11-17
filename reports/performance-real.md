# Globe performance, real data

- Date: 2026-11-17T00:22:31.756Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `real`: 38983 games, 20813 companies, years 1970 to 2026, generatedAt 2026-11-17T00:19:31.666Z
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **PASS**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

- Satellite imagery: off (Sentinel-2 cloudless 2016 tiles; Points counts places drawn as a cover or a dot, Covers counts covers placed)

| Scenario | Level | Points | Covers | Avg fps | 1% low fps | Median ms | p95 ms | Max ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 102 | 0 | 172.5 | 150 | 5.9 | 6.1 | 7.1 | 862 | 0% | 173 | PASS |
| b-orbit-country | country | 102 | 0 | 150.2 | 23.6 | 6 | 6.5 | 57.1 | 750 | 2.4% | 170 | PASS |
| c-orbit-city-europe | city | 754 | 0 | 170.2 | 152 | 6 | 6.1 | 6.6 | 850 | 0% | 171 | PASS |
| d-orbit-company-dense-city | company | 11672 | 0 | 168.8 | 99.1 | 6 | 6.1 | 12 | 843 | 0% | 170 | PASS |
| e1-year-play-country | country | 102 | 0 | 169 | 108.8 | 6 | 6.1 | 23.5 | 3314 | 0% | 169 | PASS |
| e2-year-play-company | company | 11672 | 0 | 167.9 | 74.6 | 6 | 6.2 | 36.5 | 3292 | 0% | 170 | PASS |
| f-game-arcs | country | 102 | 0 | 169.8 | 151.5 | 6 | 6.1 | 6.7 | 848 | 0% | 170 | PASS |
| g-game-filter-toggle | country | 102 | 0 | 169.5 | 131.1 | 6 | 6.1 | 12.1 | 1016 | 0% | 170 | PASS |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/real-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/real-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/real-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Tokyo (481 companies), slow orbit. Screenshot docs/screenshots/real-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2026 at 350 ms/year, country level. Screenshot docs/screenshots/real-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2026 at 350 ms/year, company level over Tokyo. Screenshot docs/screenshots/real-e2-year-play-company.png
- f-game-arcs: Game selected: Assassin's Creed Valhalla (19 roles, 4 role types), arcs animating. Screenshot docs/screenshots/real-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Other support" and "Publisher" on/off once per second. Screenshot docs/screenshots/real-g-game-filter-toggle.png
  - 5 filter toggles; 0 frames over 20 ms, 0 of them within 250 ms after a toggle; worst frame 12 ms; slow frames (ms): 

## Functional checks

- PASS **arcs**: expected 16 (from detail data, 9 roles enabled); scene arc objects 16; globe arcsData prop 16
- PASS **role filter**: "Other support" aria-pressed true -> false -> true; scene arcs 16 -> 1 (expected 1) -> 16; screenshots differ: true
- PASS **search**: typed "Grandia HD Remaster", 1 results, first "Grandia HD Remaster" (is target: true); Enter -> card heading "Grandia HD Remaster", selectedGameId 107213
- PASS **mosaic covers (country level)**: level country; 1204 mosaic cells, 144225 triangles, built in 1950 ms; 1204 cells showing a cover after 0.1 s (need >= 200), 658 large
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); places drawn (covers + dots) 12 at 1985 vs 102 at 2026; "944 games led worldwide"
- PASS **year rebuilds the mosaic**: 2026 -> 1985: 1204 -> 1200 mosaic cells (need fewer, more than 0)
- PASS **mosaic click**: hovered US centre at (960,540) at level country, tooltip "Life is Strange: True Colors (2021) / Deck Nine, Westminster, US"; click selected game 144765, card "Life is Strange: True Colors"
- PASS **no console errors / failed requests**: 0 console errors, 0 page errors, 0 failed/4xx-5xx requests, 0 IGDB cover failures; 0 map tile failures (listed, not counted: third-party tile server, the globe falls back to the vector look); IGDB cover failures counted on real data

## Console and network

- Console errors: 0
- Page errors: 0
- Failed requests: 0
- IGDB cover failures (counted): 0 requests, 0 console messages
- Map tile failures (listed, not counted): 0

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
