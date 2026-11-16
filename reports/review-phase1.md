# Phase 1 independent review

Run: `npm run pipeline` exit 0, 2.5 s wall (all stages re-used cached stage files; mobygames skipped, no key), `npm run validate` exit 0, vitest 14 files / 193 tests pass, `tsc --noEmit` exit 0.

## Recomputed vs reported (own script on web/public/data)

| Item | Recomputed | meta.json / validation.md |
| --- | --- | --- |
| games | 9966 | 9966 |
| companies | 6241 | 6241 |
| roles | 29265 | 29265 |
| lead_developer / co_developer / port / publisher | 9966 / 1546 / 1395 / 15227 | same |
| localization / qa / art / audio / support | 1 / 0 / 1 / 1 / 1128 | same |
| games without exactly one lead | 0 (0 none, 0 multiple, 0 lead != leadCompanyId) | PASS |
| precision city / country / none | 2261 / 2645 / 1335 | same |
| city/country with bad coords, none with coords | 0 | PASS |
| records without sources (company, game detail, role) | 0 / 0 / 0 | PASS |
| games.json sorted by popularity desc | yes (6063 .. 10), 9966 unique ids | PASS |
| steamAppId vs IGDB cache | 0 differences; year vs IGDB firstReleaseDate 0 differences | - |
| companies with no role | 0 | - |

No difference found. Not hidden: 1335 companies (21.4%) have no location, 2645 (42.4%) have country centre only; 2643 games (26.5%) have a country-only lead studio and 459 games have a lead studio with no location at all. Only 6864 games (68.9%) have a city-level lead. 19 of the top 200 games have a country-only lead.

## Validator: is each point-2 check really enforced? (mutations on temp copies)

CAUGHT: remove lead role; two lead roles; leadCompanyId missing company; leadCompanyId deleted; leadCompanyId pointing at another existing company; lat+lng null with precision city; only lat null; lat/lng keys deleted; country precision with null coords; (0,0); lat 200; lat as string; blank role source id; role source removed; role source.source blank; numeric role source id; company sources emptied; company source id blank; game detail sources emptied; unknown role type; role company missing; swapped games order; altered meta rolesByType; deleted details chunk; truncated chunk; gameCount 0; zero-role game; duplicated role row (via meta-counts only); steam.json pointing at missing game.

MISSED (validator says ok=true):
1. Located company with `locationSource: null` (no provenance for the location).
2. Coordinates moved to the ocean (0.1, -30) with precision city.
3. Japanese company with US coordinates (country and coordinates never cross-checked). Real example present in the data: Point of View has country US but city Eindhoven (NL) coordinates.
4. precision 'city' with city name null.
5. precision none set on a located company: passes by design (listed in report as flagged).
Plus: nothing checks that games.json itself carries a source (only details do), and a role listed twice for the same company/game/role is only caught by accident via meta counts.

## Spot check, 20 games (own seeded pick: 4 from top 200, 4 from bottom 2000 (ranks 7967+), 6 with more than 4 roles incl. Journey, 6 other)

Role rows were compared with the raw IGDB flags (igdb-games.json / igdb-companies.json) for all 20: all rows correct (developer -> lead/co_developer, publisher, porting -> port, supporting -> support, duplicates collapsed). Year and Steam id equal IGDB for all 20.

| # rank | Game (year) | Lead studio in output | City, country in output | Precision | Location from | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 97 | Dead Space (2008) | EA Redwood Shores | Redwood City, US | city | wikidata Q1576335 | correct (Visceral/Redwood Shores, P159 Redwood City). Steam id 1444000 (from IGDB); Wikidata Q729074 says 17470: suspect, unverifiable which is right |
| 158 | Diablo III (2012) | Blizzard Entertainment | Irvine, US | city | wikidata Q178824 | correct |
| 111 | It Takes Two (2021) | Hazelight Studios | Stockholm, SE | city | wikidata Q60354586 | correct |
| 109 | Journey (2012) | ThatGameCompany | Santa Monica, US | city | curated (en.wikipedia ThatGameCompany) | correct |
| 8435 | Romance of the Three Kingdoms XIII (2016) | Koei Tecmo | Tokyo, JP | city | wikidata Q1576915 | WRONG location: Koei Tecmo is HQ'd in Yokohama (Kohoku-ku); item has P159 Tokyo but P131 Yokohama/Kohoku-ku. Sibling company Koei Tecmo Games (858) is Yokohama |
| 9277 | Shining Soul II (2003) | Nextech | Tokyo, JP | city | curated (en.wikipedia Nextech) | correct (Sega subsidiary, Tokyo); lead per IGDB order |
| 8112 | Sengoku 2 (1993) | SNK | Osaka, JP | city | wikidata Q1044563 | correct (preferred P159 Yodogawa-ku, Osaka) |
| 9640 | Lawn Mowing Simulator (2021) | Skyhook Games | none | none | flagged | correct to flag (Wikidata Q108104974 has no claims); country UK known to me, not in data |
| 1420 | The Movies (2005) | Lionhead Studios | Dorking, GB (51.25,-0.45) | city | wikidata Q765389 | WRONG location: Q765389 P159 has Guildford (with coords) and Surrey; pipeline took the county centroid and named it Dorking. Lionhead was in Guildford |
| 944 | Spelunky (2012) | Mossmouth | country centre US | country | igdb | lead correct (BlitWorks = port); location unverifiable (no Wikidata HQ) |
| 6478 | Blockout (1989) | Logical Design Works | country centre PL | country | wikidata Q884654 | WRONG country: Q884654 is the game Blockout (country of origin PL), not the company; Logical Design Works was a US publisher/developer. Location source id points at a game item |
| 906 | Streets of Rage 2 (1992) | Ancient | Hino, JP | city | wikidata Q2845962 | correct; lead chosen by "first developer" among 4, plausible |
| 1991 | Arcania: Gothic 4 (2010) | Spellbound Entertainment | Offenburg, DE | city | wikidata Q549221 | correct |
| 3492 | Monster Prom (2018) | Beautiful Glitch | Barcelona, ES | city | wikidata Q117467445 | correct |
| 5597 | Agatha Christie: And Then There Were None (2005) | AWE Productions | country centre US | country | wikidata Q2533543 | unverifiable; Q2533543 is the game item (country of origin US), not the company |
| 4118 | The Vanishing of Ethan Carter Redux (2015) | The Astronauts | Warsaw, PL | city | wikidata Q24229399 | correct |
| 1253 | Pokemon Trading Card Game (1998) | Hudson Soft | Sapporo, JP | city | wikidata Q1049502 (basis formation) | debatable: Sapporo was the founding place; current Wikidata P159 is Minato, Tokyo. Fine for 1998, wrong "headquarters" label |
| 2894 | Devour (2021) | Joe Fender (person) | none | none | - | questionable lead: IGDB lists Joe Fender and Straight Back Games both as developer; first-entered rule picked the individual, who has no location |
| 4648 | Post Void (2020) | YCJY Games | country centre SE | country | igdb | unverifiable |
| 6646 | Legend of Kyrandia 3 (1994) | Westwood Studios | Las Vegas, US | city | wikidata Q267949 | correct |

Wrong lead studio: 0 clear, 1 questionable (Devour). Wrong location: 3 (Koei Tecmo, Lionhead, Logical Design Works), plus 1 debatable (Hudson Soft). Unverifiable: 3. Evidence: https://www.wikidata.org/wiki/Q1576915, https://www.wikidata.org/wiki/Q765389, https://www.wikidata.org/wiki/Q884654.

## Systematic problems (most important first)

1. Wrong lead among multiple IGDB developers (358 games, basis `igdb_first_developer`; not confirmed by Wikidata). Among the 25 most popular of them (not in the 20 sample) at least 6 are wrong: Final Fantasy IX lead Square USA (Honolulu; real developer Square, Japan), Heroes of Might and Magic III lead Loki Software (Linux port; real New World Computing), Bayonetta lead Nex Entertainment (port; real PlatinumGames), Pokemon Go lead The Pokemon Company (real Niantic), Rogue Legacy lead Abstraction Games (port; real Cellar Door Games), Saints Row IV lead High Voltage Software (real Volition). Ports flagged as developer in IGDB become lead and put the game on the wrong country.
2. Wikidata country disagreeing with IGDB is trusted over IGDB with no check: 49 companies in merge-report countryMismatches, about 90 led games. The Creative Assembly (18 games led) is placed in Horsham, **Australia** (-36.72, 142.2; Horsham, Victoria) instead of Horsham, UK. Also Infogrames (8 games) in New York City (IGDB: FR), Appaloosa Interactive (Hungarian) in Palo Alto, Natsume Inc. in Tokyo (US company), Whoopee Camp in Tulsa, Frogwares (Ukrainian) in Dublin. The validator does not flag any of this.
3. Multi-statement HQ choice picks regions/coarser places: Lionhead (Surrey -> "Dorking"). The Wikidata stage cache has 89 ambiguous HQ entries; the stage log line printed ambiguousHq=0.
4. Country-only inference from games: 485 companies got a country from the games they led, with locationSource pointing at a Wikidata GAME item (Blockout, AWE). Wrong when a US publisher made a European game. Source id is not a company record.
5. City precision coverage is low where it matters: lead studios that are divisions (Capcom Production Studio 1-4, Nintendo EPD/EAD groups, Square Enix divisions, BioWare Edmonton, Project Soul, P Studio) are country-centre only (top 30 lead studios without city, all of them). No parent inheritance: BioWare Edmonton (country) vs parent BioWare (Edmonton, city). 26.5% of games have a country-only lead.
6. Role coverage is nearly absent: localization 1, art 1, audio 1, qa 0; "support" 1128 is the generic IGDB flag. The role counts are reported, but the map's localization/QA flows are effectively empty.
7. Duplicate companies are not merged (IGDB-given): Namco / Namco Limited, Midway Games / Midway, Marvelous x4, Sega x5, Irem x2, Natsume x2, Koei Tecmo (Tokyo, 1 lead) vs Koei Tecmo Games (Yokohama), Sega Enterprises Ltd (Tokyo) vs Sega Enterprises (country US). Same studio, different pins.
8. Single-point country centres: one coordinate per country (US 38,-97 etc.); correct as documented, no country has differing centres. No ocean point found; 14 city-precision coordinates disagree with company.country only for Hong Kong (HK vs CN, harmless), Ogdensburg and Eindhoven (Point of View: country US, coordinates NL).
9. Top-30 lead studio cities (Capcom Osaka, Konami Tokyo, EA Canada Burnaby, Ubisoft Montreal, Namco Tokyo, Rare Twycross, Traveller's Tales Knutsford, HAL Tokyo, SNK Osaka, Nintendo EAD Kyoto, Atlus Tokyo, Sega Tokyo, EA Orlando, Game Freak Tokyo, LucasArts SF, Intelligent Systems Kyoto, Level-5 Fukuoka, Valve Bellevue...) are right. Questionable: Hudson Soft Sapporo, Sierra On-Line Los Angeles (Oakhurst/Bellevue historically), Atari Sunnyvale. No Japanese studio found outside Japan with leads except legitimate overseas branches.
10. Dropped games (34): famous ones missing: God of War II, Crysis 2: Maximum Edition, Ghostbusters, NBA Live 19, FIFA Manager 13, Microsoft Minesweeper, Spider Solitaire, Rush Royale, Gunman Clive, Super Seducer, Ecstatica. All have no IGDB developer; the rescue found nothing. Acceptable count (0.34%), but God of War II is conspicuous.
11. Traceability nit: role source is the IGDB game id plus url (not the involved_company row); curated location source id is a lower-cased name string, with a Wikipedia URL.

## Gaps to fix for a clean PASS

- Lead rule for multi-developer games: do not take the first-entered when others are ports (port/supporting flags, or IGDB developer who is also flagged porting); fall back to Wikidata, or flag low-confidence leads in the report (358 games).
- Country disagreement between Wikidata and IGDB must either be rejected or reported as a validation failure/flag; fix The Creative Assembly (and Infogrames, Appaloosa, Natsume Inc., Whoopee Camp, Frogwares) via company-locations.json.
- Add validator checks: located company has locationSource; company.country matches coordinates' country; city name present when precision city.
- Fix Lionhead (prefer the P159 value that is a city; Guildford), Koei Tecmo (Yokohama), Logical Design Works (not from a game item).
- Do not use a game's Wikidata QID as a company locationSource.
