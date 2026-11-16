# Globe performance, real data

- Date: 2026-11-16T02:07:38.422Z
- GPU renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)` (vendor `Google Inc. (NVIDIA)`)
- Browser: Chrome/157.0.8103.51, headful, viewport 1920x1080 at devicePixelRatio 1
- Server: vite dev server (unminified React development build), data set `real`: 9966 games, 6241 companies, years 1970 to 2027
- Pass criterion per scenario: average >= 58 fps and p95 frame time <= 20 ms, and the camera reached the intended zoom level
- Overall: **FAIL**

Frame times come from a requestAnimationFrame loop inside the page. 1% low is 1000 divided by the mean of the slowest 1% of frames. Year-play scenarios cover the whole sweep, not 5 seconds.

| Scenario | Level | Points | Avg fps | 1% low fps | Median ms | p95 ms | Frames | >20 ms | App fps | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| a-idle-country | country | 73 | 87.8 | 55.6 | 11.9 | 12.8 | 438 | 0% | 87 | PASS |
| b-orbit-country | country | 73 | 88.9 | 55.5 | 11.9 | 16.7 | 444 | 0% | 85 | PASS |
| c-orbit-city-europe | city | 474 | 90 | 55.5 | 11.6 | 13 | 450 | 0% | 90 | PASS |
| d-orbit-company-dense-city | company | 4885 | 91.4 | 55.1 | 11.8 | 16.3 | 456 | 0% | 91 | PASS |
| e1-year-play-country | country | 73 | 88.4 | 55.3 | 11.7 | 16.9 | 1764 | 0% | 89 | PASS |
| e2-year-play-company | company | 4885 | 81 | 46.3 | 12 | 18 | 1616 | 0.7% | 79 | PASS |
| f-game-arcs | country | 73 | 71.6 | 51 | 12.1 | 18.1 | 358 | 0.3% | 69 | PASS |
| g-game-filter-toggle | country | 73 | 70.4 | 39.4 | 12.1 | 18 | 422 | 1.7% | 72 | PASS |

- a-idle-country: Idle at country level (default view, default slow auto-rotate). Screenshot docs/screenshots/real-a-idle-country.png
- b-orbit-country: Orbiting continuously at country level. Screenshot docs/screenshots/real-b-orbit-country.png
- c-orbit-city-europe: City level over Europe, slow orbit. Screenshot docs/screenshots/real-c-orbit-city-europe.png
- d-orbit-company-dense-city: Company level over Tokyo (266 companies), slow orbit. Screenshot docs/screenshots/real-d-orbit-company-dense-city.png
- e1-year-play-country: Year slider playing 1970 to 2027 at 350 ms/year, country level. Screenshot docs/screenshots/real-e1-year-play-country.png
- e2-year-play-company: Year slider playing 1970 to 2027 at 350 ms/year, company level over Tokyo. Screenshot docs/screenshots/real-e2-year-play-company.png
- f-game-arcs: Game selected: Assassin's Creed Shadows (16 roles, 4 role types), arcs animating. Screenshot docs/screenshots/real-f-game-arcs.png
- g-game-filter-toggle: Same game, toggling "Other support" and "Port" on/off once per second. Screenshot docs/screenshots/real-g-game-filter-toggle.png
  - 5 filter toggles; 7 frames over 20 ms, 6 of them within 250 ms after a toggle; worst frame 29 ms; slow frames (ms): 24, 29, 23, 23, 23, 29, 22

## Functional checks

- PASS **arcs**: expected 15 (from detail data, 9 roles enabled); scene arc objects 15; globe arcsData prop 15
- PASS **role filter**: "Other support" aria-pressed true -> false -> true; scene arcs 15 -> 2 (expected 2) -> 15; screenshots differ: true
- PASS **search**: typed "Knights of the Round", 1 results, first "Knights of the Round" (is target: true); Enter -> card heading "Knights of the Round", selectedGameId 6816
- PASS **year slider**: keyboard on slider; readout "1985" (range 1985); points drawn 5 at 1985 vs 73 at 2027; "208 games led worldwide"
- FAIL **place click**: clicked US point at (960,540), hover tooltip "United States / 2598 games led by 2027"; panel "null", selectedPlace {"level":"country","key":"US"}; level country -> country
- PASS **no console errors / failed requests**: 0 console errors, 0 page errors, 0 failed/4xx-5xx requests, 0 IGDB cover failures; IGDB cover failures counted on real data

## Console and network

- Console errors: 0
- Page errors: 0
- Failed requests: 0
- IGDB cover failures (counted): 0 requests, 0 console messages

## Launch attempts

- headful: `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER (0x00001F06) Direct3D11 vs_5_0 ps_5_0, D3D11)`
