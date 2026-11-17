# Validation report

Verdict: PASS

38983 games, 20813 companies, 97648 roles

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
| lead_developer | 38983 |
| co_developer | 3771 |
| port | 2398 |
| publisher | 50547 |
| localization | 1 |
| qa | 0 |
| art | 1 |
| audio | 1 |
| support | 1946 |

## Companies by location precision

| Precision | Companies | Share |
| --- | ---: | ---: |
| city | 3496 | 16.8% |
| country | 8178 | 39.3% |
| none | 9139 | 43.9% |

Games whose lead studio has only a country-level location: 13071 of 38983 (33.5%)

## Lead basis

| Basis | Games |
| --- | ---: |
| igdb_single_developer | 35428 |
| igdb_developer_confirmed_by_wikidata | 1597 |
| igdb_first_developer | 1201 |
| curated | 12 |
| igdb_developer_heuristic | 253 |
| wikidata_developer | 492 |

## Flagged companies (no location): 9139

Top 50 by game count

| Id | Name | Games |
| ---: | --- | ---: |
| 20611 | Kagura Games | 73 |
| 8031 | Back To Basics Gaming | 51 |
| 11975 | WhisperGames | 42 |
| 17208 | Ripknot Systems | 39 |
| 25230 | St. GIGA | 33 |
| 18911 | Laush Studio | 32 |
| 7432 | Retroism | 31 |
| 9786 | 22nd Century Toys | 31 |
| 10535 | Acclaim | 31 |
| 21233 | Anatoliy Loginovskikh | 28 |
| 38591 | Pingle Game Studio | 28 |
| 20001942 | Nintendo EAD | 27 |
| 461 | Fox Interactive | 26 |
| 19866 | Maple Whispering Limited | 26 |
| 67297 | SA Industry | 26 |
| 833 | Ignition Entertainment | 24 |
| 30868 | Laush Dmitriy Sergeevich | 24 |
| 36900 | DreadXP | 23 |
| 20003576 | Ubisoft Entertainment Inc. / Ubisoft Divertissements Inc. | 21 |
| 20661 | Crunchyroll Games | 20 |
| 57593 | OTAKU Plan | 20 |
| 3301 | Atari Europe | 19 |
| 13144 | Blender Games | 19 |
| 13387 | Racing Bros | 19 |
| 32350 | Hyundai | 19 |
| 10836 | Green Man Gaming Publishing | 18 |
| 22489 | Hosted Games | 18 |
| 51808 | 100 Cozy Games | 18 |
| 46928 | Very Very Little Studio | 17 |
| 60466 | Conglomerate 5 | 17 |
| 10060 | Zonitron Productions | 16 |
| 26837 | Walter Machado | 16 |
| 32363 | ak tronic | 16 |
| 2017 | MonkeyPaw Games | 15 |
| 9323 | Pilgrim Adventures | 15 |
| 12340 | Ocean Media | 15 |
| 43414 | 616 GAMES | 15 |
| 2519 | Sears | 14 |
| 12539 | 101XP | 14 |
| 22097 | ANPA.US | 14 |
| 23426 | Randumb Studios | 14 |
| 35964 | Pixel Games UK | 14 |
| 3704 | NEC Home Electronics | 13 |
| 12393 | Siactro | 13 |
| 13104 | Ving Co., Ltd. | 13 |
| 18130 | Surefire.Games | 13 |
| 21381 | Numskull Games | 13 |
| 26201 | Yooreka Studio | 13 |
| 39157 | Ravenage Games | 13 |
| 45959 | Devcats | 13 |

## Insights

### Top 10 countries by games led

| Country | Games led |
| --- | ---: |
| United States (US) | 7438 |
| Japan (JP) | 6849 |
| United Kingdom (GB) | 3098 |
| Canada (CA) | 1478 |
| France (FR) | 1211 |
| Germany (DE) | 1061 |
| Poland (PL) | 916 |
| Russia (RU) | 840 |
| Sweden (SE) | 698 |
| Australia (AU) | 587 |

### Top 10 countries by games per million people (at least 5 games led)

| Country | Games led | Per million |
| --- | ---: | ---: |
| Finland (FI) | 394 | 69.7 |
| Sweden (SE) | 698 | 65.79 |
| Cyprus (CY) | 75 | 55.76 |
| Japan (JP) | 6849 | 55.32 |
| Iceland (IS) | 17 | 46.67 |
| United Kingdom (GB) | 3098 | 46.01 |
| Canada (CA) | 1478 | 39.95 |
| Denmark (DK) | 180 | 30.91 |
| Poland (PL) | 916 | 24.39 |
| Estonia (EE) | 32 | 23.36 |

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
| Ark: Survival of the Fittest | Studio Wildcard | Instinct Games, Virtual Basement LLC, Efecto Studios |
| House Flipper | Empyrean | Frozen District, Ultimate Games |
| Deceit | Automaton | World Makers |
| Final Fantasy XIV Online | Square Enix Product Development Division 3 | Square Enix Creative Business Unit III, Square Enix Business Division 5, Square Enix Creative Studio 3 |
| Content Warning | Zorro | Wilnyl, Philip, thePetHen, Skog |
| Kingdom: Classic | Noio | Licorice |
| Devour | Joe Fender | Straight Back Games |
| Silent Hill 3 | Team Silent | Konami Computer Entertainment Tokyo |
| Ryse: Son of Rome | Crytek Frankfurt | Crytek |
| Super Mario 3D World | Nintendo Entertainment Analysis & Development | Nintendo, Nintendo EAD |
| Barotrauma | FakeFish | Undertow Games |
| Darksiders II: Deathinitive Edition | Vigil Games | THQ Nordic, Gunfire Games |
| Code Vein | Shift | Bandai Namco Studios |
| Mario Kart 7 | Nintendo EAD Software Development Group No.1 | Nintendo |
| TBH: Task Bar Hero | Nugem Studio | Tesseract Studio |
| Resident Evil: Revelations | Capcom | Tose |
| Super Smash Bros. for Nintendo 3DS | Bandai Namco Games | Sora |
| Streets of Rage 2 | Ancient | H.I.C., Shout! Designworks, MNM Software |
| Disney's Aladdin | Virgin Games USA | Virgin Interactive Entertainment (Europe) Ltd. |
| Assassin's Creed III: Liberation | Ubisoft Sofia | Ubisoft Milan |
| Super Mario Party | NDCube | Nintendo |
| Kingdom: New Lands | Licorice | Noio |
| Call to Arms: Gates of Hell - Ostfront | Barbedwire Studios | Digitalmindsoft |
| Super Mario Maker | Nintendo EAD Software Development Group No.4 | Nintendo |

## Lead studios without a city

Top 30 by games led

| Id | Name | Precision | Country | Games led |
| ---: | --- | --- | --- | ---: |
| 17208 | Ripknot Systems | none |  | 39 |
| 9150 | MicroProse Software, Inc. | country | US | 35 |
| 9509 | Warfare Studios | country | BR | 32 |
| 21681 | EnsenaSoft | country | MX | 32 |
| 159 | Konami Computer Entertainment Tokyo | country | JP | 31 |
| 15663 | Nikita "Ghost_RUS" | country | RU | 31 |
| 3118 | MumboJumbo | country | US | 30 |
| 14914 | Chilla's Art | country | JP | 29 |
| 1831 | Compile | country | JP | 28 |
| 21233 | Anatoliy Loginovskikh | none |  | 28 |
| 11203 | Quiet River | country | RU | 26 |
| 14313 | RewindApp | country | RU | 26 |
| 13358 | FIVE-BN GAMES | country | UA | 24 |
| 30868 | Laush Dmitriy Sergeevich | none |  | 24 |
| 213 | Infogrames | country | FR | 23 |
| 528 | SSI (Strategic Simulations, Inc.) | country | US | 22 |
| 2521 | Mattel Electronics | country | US | 22 |
| 12568 | Frontwing | country | JP | 21 |
| 16347 | Choice of Games | country | US | 21 |
| 17560 | Creobit | country | RU | 21 |
| 5187 | 07th Expansion | country | JP | 19 |
| 13144 | Blender Games | none |  | 19 |
| 13387 | Racing Bros | none |  | 19 |
| 40913 | Volens Nolens Games | country | RU | 19 |
| 144 | GSC Game World | country | CZ | 18 |
| 2252 | Compile Heart | country | JP | 18 |
| 10955 | Sometimes You | country | RU | 18 |
| 24182 | Mateusz Skutnik | country | PL | 18 |
| 903 | Interplay Productions | country | US | 17 |
| 46928 | Very Very Little Studio | none |  | 17 |
