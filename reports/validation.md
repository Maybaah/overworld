# Validation report

Verdict: PASS

39002 games, 22151 companies, 114410 roles

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
| lead_developer | 39002 |
| co_developer | 6332 |
| port | 2697 |
| publisher | 64527 |
| localization | 1 |
| qa | 0 |
| art | 1 |
| audio | 1 |
| support | 1849 |

## Companies by location precision

| Precision | Companies | Share |
| --- | ---: | ---: |
| city | 3496 | 15.8% |
| country | 8181 | 36.9% |
| none | 10474 | 47.3% |

Games whose lead studio has only a country-level location: 13078 of 39002 (33.5%)

## Lead basis

| Basis | Games |
| --- | ---: |
| igdb_single_developer | 35428 |
| igdb_developer_confirmed_by_wikidata | 1597 |
| igdb_first_developer | 1201 |
| curated | 12 |
| igdb_developer_heuristic | 253 |
| wikidata_developer | 492 |
| mobygames_developer | 19 |

## Flagged companies (no location): 10474

Top 50 by game count

| Id | Name | Games |
| ---: | --- | ---: |
| 20002901 | Tec Toy Indústria de Brinquedos S.A. | 127 |
| 20007989 | Namco Bandai Games America Inc. | 124 |
| 20000012 | SEGA Enterprises Ltd. | 112 |
| 77767 | Koch Media GmbH (Austria) | 109 |
| 20004480 | Noviy Disk | 106 |
| 20000002 | Electronic Arts, Inc. | 103 |
| 20013596 | Microsoft Corporation | 90 |
| 77268 | Mastertronic Games | 77 |
| 20611 | Kagura Games | 73 |
| 20000024 | Electronic Arts Canada | 72 |
| 20005023 | Focus Home Interactive SAS | 71 |
| 20001942 | Nintendo EAD | 70 |
| 20019807 | Kingstill International Software Services Ltd. | 62 |
| 8031 | Back To Basics Gaming | 52 |
| 11975 | WhisperGames | 50 |
| 20002334 | Sony Interactive Entertainment America LLC | 46 |
| 20014119 | Headup Games GmbH & Co. KG | 45 |
| 20003576 | Ubisoft Entertainment Inc. / Ubisoft Divertissements Inc. | 44 |
| 20031950 | MacPlay Digital, LLC | 44 |
| 20000587 | U.S. Gold Ltd. | 43 |
| 20000544 | Ocean Software Ltd. | 41 |
| 20010420 | Bandai Namco Entertainment Europe S.A.S. | 41 |
| 17208 | Ripknot Systems | 39 |
| 20001518 | Ubi Soft Entertainment Software | 38 |
| 20009625 | Playtronic Industrial Ltda. | 37 |
| 20003445 | 1C Publishing EU s.r.o. | 35 |
| 20004785 | Novitas Vertriebs GmbH | 35 |
| 11359 | Namco Bandai Games Europe S.A.S. | 34 |
| 25230 | St. GIGA | 33 |
| 18911 | Laush Studio | 32 |
| 19866 | Maple Whispering Limited | 32 |
| 20001277 | Sony Interactive Entertainment Europe Ltd. | 32 |
| 20001925 | Traveller's Tales (UK) Ltd. | 32 |
| 7432 | Retroism | 31 |
| 9786 | 22nd Century Toys | 31 |
| 10535 | Acclaim | 31 |
| 20000034 | Atari Europe S.A.S.U. | 31 |
| 20024437 | Nintendo EPD | 31 |
| 20006375 | Cenega Poland Sp. z o.o. | 29 |
| 461 | Fox Interactive | 28 |
| 833 | Ignition Entertainment | 28 |
| 21233 | Anatoliy Loginovskikh | 28 |
| 38591 | Pingle Game Studio | 28 |
| 20020843 | Forever Entertainment S. A. | 28 |
| 20021605 | Digerati Distribution & Marketing LLC | 28 |
| 67297 | SA Industry | 26 |
| 20000858 | Take-Two Interactive Software, Inc. | 26 |
| 20006131 | Empire Interactive Europe Ltd. | 26 |
| 20017674 | Nordic Games GmbH | 25 |
| 30868 | Laush Dmitriy Sergeevich | 24 |

## Insights

### Top 10 countries by games led

| Country | Games led |
| --- | ---: |
| United States (US) | 7442 |
| Japan (JP) | 6849 |
| United Kingdom (GB) | 3099 |
| Canada (CA) | 1479 |
| France (FR) | 1212 |
| Germany (DE) | 1061 |
| Poland (PL) | 916 |
| Russia (RU) | 840 |
| Sweden (SE) | 699 |
| Australia (AU) | 587 |

### Top 10 countries by games per million people (at least 5 games led)

| Country | Games led | Per million |
| --- | ---: | ---: |
| Finland (FI) | 394 | 69.7 |
| Sweden (SE) | 699 | 65.88 |
| Cyprus (CY) | 75 | 55.76 |
| Japan (JP) | 6849 | 55.32 |
| Iceland (IS) | 17 | 46.67 |
| United Kingdom (GB) | 3099 | 46.03 |
| Canada (CA) | 1479 | 39.98 |
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
| Escape the Backrooms | Fancy Games | Blackbird Interactive, Scaretech Studios LLC |
| Brotato | Blobfish | Erabit Studios |
| Yakuza 0 | Ryu Ga Gotoku Studio | Sega Games |
| Far Cry | Crytek Frankfurt | Crytek |
| Final Fantasy XV | Square Enix Business Division 2 | Luminous Productions |
| Ark: Survival of the Fittest | Studio Wildcard | Instinct Games, Virtual Basement LLC, Efecto Studios |
| House Flipper | Empyrean | Red Dot Games, Frozen District, Ultimate Games |
| Deceit | Automaton | World Makers |
| Final Fantasy XIV Online | Square Enix Product Development Division 3 | Square Enix, Square Enix Creative Business Unit III, Square Enix Business Division 5, Square Enix Creative Studio 3 |
| Content Warning | Zorro | Landfall Games, Wilnyl, Philip, thePetHen, Skog |
| Kingdom: Classic | Noio | Licorice, Licorice ehf. |
| Devour | Joe Fender | Straight Back Games |
| Silent Hill 3 | Team Silent | Konami Computer Entertainment Tokyo |
| Ryse: Son of Rome | Crytek Frankfurt | Crytek |
| Super Mario 3D World | Nintendo Entertainment Analysis & Development | Nintendo, Nintendo EAD |
| Barotrauma | FakeFish | Undertow Games |
| Darksiders II: Deathinitive Edition | Vigil Games | THQ Nordic, Gunfire Games |
| Code Vein | Shift | Bandai Namco Studios |
| Mario Kart 7 | Nintendo EAD Software Development Group No.1 | Nintendo, Nintendo EAD |
| TBH: Task Bar Hero | Nugem Studio | Tesseract Studio |
| Resident Evil: Revelations | Capcom | Tose |
| Super Smash Bros. for Nintendo 3DS | Bandai Namco Games | Sora |
| Streets of Rage 2 | Ancient | H.I.C., Shout! Designworks, MNM Software |
| Disney's Aladdin | Virgin Games USA | Virgin Interactive Entertainment (Europe) Ltd., Virgin Games |
| Assassin's Creed III: Liberation | Ubisoft Sofia | Ubisoft Milan, Ubisoft Eood |
| Super Mario Party | NDCube | Nintendo |
| Kingdom: New Lands | Licorice | Noio |
| Call to Arms: Gates of Hell - Ostfront | Barbedwire Studios | Digitalmindsoft |
| Super Mario Maker | Nintendo EAD Software Development Group No.4 | Nintendo, Nintendo EAD |

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
