# Independent review: Phases 2-4 (Overworld)

Method: production build (VITE_BASE=/overworld/, VITE_DATA_BASE=/overworld/data, SITE_URL=https://example.github.io/overworld, as in the deploy workflow) served by `vite preview --base /overworld/`; headful Chrome 1920x1080, temp profile, own puppeteer-core scripts in the scratchpad (outside the repo). Screenshots: docs/screenshots/review/.

## 1. Build and tests
- `npx tsc -b`: exit 0.
- `npm test`: 45 files, 454 tests, all pass (includes steamInput.test.ts, share/urlState, build-share-pages tests).
- `npm run build` (SITE_URL set): passes; 9,968 share pages written (9,966 games + 2 generic). Only a >500 kB chunk warning (main JS 2.36 MB, 689 kB gzip).
- Share pages: dist/g/127, 5204, 116053, 11065 checked. Title/og:title/twitter:title/description are HTML-escaped: `Assassin&#39;s Creed II`, `Spy Fox in &quot;Dry Cereal&quot;`, `Emily is Away &lt;3`, `Ratchet &amp; Clank`. og:url/canonical absolute, og:image = IGDB cover (t_720p), twitter:card summary_large_image. Page does `location.replace(<base>?game=ID)`.
- Note: with only SITE_URL set (no VITE_BASE) the app is built for base "/" while share pages redirect to "/overworld/" (build-share-pages derives base from SITE_URL, vite does not). The CI deploy sets VITE_BASE, so deploy is fine; a local build per the brief is inconsistent.

## 2a. Frame times (6 s each, own rAF loop, GPU: ANGLE (NVIDIA GeForce RTX 2060 SUPER, Direct3D11); display ~240 Hz)
| Scenario | avg fps | 1% low | median ms | p95 ms |
|---|---|---|---|---|
| idle default | 240 | 219 | 4.2 | 4.3 |
| orbiting (mouse drag) | 239.9 | 211 | 4.2 | 4.3 |
| city level, Europe (flown to Warsaw, wheel-zoomed, 60 covers) | 173.7 | 149.7 | 5.9 | 6.1 |
| company level, Europe, static | 173.5 | 130 | 5.9 | 6.2 |
| company level, Europe, panning | 173.3 | 150.7 | 6.0 | 6.2 |
| company level, Tokyo | 172.3 | 122.8 | 6.0 | 6.1 |
| year slider playing 1970 to end | 240.1 | 232.6 | 4.2 | 4.3 |
| game 959 (31 companies) arcs animating | 238.9 | 160.4 | 4.2 | 4.3 |
| game 959, toggling Port + Other support at 1 Hz | 238.3 | 137.2 | 4.2 | 4.3 |
All pass (avg >= 58, p95 <= 20 ms); worst single frame 20.9 ms. The city/company scenarios ran with ?debug=1 (small HUD, updated every 500 ms), which accounts for part of the drop from 240 to 173. Caveat: a first perf pass that used `?place=` URLs stayed at the default camera (see issue 3), so those numbers were discarded and redone by flying to the game and zooming.

## 2b. Functional
- Search finds a game and opens card: PASS ("Red Alert 3" -> option -> card with cover, year, genres).
- Card lists companies by role with source links: PASS (Lead 1, Port 1, Publisher 2, Audio 1, Other support 26; one IGDB link per row; "Sources: IGDB, Wikidata").
- Arc count matches roles: PASS by proxy. Arcs are not in the DOM; I counted WebGL draw calls per frame. Base 31; toggling Port -1, Publisher -2, Other support -5, Art/audio 0, Co-development 0. My own computation from the data (located companies >= 5 km from lead): port 1, publisher 2, support 5, audio 0 (Skywalker has no location). Exact match; restoring roles returned to 31.
- Legend toggle changes arcs and aria-pressed: PASS (true -> false, row struck through, card group marked "filtered out").
- Year slider: PASS. 1975: 2 points/0 covers; 1985: 5 points/1 cover (UK, "288 games led worldwide"); 1995: 16/3; 2005: 37/6; 2015: 57/13; end: 74/16. Setting 2027 clamps to 2026.
- Zoom grouping: PASS. Levels country (74 points) -> city (482) -> company (4,880) with wheel zoom; city labels and company-level covers seen over Europe and Japan.
- Click country opens place panel: PASS (click on Brazil -> "Place: Brazil").
- Real covers at country level: PASS (15-16 real IGDB covers with counts; none blank).

## 2c. My globe
- "Try a sample library": PASS. Headline "42% of your games come from United States", "60 of 60 games found in Overworld's 9,966". Ranked list: 42+18+14+8+3+3+3+2+7 (Other (4)) = 100. Globe afterwards: 12 points / 3 covers (was 74 / 15) and the timeline reads "60 games led worldwide".
- Invalid input ("!!not a profile??"): PASS, message "Use a steamcommunity.com/id/ or steamcommunity.com/profiles/ link, a custom profile name or a 17-digit SteamID64."
- Relay with "gabelogannewell" (one call): HTTP 403, error code `private_profile` (key is configured; no body printed beyond the code).
- Steam/Valve line: PASS ("Game library data from Steam. Overworld is not affiliated with Valve or Steam.").
- Nit: headline lacks the article ("come from United States").
- Note: static prod has no relay unless VITE_STEAM_PROXY_URL is set; the worker handles errors as "network" (message "Could not reach the Overworld server"). Not tested against a deployed worker.

## 2d. Insights
- Per capita: PASS. Ranked (Sweden 26.1, Finland 21.6, Japan 20.8 ...), "at least 5 games" cut-off, toggle Per million / Total; globe shaded teal on high countries (confirmed in 34-*.png).
- Genres by region: PASS. Americas/Europe/Asia/Oceania/Africa with top-6 genre shares and "N more genres not shown".
- Indie and major: PASS. Line chart (keyboard slider) and "Show as table" gives full year table; definition text for indie/major is explicit.
- Where the work goes: PASS for arcs (Publisher selected draws teal country-to-country arcs, ranked list with bars; Co-development, Port, Other support also selectable). Localization / QA / Art-audio chips show "0" and are dimmed + disabled. PARTIAL on honesty: there is NO plain explanation next to the disabled chips. The "Only N links in the data..." note only renders when the selected group's total is below a threshold, and disabled chips cannot be selected, so a user never sees it. A user sees "Localization 0" and a greyed chip and has to guess why.

## 2e. Share
- Game card Share: offers "Copy link", "Download image" (and "Share..." where supported): PASS. Copied link: `http://127.0.0.1:4791/overworld/g/959/`; loaded fresh it redirected to `?game=959` and opened the same card. PASS.
- Images: both exactly 1200x630 PNG (game and My globe). Viewed: game card = dark, title, year, lead studio, role bullets, "Data: IGDB, Wikidata"; My globe = headline + 5 bars + "60 of 60 games matched" + Valve disclaimer. Clean and readable but plain: no cover art, no globe.
- `?place=country:JP` fresh: PASS (panel "Place: Japan"; camera does not move, see issue 3).
- Link previews: per-game static pages (og:image = IGDB cover, not the 1200x630 card). My globe/guess previews are generic by design.

## 2f. Accessibility
- Tab order: 42 unique stops on a game card page, all with a 2 px solid focus outline (`:focus-visible`, #56B4E9); none without a ring. Globe canvas is tabindex -1 (not keyboard operable; companies reachable via card list only).
- Contrast on panel #0d1118: body text 15.6:1, muted text 6.1:1 (both >= 4.5). Role colors vs panel: Lead 14.3, Co-dev 8.4, Port 8.2, Publisher 7.5, Localization 6.2, QA 6.4, Art/audio 6.2, Support 7.8 (all >= 3). Colors are an Okabe-Ito-like set; normal-vision min pair delta-E 29.9. Under simulated deuteranopia Localization/Support dE 5, Publisher/Localization 14, Lead/Co-dev 17; protanopia Localization/Support 15; tritanopia Port/Publisher 10. Role is NOT told by color alone in the legend (text label) or card (group heading text). On the globe, arcs differ only by color, with arc heights offset per role and company name labels colored by role; no patterns/dashes per role. Art and Audio share one color (merged into one legend group, honest).
- Reduced motion: PARTIAL / not fully confirmed. Auto-rotate off (map labels stay still; code sets autoRotate false), arc dash animation off in code, slider steps once per second with a label saying so. But canvas pixels still change between screenshots in reduced mode even with overlays hidden (some continuous animation remains: possibly marker/ring pulse or tile fade; not identified).

## 2g. Phone 390x844
- No horizontal overflow (scrollWidth 390). Card is a bottom sheet (full width, 523 px tall) and usable.
- Problems: the floating "Roles" button overlaps panel content (My globe form helper text, Insights switch "Include work inside the same country" is cut to "de work inside..."). The bottom stack (slider + attribution, ~330 px) leaves My globe / Insights panels only ~200 CSS px of scrollable height, so "Try a sample library" and results are hard to reach. The globe centre is covered by sheets (expected). Many place labels are 20 px tall touch targets (labels, not controls).

## Screenshot findings (most important first)
1. Phone: "Roles" pill overlaps panel text; slider + attribution eat the My globe / Insights panels (43/44/45/46 screenshots).
2. "Fiji" label is drawn over southern Africa at every default view (antimeridian centroid bug), also visible in 01, 04, 22.
3. Default camera puts Europe on the limb of the globe (cropped and cluttered) and `?place=` / `?game=`-less deep links open the panel without flying the camera (DE/JP/company:26 left the camera on the Atlantic).
4. After dragging in Insights a large pale concentric crescent appeared over the Arctic (34-*.png); likely a rendering artifact (not reproduced elsewhere).
5. Legend (role filters) is shown and taking 270 px in Insights/My globe where it has no function; role legend always open on desktop.
6. Arcs at default framing are thin and faint (06); readable but low presence.
7. Desktop panels sit left/right and do not cover the globe centre; attribution complete (IGDB, Wikidata, Cover art via IGDB, Sentinel-2 cloudless with EOX credit line in full, Copernicus text). Steam/Valve line only inside My globe.

## 3. Console / network
Whole run: 1 distinct error, repeated per page load: `404 /favicon.ico` ("Failed to load resource"). No page errors, no failed requests, no other 4xx/5xx.

## Gaps for a clean PASS
1. Explain disabled Localization / QA / Art-audio chips on the Insights flow tab in plain text ("no source records this").
2. Fix phone layout: Roles button overlap, panel height versus slider/attribution.
3. Fiji label centroid; fly camera on `?place=` links.
4. Identify/stop residual canvas animation under prefers-reduced-motion.
5. Add favicon; align build base (VITE_BASE) with SITE_URL path in local builds.
6. Optional: cover art/globe in share images; article in My globe headline.

## Verdicts
- Phase 2: PASS WITH NOTES (all items verified; perf far above target; notes 2f, 2g, Fiji, deep-link camera).
- Phase 3: PASS WITH NOTES (sample path, invalid error, percents sum to 100, 1200x630 cards, link opens game; relay returned 403 private_profile; steamInput tests exist and pass; share previews generic for My globe).
- Phase 4: PASS WITH NOTES (four tabs work; honesty gap on unavailable roles; localization layer effectively empty by data).
