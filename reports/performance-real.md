# Globe performance, real data

- Date: 2026-11-16T08:16:31.312Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `real`: 9966 games, 6241 companies, years 1970 to 2026, generatedAt 2026-11-16T07:40:16.218Z
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **PASS**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

- Satellite imagery: on (Sentinel-2 cloudless 2016 tiles; Points counts places drawn as a cover or a dot, Covers counts covers placed)

| Scenario | Level | Points | Covers | Avg fps | 1% low fps | Median ms | p95 ms | Max ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 74 | 16 | 240 | 232.6 | 4.2 | 4.3 | 4.3 | 1199 | 0% | 240 | PASS |
| b-orbit-country | country | 74 | 22 | 238.2 | 132.6 | 4.2 | 4.3 | 12.6 | 1191 | 0% | 240 | PASS |
| c-orbit-city-europe | city | 483 | 90 | 240 | 232.6 | 4.2 | 4.3 | 4.3 | 1199 | 0% | 240 | PASS |
| d-orbit-company-dense-city | company | 4880 | 27 | 239.8 | 215.4 | 4.2 | 4.3 | 8.3 | 1198 | 0% | 240 | PASS |
| e1-year-play-country | country | 74 | 21 | 239.8 | 211.1 | 4.2 | 4.3 | 16.6 | 4699 | 0% | 235 | PASS |
| e2-year-play-company | company | 4880 | 27 | 239.9 | 219.7 | 4.2 | 4.3 | 12.4 | 4702 | 0% | 240 | PASS |
| f-game-arcs | country | 74 | 14 | 239.8 | 215.8 | 4.2 | 4.3 | 8.2 | 1198 | 0% | 240 | PASS |
| g-game-filter-toggle | country | 74 | 14 | 238.2 | 137.2 | 4.2 | 4.3 | 12.6 | 1429 | 0% | 238 | PASS |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/real-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/real-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/real-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Tokyo (302 companies), slow orbit. Screenshot docs/screenshots/real-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2026 at 350 ms/year, country level. Screenshot docs/screenshots/real-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2026 at 350 ms/year, company level over Tokyo. Screenshot docs/screenshots/real-e2-year-play-company.png
- f-game-arcs: Game selected: Assassin's Creed Shadows (16 roles, 4 role types), arcs animating. Screenshot docs/screenshots/real-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Other support" and "Port" on/off once per second. Screenshot docs/screenshots/real-g-game-filter-toggle.png
  - 5 filter toggles; 0 frames over 20 ms, 0 of them within 250 ms after a toggle; worst frame 13 ms; slow frames (ms): 

## Functional checks

- PASS **arcs**: expected 15 (from detail data, 9 roles enabled); scene arc objects 15; globe arcsData prop 15
- PASS **role filter**: "Other support" aria-pressed true -> false -> true; scene arcs 15 -> 2 (expected 2) -> 15; screenshots differ: true
- PASS **search**: typed "Knights of the Round", 1 results, first "Knights of the Round" (is target: true); Enter -> card heading "Knights of the Round", selectedGameId 6816
- PASS **cover images (country level)**: level country; 21 covers placed, 21 of them showing their loaded image after 0.2 s (need >= 20); 287 images uploaded to the atlas so far
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); places drawn (covers + dots) 5 at 1985 vs 74 at 2026; "208 games led worldwide"
- PASS **year changes covers**: same view, 2026 -> 1985: 21 -> 1 covers; 1 places have a cover in both years, 1 of them now show a different game (need >= 1)
- PASS **place click**: clicked US point at (960,540), hover tooltip "Portal 2 / United States / 2586 games led by 2026"; panel "Place: United States", selectedPlace {"level":"country","key":"US"}; level country -> city
- PASS **no console errors / failed requests**: 0 console errors, 0 page errors, 0 failed/4xx-5xx requests, 0 IGDB cover failures; 0 map tile failures (listed, not counted: third-party tile server, the globe falls back to the vector look); IGDB cover failures counted on real data

## Console and network

- Console errors: 0
- Page errors: 0
- Failed requests: 0
- IGDB cover failures (counted): 0 requests, 0 console messages
- Map tile failures (listed, not counted): 0

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
