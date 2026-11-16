# Globe performance, real data

- Date: 2026-11-16T22:52:00.083Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `real`: 35255 games, 19182 companies, years 1970 to 2026, generatedAt 2026-11-16T22:49:46.588Z
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **PASS**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

- Satellite imagery: off (Sentinel-2 cloudless 2016 tiles; Points counts places drawn as a cover or a dot, Covers counts covers placed)

| Scenario | Level | Points | Covers | Avg fps | 1% low fps | Median ms | p95 ms | Max ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 102 | 0 | 226.6 | 114.2 | 4.2 | 8.3 | 12.6 | 1132 | 0% | 220 | PASS |
| b-orbit-country | country | 102 | 0 | 220 | 118.5 | 4.2 | 8.3 | 8.5 | 1100 | 0% | 240 | PASS |
| c-orbit-city-europe | city | 737 | 0 | 160.8 | 79.8 | 4.3 | 8.4 | 12.6 | 804 | 0% | 166 | PASS |
| d-orbit-company-dense-city | company | 11078 | 0 | 166.4 | 63.6 | 4.2 | 8.4 | 20.7 | 832 | 0.1% | 151 | PASS |
| e1-year-play-country | country | 102 | 0 | 237.4 | 114.8 | 4.2 | 4.3 | 16.8 | 4654 | 0% | 240 | PASS |
| e2-year-play-company | company | 11078 | 0 | 230.3 | 80.3 | 4.2 | 4.3 | 25.1 | 4513 | 0.1% | 202 | PASS |
| f-game-arcs | country | 102 | 0 | 240 | 232.6 | 4.2 | 4.3 | 4.3 | 1199 | 0% | 240 | PASS |
| g-game-filter-toggle | country | 102 | 0 | 238 | 131.2 | 4.2 | 4.3 | 20.9 | 1427 | 0.1% | 240 | PASS |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/real-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/real-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/real-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Tokyo (477 companies), slow orbit. Screenshot docs/screenshots/real-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2026 at 350 ms/year, country level. Screenshot docs/screenshots/real-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2026 at 350 ms/year, company level over Tokyo. Screenshot docs/screenshots/real-e2-year-play-company.png
- f-game-arcs: Game selected: Assassin's Creed Valhalla (19 roles, 4 role types), arcs animating. Screenshot docs/screenshots/real-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Other support" and "Publisher" on/off once per second. Screenshot docs/screenshots/real-g-game-filter-toggle.png
  - 5 filter toggles; 2 frames over 20 ms, 0 of them within 250 ms after a toggle; worst frame 21 ms; slow frames (ms): 21, 21

## Functional checks

- PASS **arcs**: expected 16 (from detail data, 9 roles enabled); scene arc objects 16; globe arcsData prop 16
- PASS **role filter**: "Other support" aria-pressed true -> false -> true; scene arcs 16 -> 1 (expected 1) -> 16; screenshots differ: true
- PASS **search**: typed "Doorways: The Underworld", 1 results, first "Doorways: The Underworld" (is target: true); Enter -> card heading "Doorways: The Underworld", selectedGameId 7677
- PASS **mosaic covers (country level)**: level country; 1208 mosaic cells, 144650 triangles, built in 1892 ms; 1208 cells showing a cover after 0.1 s (need >= 200), 762 large
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); places drawn (covers + dots) 12 at 1985 vs 102 at 2026; "874 games led worldwide"
- PASS **year rebuilds the mosaic**: 2026 -> 1985: 1208 -> 1199 mosaic cells (need fewer, more than 0)
- PASS **mosaic click**: hovered US centre at (960,540) at level country, tooltip "Friday the 13th: The Game (2017) / Illfonic, Denver, US"; click selected game 14389, card "Friday the 13th: The Game"
- PASS **no console errors / failed requests**: 0 console errors, 0 page errors, 0 failed/4xx-5xx requests, 0 IGDB cover failures; 0 map tile failures (listed, not counted: third-party tile server, the globe falls back to the vector look); IGDB cover failures counted on real data

## Console and network

- Console errors: 0
- Page errors: 0
- Failed requests: 0
- IGDB cover failures (counted): 0 requests, 0 console messages
- Map tile failures (listed, not counted): 0

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
