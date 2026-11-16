# Validation report

Verdict: PASS

9966 games, 6241 companies, 29265 roles

## Checks

- PASS files (0 problems): meta.json, companies.json, games.json and steam.json exist and parse
- PASS details-chunks (0 problems): details/<n>.json files match games.json order and ids, and meta.detailChunks
- PASS unique-company-ids (0 problems): company ids are unique
- PASS unique-game-ids (0 problems): game ids are unique
- PASS game-leads (0 problems): every game has a lead company present in companies.json and exactly one matching lead_developer role
- PASS source-ids (0 problems): every company, game detail and role has a source with a non-empty source and id
- PASS company-coordinates (0 problems): precision is 'none' exactly when lat/lng are null; city and country need valid coordinates
- PASS references (0 problems): role.companyId, parentId and steam.json point at existing records
- PASS games-sorted (0 problems): games.json is sorted by popularity, highest first
- PASS role-types (0 problems): every role has a known role type
- PASS meta-counts (0 problems): meta.counts match the files
- PASS company-game-count (0 problems): every company has gameCount above 0
- PASS company-games (0 problems): company-games.json exists and matches the (company, game, role) rows in the details chunks
- PASS stats-file (0 problems): stats.json is well formed and its gamesLed sum equals the games whose lead studio has a country
- PASS flows-file (0 problems): flows.json is well formed, examples exist in games.json, no lead_developer flow

## Role counts

| Role | Count |
| --- | ---: |
| lead_developer | 9966 |
| co_developer | 1546 |
| port | 1395 |
| publisher | 15227 |
| localization | 1 |
| qa | 0 |
| art | 1 |
| audio | 1 |
| support | 1128 |

## Companies by location precision

| Precision | Companies | Share |
| --- | ---: | ---: |
| city | 2261 | 36.2% |
| country | 2645 | 42.4% |
| none | 1335 | 21.4% |

Games whose lead studio has only a country-level location: 2643 of 9966 (26.5%)

## Lead basis

| Basis | Games |
| --- | ---: |
| igdb_single_developer | 8642 |
| igdb_developer_confirmed_by_wikidata | 929 |
| igdb_first_developer | 358 |
| wikidata_developer | 37 |

## Flagged companies (no location): 1335

Top 50 by game count

| Id | Name | Games |
| ---: | --- | ---: |
| 9786 | 22nd Century Toys | 28 |
| 38591 | Pingle Game Studio | 21 |
| 32350 | Hyundai | 19 |
| 25230 | St. GIGA | 16 |
| 461 | Fox Interactive | 11 |
| 3301 | Atari Europe | 11 |
| 833 | Ignition Entertainment | 9 |
| 32363 | ak tronic | 9 |
| 1453 | Sharp | 8 |
| 11975 | WhisperGames | 8 |
| 20661 | Crunchyroll Games | 8 |
| 51808 | 100 Cozy Games | 8 |
| 91 | Playmates Interactive Entertainment | 7 |
| 4132 | icculus.org | 7 |
| 9949 | Daedalic Studio West | 7 |
| 10535 | Acclaim | 7 |
| 19866 | Maple Whispering Limited | 6 |
| 1238 | Virgin Games USA | 5 |
| 1901 | Reef Entertainment | 5 |
| 2017 | MonkeyPaw Games | 5 |
| 2519 | Sears | 5 |
| 3828 | SmashGames | 5 |
| 5769 | Ubisoft Europe | 5 |
| 10317 | Micomsoft | 5 |
| 13104 | Ving Co., Ltd. | 5 |
| 13217 | Fujitsu Interactive | 5 |
| 18998 | Puppet Combo | 5 |
| 22239 | Amiga | 5 |
| 27686 | Frontier Foundry | 5 |
| 37382 | Epic Games Publishing | 5 |
| 231 | Tec Toy Indústria de Brinquedos | 4 |
| 651 | Sourcenext | 4 |
| 772 | Palcom | 4 |
| 904 | SoftBank | 4 |
| 1204 | Brasoft Produtos de Informática | 4 |
| 1860 | Virgin Entertainment | 4 |
| 2138 | Novitas Publishing | 4 |
| 4123 | Alexey Pajitnov | 4 |
| 4288 | i5works | 4 |
| 5884 | Tetraedge Games | 4 |
| 10098 | SNK of America | 4 |
| 12755 | NEC Avenue, Ltd. | 4 |
| 22830 | SUPERHOT PRESENTS | 4 |
| 22901 | Riot Forge | 4 |
| 26201 | Yooreka Studio | 4 |
| 36900 | DreadXP | 4 |
| 45866 | CDE Entertainment | 4 |
| 45959 | Devcats | 4 |
| 51839 | 100 Hidden Animals | 4 |
| 218 | Vatical Entertainment | 3 |

## Insights

### Top 10 countries by games led

| Country | Games led |
| --- | ---: |
| United States (US) | 2598 |
| Japan (JP) | 2572 |
| United Kingdom (GB) | 1051 |
| Canada (CA) | 587 |
| France (FR) | 348 |
| Sweden (SE) | 274 |
| Germany (DE) | 249 |
| Poland (PL) | 229 |
| Australia (AU) | 159 |
| Russia (RU) | 148 |

### Top 10 countries by games per million people (at least 5 games led)

| Country | Games led | Per million |
| --- | ---: | ---: |
| Sweden (SE) | 274 | 25.83 |
| Finland (FI) | 122 | 21.58 |
| Japan (JP) | 2572 | 20.78 |
| Iceland (IS) | 6 | 16.47 |
| Canada (CA) | 587 | 15.87 |
| Cyprus (CY) | 21 | 15.61 |
| United Kingdom (GB) | 1051 | 15.61 |
| Malta (MT) | 7 | 12.65 |
| Denmark (DK) | 67 | 11.51 |
| United States (US) | 2598 | 7.64 |

### Top 10 localization flows (lead studio country to localizer country)

| From | To | Games |
| --- | --- | ---: |

### Top 10 QA flows (lead studio country to QA country)

| From | To | Games |
| --- | --- | ---: |

## Lead studios without a city

Top 30 by games led

| Id | Name | Precision | Country | Games led |
| ---: | --- | --- | --- | ---: |
| 660 | Capcom Production Studio 1 | country | JP | 17 |
| 159 | Konami Computer Entertainment Tokyo | country | JP | 14 |
| 892 | Capcom Production Studio 2 | country | JP | 12 |
| 1246 | Nintendo EAD Software Development Group No.2 | country | JP | 11 |
| 732 | Project Soul | country | JP | 10 |
| 1366 | Nintendo EAD Software Development Group No.3 | country | JP | 9 |
| 9150 | MicroProse Software, Inc. | country | US | 9 |
| 42265 | Capcom Development Division 1 | country | JP | 9 |
| 92 | NovaLogic | country | US | 8 |
| 93 | Square Enix 1st Production Department | country | JP | 8 |
| 419 | Project Aces | country | JP | 8 |
| 1241 | Artificial Mind & Movement | country | CA | 8 |
| 1831 | Compile | country | JP | 8 |
| 8653 | Scottgames | country | US | 8 |
| 663 | Capcom Production Studio 4 | country | JP | 7 |
| 2340 | Codemasters Birmingham | country | GB | 7 |
| 2674 | Nintendo SPD Production Group No. 1 | country | JP | 7 |
| 655 | Capcom Production Studio 3 | country | JP | 6 |
| 2236 | Freebird Games | country | CA | 6 |
| 9969 | P Studio | country | JP | 6 |
| 19281 | Square Enix Business Division 3 | country | JP | 6 |
| 32471 | Nintendo R&D4 | country | JP | 6 |
| 45304 | Square Enix Creative Business Unit I | country | JP | 6 |
| 799 | Square Enix Product Development Division 1 | country | JP | 5 |
| 903 | Interplay Productions | country | US | 5 |
| 1048 | Nintendo EAD Software Development Group No.4 | country | JP | 5 |
| 1272 | Sega Sports R&D | country | JP | 5 |
| 1403 | Minakuchi Engineering | country | JP | 5 |
| 6189 | InterAction Studios | country | GR | 5 |
| 6916 | Bedtime Digital Games | country | DK | 5 |
