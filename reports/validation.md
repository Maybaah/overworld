# Validation report

Verdict: PASS

35255 games, 19182 companies, 89451 roles

## Checks

- PASS files (0 problems): meta.json, companies.json, games.json and steam.json exist and parse
- PASS details-chunks (0 problems): details/<n>.json files match games.json order and ids, and meta.detailChunks
- PASS unique-company-ids (0 problems): company ids are unique
- PASS unique-game-ids (0 problems): game ids are unique
- PASS game-leads (0 problems): every game has a lead company present in companies.json and exactly one matching lead_developer role
- PASS source-ids (0 problems): every company, game detail and role has a source with a non-empty source and id
- PASS company-coordinates (0 problems): precision is 'none' exactly when lat/lng are null; city and country need valid coordinates and a known country code
- PASS references (0 problems): role.companyId, parentId and steam.json point at existing records
- PASS games-sorted (0 problems): games.json is sorted by popularity, highest first
- PASS role-types (0 problems): every role has a known role type
- PASS meta-counts (0 problems): meta.counts match the files
- PASS company-game-count (0 problems): every company has gameCount above 0
- PASS company-games (0 problems): company-games.json exists and matches the (company, game, role) rows in the details chunks
- PASS stats-file (0 problems): stats.json is well formed and its gamesLed sum equals the games whose lead studio has a country
- PASS flows-file (0 problems): flows.json is well formed, examples exist in games.json, no lead_developer flow
- PASS company-location-fields (0 problems): located companies have a location source and basis; city precision has a city name; precision none has no basis

## Role counts

| Role | Count |
| --- | ---: |
| lead_developer | 35255 |
| co_developer | 3591 |
| port | 2332 |
| publisher | 46373 |
| localization | 1 |
| qa | 0 |
| art | 1 |
| audio | 1 |
| support | 1897 |

## Companies by location precision

| Precision | Companies | Share |
| --- | ---: | ---: |
| city | 3407 | 17.8% |
| country | 7673 | 40% |
| none | 8102 | 42.2% |

Games whose lead studio has only a country-level location: 11707 of 35255 (33.2%)

## Lead basis

| Basis | Games |
| --- | ---: |
| igdb_single_developer | 31967 |
| igdb_developer_confirmed_by_wikidata | 1550 |
| igdb_first_developer | 1101 |
| curated | 12 |
| igdb_developer_heuristic | 243 |
| wikidata_developer | 382 |

## Flagged companies (no location): 8102

Top 50 by game count

| Id | Name | Games |
| ---: | --- | ---: |
| 20611 | Kagura Games | 72 |
| 8031 | Back To Basics Gaming | 42 |
| 11975 | WhisperGames | 40 |
| 17208 | Ripknot Systems | 38 |
| 25230 | St. GIGA | 33 |
| 9786 | 22nd Century Toys | 31 |
| 10535 | Acclaim | 30 |
| 38591 | Pingle Game Studio | 27 |
| 20001942 | Nintendo EAD | 27 |
| 461 | Fox Interactive | 26 |
| 19866 | Maple Whispering Limited | 26 |
| 21233 | Anatoliy Loginovskikh | 26 |
| 7432 | Retroism | 22 |
| 36900 | DreadXP | 22 |
| 833 | Ignition Entertainment | 21 |
| 20003576 | Ubisoft Entertainment Inc. / Ubisoft Divertissements Inc. | 21 |
| 57593 | OTAKU Plan | 20 |
| 3301 | Atari Europe | 19 |
| 32350 | Hyundai | 19 |
| 20661 | Crunchyroll Games | 18 |
| 22489 | Hosted Games | 18 |
| 51808 | 100 Cozy Games | 18 |
| 46928 | Very Very Little Studio | 17 |
| 26837 | Walter Machado | 16 |
| 32363 | ak tronic | 16 |
| 2017 | MonkeyPaw Games | 15 |
| 43414 | 616 GAMES | 15 |
| 67297 | SA Industry | 15 |
| 2519 | Sears | 14 |
| 13387 | Racing Bros | 14 |
| 23426 | Randumb Studios | 14 |
| 3704 | NEC Home Electronics | 13 |
| 10836 | Green Man Gaming Publishing | 13 |
| 12393 | Siactro | 13 |
| 12539 | 101XP | 13 |
| 13104 | Ving Co., Ltd. | 13 |
| 26201 | Yooreka Studio | 13 |
| 35964 | Pixel Games UK | 13 |
| 45959 | Devcats | 13 |
| 51104 | Travellin Cats | 13 |
| 91 | Playmates Interactive Entertainment | 12 |
| 1901 | Reef Entertainment | 12 |
| 13915 | Purple Hills | 12 |
| 16890 | Perp Games | 12 |
| 18130 | Surefire.Games | 12 |
| 77268 | Mastertronic Games | 12 |
| 8278 | Cartoon Network Games | 11 |
| 9323 | Pilgrim Adventures | 11 |
| 18806 | upjers | 11 |
| 30730 | Sigyaad Team | 11 |

## Insights

### Top 10 countries by games led

| Country | Games led |
| --- | ---: |
| United States (US) | 6910 |
| Japan (JP) | 6647 |
| United Kingdom (GB) | 2881 |
| Canada (CA) | 1365 |
| France (FR) | 1111 |
| Germany (DE) | 937 |
| Poland (PL) | 825 |
| Russia (RU) | 681 |
| Sweden (SE) | 654 |
| Australia (AU) | 516 |

### Top 10 countries by games per million people (at least 5 games led)

| Country | Games led | Per million |
| --- | ---: | ---: |
| Finland (FI) | 356 | 62.98 |
| Sweden (SE) | 654 | 61.64 |
| Japan (JP) | 6647 | 53.69 |
| Cyprus (CY) | 69 | 51.3 |
| United Kingdom (GB) | 2881 | 42.79 |
| Iceland (IS) | 15 | 41.18 |
| Canada (CA) | 1365 | 36.9 |
| Denmark (DK) | 166 | 28.51 |
| Poland (PL) | 825 | 21.96 |
| Estonia (EE) | 30 | 21.9 |

### Top 10 localization flows (lead studio country to localizer country)

| From | To | Games |
| --- | --- | ---: |

### Top 10 QA flows (lead studio country to QA country)

| From | To | Games |
| --- | --- | ---: |

## Warnings (not failures)

### Coordinates far from the stated country: 3

Overseas territories and distant branch offices can appear here legitimately.

- company 2313 "Tetris Online Inc" (US, Honolulu): 6056 km from the country centre, limit 4318 km
- company 17928 "Metronomik" (MY, Kuala Lumpur): 1205 km from the country centre, limit 811 km
- company 43758 "Rat Cliff Games" (ES, San Bartolomé): 1503 km from the country centre, limit 1003 km

## Low-confidence leads

Games with several IGDB developers where nothing told them apart (first 30 by popularity).

| Game | Chosen lead | Other developers |
| --- | --- | --- |
| NieR:Automata | PlatinumGames | Square Enix Business Division 6 |
| Escape the Backrooms | Fancy Games | Blackbird Interactive |
| Brotato | Blobfish | Erabit Studios |
| Yakuza 0 | Ryu Ga Gotoku Studio | Sega Games |
| Far Cry | Crytek Frankfurt | Crytek |
| Final Fantasy XV | Square Enix Business Division 2 | Luminous Productions |
| House Flipper | Empyrean | Frozen District, Ultimate Games |
| Deceit | Automaton | World Makers |
| Final Fantasy XIV Online | Square Enix Product Development Division 3 | Square Enix Creative Business Unit III, Square Enix Business Division 5, Square Enix Creative Studio 3 |
| Content Warning | Zorro | Wilnyl, Philip, thePetHen, Skog |
| Devour | Joe Fender | Straight Back Games |
| Silent Hill 3 | Team Silent | Konami Computer Entertainment Tokyo |
| Ryse: Son of Rome | Crytek Frankfurt | Crytek |
| Super Mario 3D World | Nintendo Entertainment Analysis & Development | Nintendo, Nintendo EAD |
| Barotrauma | FakeFish | Undertow Games |
| Code Vein | Shift | Bandai Namco Studios |
| Mario Kart 7 | Nintendo EAD Software Development Group No.1 | Nintendo |
| Kingdom: Classic | Noio | Licorice |
| Darksiders II: Deathinitive Edition | Vigil Games | THQ Nordic, Gunfire Games |
| TBH: Task Bar Hero | Nugem Studio | Tesseract Studio |
| Resident Evil: Revelations | Capcom | Tose |
| Super Smash Bros. for Nintendo 3DS | Bandai Namco Games | Sora |
| Streets of Rage 2 | Ancient | H.I.C., Shout! Designworks, MNM Software |
| Disney's Aladdin | Virgin Games USA | Virgin Interactive Entertainment (Europe) Ltd. |
| Assassin's Creed III: Liberation | Ubisoft Sofia | Ubisoft Milan |
| Super Mario Party | NDCube | Nintendo |
| Call to Arms: Gates of Hell - Ostfront | Barbedwire Studios | Digitalmindsoft |
| Super Mario Maker | Nintendo EAD Software Development Group No.4 | Nintendo |
| Ōkami HD | Clover Studio | Capcom |
| Magical Girl Witch Trials | Acacia | Re,AER |

## Lead studios without a city

Top 30 by games led

| Id | Name | Precision | Country | Games led |
| ---: | --- | --- | --- | ---: |
| 17208 | Ripknot Systems | none |  | 38 |
| 159 | Konami Computer Entertainment Tokyo | country | JP | 30 |
| 9150 | MicroProse Software, Inc. | country | US | 29 |
| 1831 | Compile | country | JP | 28 |
| 14914 | Chilla's Art | country | JP | 28 |
| 21681 | EnsenaSoft | country | MX | 28 |
| 21233 | Anatoliy Loginovskikh | none |  | 26 |
| 11203 | Quiet River | country | RU | 25 |
| 2521 | Mattel Electronics | country | US | 22 |
| 3118 | MumboJumbo | country | US | 22 |
| 213 | Infogrames | country | FR | 20 |
| 5187 | 07th Expansion | country | JP | 19 |
| 12568 | Frontwing | country | JP | 18 |
| 13358 | FIVE-BN GAMES | country | UA | 18 |
| 24182 | Mateusz Skutnik | country | PL | 18 |
| 144 | GSC Game World | country | CZ | 17 |
| 46928 | Very Very Little Studio | none |  | 17 |
| 903 | Interplay Productions | country | US | 16 |
| 16347 | Choice of Games | country | US | 16 |
| 18998 | Puppet Combo | country | US | 16 |
| 26837 | Walter Machado | none |  | 16 |
| 543 | Rage Software | country | GB | 15 |
| 2252 | Compile Heart | country | JP | 15 |
| 32412 | Euphoric Brothers | country | CA | 15 |
| 43414 | 616 GAMES | none |  | 15 |
| 51808 | 100 Cozy Games | none |  | 15 |
| 528 | SSI (Strategic Simulations, Inc.) | country | US | 14 |
| 9509 | Warfare Studios | country | BR | 14 |
| 13387 | Racing Bros | none |  | 14 |
| 15249 | Ebi-Hime | country | GB | 14 |
