# Phase 1 second independent review

Verdict: PASS WITH NOTES. All five done-condition points are met. No clear blocker remains; open items are accuracy limits and two validator blind spots.

## Done condition

| # | Point | Result |
| --- | --- | --- |
| 1 | One command runs end to end | PASS. `npm run pipeline` (no flags) finished, validate step ok=true, 0 failed checks. `npm run validate` same. `npx vitest run pipeline/src`: 15 files, 229 tests pass. `npx tsc --noEmit`: no errors. |
| 2 | Validator | PASS. 16 checks. No game without exactly one lead; company without coordinates is flagged (1,360 in validation.json, top 50 in the md); every record has a source; role counts reported. |
| 3 | 5-10k games + companies | PASS. 9,966 games, 6,241 companies, 29,269 roles. 34 games dropped for no developer (merge-report). |
| 4 | Traceability | PASS. Own script: 0 games, roles or companies with a missing source name/id. All role company ids exist. |
| 5 | Spot check | PASS WITH NOTES. See below: 0 wrong leads, 0 clearly wrong locations in 20; some debatable/coarse. |

## Recomputed vs reported (own script, details chunks + companies.json)

| Item | Mine | meta.json / validation.md |
| --- | --- | --- |
| games / companies / roles | 9966 / 6241 / 29269 | same |
| roles by type | lead 9966, co 1547, port 1395, publisher 15230, localization 1, qa 0, art 1, audio 1, support 1128 | same |
| games without exactly one lead | 0 | 0 |
| games.leadCompanyId vs lead role | 0 mismatches | - |
| precision city / country / none | 2289 / 2592 / 1360 | same |
| locationBasis | correction 61, headquarters 2131, formation 32, parent 53, located_in 12, country 2132, games_origin 460, none 1360 | consistent |
| leadBasis | single 8642, confirmed_by_wikidata 929, first 249, heuristic 98, curated 11, wikidata_developer 37 | same |
| records without sources | 0 | 0 |
| steam.json entries to missing games | 0 of 5,546 | 0 |
| located company with null source / null basis / city without name | 0 / 0 / 0 | - |

Lead studios: 3,896; city 1,650, country 1,832, none 414 (457 games have an undrawable lead; flagged only, which the done condition allows).

## Gap a: validator (closed, with two blind spots)

Mutations on copies of web/public/data in a temp dir, through `validateOutput`. Baseline ok, 1 warning (Metronomik, Kuala Lumpur, a false positive).

| Mutation | Result |
| --- | --- |
| M1 located company locationSource=null | DETECTED (company-location-fields) |
| M1b locationBasis=null | DETECTED |
| M2 US company moved to Tokyo coords | NOT a failure; warning list grows 1 to 2 (as designed). Only fires beyond a distance limit, so a US company placed in Canada or Mexico would not show |
| M3 precision city, city=null | DETECTED |
| M4 lead role removed | DETECTED |
| M5 role source deleted | DETECTED |
| M6 two lead roles | DETECTED |
| M7 city precision with null coords | DETECTED |
| M8 referenced company deleted | DETECTED |
| M9 unknown role type | DETECTED |
| M10 company sources emptied | DETECTED |
| M11 latitude 200 | DETECTED |
| M12 lat/lng swapped | DETECTED |
| M13 precision none with coords kept | DETECTED |
| M14 meta counts altered | DETECTED |
| M15 steam maps to missing game | DETECTED |
| M16 games.json lead differs from lead role | DETECTED |
| M17 game detail source id empty | DETECTED |
| M18 located company country=null | detected only indirectly (stats-file) |
| M19 game with no roles | DETECTED |
| M20 invalid country code "ZZ" on a city company | NOT DETECTED (no country-code check) |
| M21 stats.json gamesLed corrupted | DETECTED |

Also seen: 5 located companies (Playlogic, Sparpweed, Gambitious, Studio 397, Second Maze, all Dutch) have a city and coordinates but `country: null`, because IGDB has no country and Wikidata only fills the place. They are left out of country stats.

## Gap b: wrong leads (mostly closed)

Named games now: Final Fantasy IX = Square (curated, Tokyo); HoMM III = New World Computing; Bayonetta = PlatinumGames (Osaka); Pokemon Go = Niantic Labs; Rogue Legacy = Cellar Door Games (country CA only); Saints Row IV = Volition (Champaign). All six right.

40 most popular games with basis igdb_first_developer / igdb_developer_heuristic (list in the script output, ranks 70 to 1835). My judgement: 35 right, 1 clearly wrong, 4 debatable.

| Rank | Game | Lead in output | Better answer |
| --- | --- | --- | --- |
| 1442 | Mortal Kombat: Komplete Edition | High Voltage Software | NetherRealm Studios (WRONG; IGDB lists NetherRealm as developer too) |
| 1754 | Darksiders II: Deathinitive Edition | Vigil Games | Gunfire Games made the remaster (debatable) |
| 883 | Super Smash Bros. for 3DS | Bandai Namco Games | Sora Ltd. is the main developer (debatable) |
| 312 | Far Cry (2004) | Crytek Frankfurt | Crytek, same group (imprecise) |
| 1245 | The Godfather (2006) | Headgate Studios | EA Redwood Shores is the original developer and is missing in IGDB (debatable, source gap) |

Others (Ōkami HD, Kingdom: New Lands, Streets of Rage 2) accepted as defensible.

## Gap c: Wikidata place vs IGDB country (closed)

| Company | Now |
| --- | --- |
| The Creative Assembly | Horsham GB, correction |
| Infogrames (213) | country FR only (affiliates Paris / country) |
| Natsume Inc. | country US only; Natsume Co. Ltd. Tokyo |
| Appaloosa Interactive | Mountain View US, correction. Wikipedia infobox says HQ Mountain View, though IGDB says Hungary and the games were made in Budapest: debatable |
| Point of View | country US only |

Own check: nearest-city country check (all-the-cities, pop 15k+, within 40 km) on all 2,289 city companies finds only 9 mismatches, all benign (Hong Kong/Kowloon coded CN, Ogdensburg NY is 20 km from Brockville, 5 Dutch companies with null country, Shenzhen). Distance above 1,500 km from country centre (world-countries): 719 companies, top 20 all Russia/Canada/US in large countries, legitimate. 35 country conflicts remain listed in merge-report.countryMismatches (reported, not hidden).

## Gap d (partly)

- Lionhead Studios: Guildford, GB (correct).
- Koei Tecmo: Yokohama via correction (18532); Koei Tecmo Games (858, 38951) Yokohama (correct).
- Logical Design Works: no longer a city, but still country PL, basis games_origin, source is the game item Q884654 (Blockout). The company was American as far as I know; I could not confirm it (no Wikipedia page). Flagged by basis, not fixed.

## Gap e (closed for the stated metric)

Top 30 lead studios by games led: 0 without a city (Capcom Osaka 154, Konami Tokyo 135, EA Canada 83 ... Dimps 26). Top 100: 1 without a city (Konami Computer Entertainment Tokyo, 14). Still country-only among the next tier: Project Soul 10, GSC Game World 9 (IGDB says CZ; its famous games were made in Kyiv), MicroProse 9, Infogrames 8, Project Aces 8, Compile 8, Scottgames 8, Codemasters Birmingham 7, BioWare Edmonton/Montreal (top-300 games), Nintendo R&D4. Report section "Lead studios without a city" lists them.

## Gap f (closed)

460 companies have basis games_origin; all 460 have precision country and their locationSource is a Wikidata game item. 0 city-precision companies use a game QID. The basis makes it visible. The source URL still points at the game, which is odd but labelled.

## Hand-kept files (18 pages opened with curl, all Wikipedia, seed 77123)

Company corrections, 12: id Software (Richardson), Argonaut (London), IO Interactive (Copenhagen), Team NINJA (Tokyo), Saber (Fort Lauderdale), NDcube (Tokyo), MachineGames (Uppsala), King (Stockholm), Wales Interactive (Penarth), Paradox Development Studio (Stockholm, via Paradox Interactive), Nerial (London, via Reigns), Mimimi (Munich). All 12 confirmed; coordinates within a few km. Also opened Appaloosa and Omega Force (Ashikaga, confirmed).
Lead overrides, 6: Final Fantasy IX Square, Fire Emblem Radiant Dawn Intelligent Systems, Realm of the Mad God Wild Shadow, FE Fates Conquest and Birthright (Intelligent Systems with Nintendo SPD), Tormented Souls Dual Effect. All 6 confirmed. Wrong 0, could not open 0.

## New spot check, 20 games (seed 424242, excluding the earlier 20)

Role rows compared to raw IGDB flags for all 20: all correct (developer to lead/co, porting to port, supporting to support, duplicates collapsed). Year and Steam id equal IGDB.

| Rank | Game | Lead | Location | Verdict |
| --- | --- | --- | --- | --- |
| 39 | Undertale | tobyfox | US country | ok |
| 71 | Oblivion | Bethesda Game Studios | Rockville | ok (Wikidata Q3300783) |
| 56 | Dragon Age: Origins | BioWare Edmonton | CA country only | lead ok; coarse |
| 196 | Dishonored 2 | Arkane Studios | Lyon | ok |
| 104 | Disco Elysium | ZA/UM | EE country | lead ok; ZA/UM HQ is UK now, made in Tallinn: debatable |
| 8778 | Mario Pinball Land | Fuse Games | Burford GB | ok (Q128523, Burford) |
| 7028 | Facade | Procedural Arts | US country | ok |
| 8520 | Golden Axe Warrior | Sega Enterprises | Tokyo | ok |
| 9865 | Grapple Dog | Medallion Games | London | ok (Q117006652) |
| 9875 | Super Mario World (1995 bootleg) | Hummer Team | Taipei | ok (Q104523587) |
| 4799 | Dig Dug II | Namco | Tokyo | ok |
| 5985 | In the Hunt | Irem | Hakusan | ok |
| 430 | THPS2 | Neversoft | Woodland Hills | ok |
| 6437 | Top Spin | PAM Development | Paris | ok |
| 1067 | Crypt of the NecroDancer | Brace Yourself | Vancouver | ok |
| 632 | Her Story | Sam Barlow | GB country | ok |
| 3150 | Final Fantasy XI | Square Product Development Division 3 | Tokyo (parent) | ok |
| 7034 | Samurai Warriors 4-II | Omega Force | Ashikaga | ok (confirmed) |
| 4295 | Winter Games | Action Graphics | US country | unverified, plausible |
| 5466 | Hero of the Kingdom II | Lonely Troops | SK (games_origin) | unverified |

Wrong leads 0; wrong locations 0; debatable 1 (ZA/UM); unverifiable 2. Coverage: 5 top-300, 5 bottom-3000, 5 with 5+ roles, 5 with basis other than headquarters (country, parent, correction, games_origin). Wikidata requests: 7.

## Steam (closed)

620 Portal 2, 400 Portal, 220 Half-Life 2, 292030 Witcher 3, 271590 GTA V, 17470 Dead Space 2008 (both its ids 17470 and 1444000 map to game 37), 1091500 Cyberpunk 2077, 570 Dota 2, 730 mapped to Counter-Strike 2 (correct, the id is CS2 now), 1245620 Elden Ring, 413150 Stardew, 367520 Hollow Knight, 1086940 Baldur's Gate 3, 489830 Skyrim SE, 1174180 RDR2, 374320 Dark Souls III: all right. Dark Souls (211420) and Don't Starve Together (322330) have no entry because IGDB lists no id for them (not an error). No app id maps to a missing game; every detail.steamAppId maps back to its own game.

## Remaining problems, by importance

1. Lead accuracy on multi-developer games is mostly fixed but not perfect: 1 clear and 4 debatable out of the top 40 low-confidence leads (MK Komplete Edition is wrong).
2. 414 lead studios (457 games) are not drawable; 1,832 lead studios are country-only (24.8% of games). Flagged, not fixed. GSC Game World placed in CZ, Logical Design Works in PL are location-of-making errors.
3. Locations are present-day (documented limit).
4. Validator blind spots: invalid country code; wrong-country is a warning with a loose distance limit; companies with located city but null country.
5. Game items used as company locationSource (460 rows) are labelled but still odd.
6. Duplicate companies (Natsume, Koei Tecmo, Infogrames variants) remain separate.
7. Localization/QA/art/audio roles are near zero without MobyGames.

## For a clean PASS

Fix Logical Design Works and the MK Komplete lead; add an ISO country-code check and a located-company-must-have-country check to the validator; decide whether a country-vs-coordinates mismatch should fail (use nearest-country lookup, not only distance); give the 460 games_origin rows a non-game locationSource or none.
