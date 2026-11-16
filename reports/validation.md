# Validation report

Verdict: PASS

9966 games, 6241 companies, 29269 roles

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
| lead_developer | 9966 |
| co_developer | 1547 |
| port | 1395 |
| publisher | 15230 |
| localization | 1 |
| qa | 0 |
| art | 1 |
| audio | 1 |
| support | 1128 |

## Companies by location precision

| Precision | Companies | Share |
| --- | ---: | ---: |
| city | 2289 | 36.7% |
| country | 2592 | 41.5% |
| none | 1360 | 21.8% |

Games whose lead studio has only a country-level location: 2469 of 9966 (24.8%)

## Lead basis

| Basis | Games |
| --- | ---: |
| igdb_single_developer | 8642 |
| igdb_developer_confirmed_by_wikidata | 929 |
| igdb_first_developer | 248 |
| curated | 12 |
| igdb_developer_heuristic | 98 |
| wikidata_developer | 37 |

## Flagged companies (no location): 1360

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
| 10603 | doseone | 4 |
| 12755 | NEC Avenue, Ltd. | 4 |
| 22830 | SUPERHOT PRESENTS | 4 |
| 22901 | Riot Forge | 4 |
| 26201 | Yooreka Studio | 4 |
| 36900 | DreadXP | 4 |
| 38886 | Granite Bay Software | 4 |
| 45866 | CDE Entertainment | 4 |
| 45959 | Devcats | 4 |

## Insights

### Top 10 countries by games led

| Country | Games led |
| --- | ---: |
| United States (US) | 2586 |
| Japan (JP) | 2571 |
| United Kingdom (GB) | 1078 |
| Canada (CA) | 588 |
| France (FR) | 356 |
| Sweden (SE) | 277 |
| Germany (DE) | 251 |
| Poland (PL) | 229 |
| Russia (RU) | 143 |
| Australia (AU) | 140 |

### Top 10 countries by games per million people (at least 5 games led)

| Country | Games led | Per million |
| --- | ---: | ---: |
| Sweden (SE) | 277 | 26.11 |
| Finland (FI) | 122 | 21.58 |
| Japan (JP) | 2571 | 20.77 |
| Iceland (IS) | 6 | 16.47 |
| United Kingdom (GB) | 1078 | 16.01 |
| Canada (CA) | 588 | 15.9 |
| Cyprus (CY) | 20 | 14.87 |
| Denmark (DK) | 69 | 11.85 |
| United States (US) | 2586 | 7.6 |
| Czechia (CZ) | 75 | 6.87 |

### Top 10 localization flows (lead studio country to localizer country)

| From | To | Games |
| --- | --- | ---: |

### Top 10 QA flows (lead studio country to QA country)

| From | To | Games |
| --- | --- | ---: |

## Warnings (not failures)

### Coordinates far from the stated country: 1

Overseas territories and distant branch offices can appear here legitimately.

- company 17928 "Metronomik" (MY, Kuala Lumpur): 1205 km from the country centre, limit 811 km

## Low-confidence leads

Games with several IGDB developers where nothing told them apart (first 30 by popularity).

| Game | Chosen lead | Other developers |
| --- | --- | --- |
| NieR:Automata | PlatinumGames | Square Enix Business Division 6 |
| Final Fantasy XV | Square Enix Business Division 2 | Luminous Productions |
| Far Cry | Crytek Frankfurt | Crytek |
| Yakuza 0 | Ryu Ga Gotoku Studio | Sega Games |
| Super Mario 3D World | Nintendo Entertainment Analysis & Development | Nintendo |
| Silent Hill 3 | Team Silent | Konami Computer Entertainment Tokyo |
| Ryse: Son of Rome | Crytek Frankfurt | Crytek |
| Mario Kart 7 | Nintendo EAD Software Development Group No.1 | Nintendo |
| Final Fantasy XIV Online | Square Enix Product Development Division 3 | Square Enix Creative Business Unit III, Square Enix Business Division 5, Square Enix Creative Studio 3 |
| Super Mario Maker | Nintendo EAD Software Development Group No.4 | Nintendo |
| Super Smash Bros. for Nintendo 3DS | Bandai Namco Games | Sora |
| Code Vein | Shift | Bandai Namco Studios |
| Streets of Rage 2 | Ancient | H.I.C., Shout! Designworks, MNM Software |
| Assassin's Creed III: Liberation | Ubisoft Sofia | Ubisoft Milan |
| Disney's Aladdin | Virgin Games USA | Virgin Interactive Entertainment (Europe) Ltd. |
| Super Mario Party | NDCube | Nintendo |
| Dawn of Discovery | Related Designs | Blue Byte |
| The Godfather | Headgate Studios | Page 44 Studios |
| Captain Toad: Treasure Tracker | Nintendo EAD Software Development Group No.2 | Nintendo |
| Ōkami HD | Clover Studio | Capcom |
| Brotato | Blobfish | Erabit Studios |
| Resident Evil: Revelations | Capcom | Tose |
| House Flipper | Empyrean | Frozen District, Ultimate Games |
| Darksiders II: Deathinitive Edition | Vigil Games | THQ Nordic, Gunfire Games |
| Gravity Rush Remastered | SCE Japan Studio | Project Siren |
| Kingdom: New Lands | Licorice | Noio |
| Metin2 | Ymir Entertainment Co., Ltd | Webzen |
| Nintendo Land | Nintendo EAD Software Development Group No.2 | Nintendo |
| Kingdom: Classic | Noio | Licorice |
| Warface | Crytek Kiev | Allods Team, MY.GAMES, Astrum Entertainment |

## Lead studios without a city

Top 30 by games led

| Id | Name | Precision | Country | Games led |
| ---: | --- | --- | --- | ---: |
| 159 | Konami Computer Entertainment Tokyo | country | JP | 14 |
| 732 | Project Soul | country | JP | 10 |
| 144 | GSC Game World | country | CZ | 9 |
| 9150 | MicroProse Software, Inc. | country | US | 9 |
| 213 | Infogrames | country | FR | 8 |
| 419 | Project Aces | country | JP | 8 |
| 1831 | Compile | country | JP | 8 |
| 8653 | Scottgames | country | US | 8 |
| 2340 | Codemasters Birmingham | country | GB | 7 |
| 2236 | Freebird Games | country | CA | 6 |
| 9969 | P Studio | country | JP | 6 |
| 32471 | Nintendo R&D4 | country | JP | 6 |
| 575 | Impressions Games | country | GB | 5 |
| 903 | Interplay Productions | country | US | 5 |
| 1272 | Sega Sports R&D | country | JP | 5 |
| 1403 | Minakuchi Engineering | country | JP | 5 |
| 6189 | InterAction Studios | country | GR | 5 |
| 6916 | Bedtime Digital Games | country | DK | 5 |
| 10180 | Team Shinobi | country | JP | 5 |
| 11872 | NEKO WORKs | country | JP | 5 |
| 37610 | Rayll Studios | country | IN | 5 |
| 51808 | 100 Cozy Games | none |  | 5 |
| 24 | Sierra Entertainment | country | US | 4 |
| 402 | Day 1 Studios | country | US | 4 |
| 561 | Magnetic Fields | country | GB | 4 |
| 805 | Other Ocean Interactive | country | CA | 4 |
| 1176 | MPS Labs | country | US | 4 |
| 2009 | United Game Artists | country | JP | 4 |
| 2252 | Compile Heart | country | JP | 4 |
| 2277 | Animation Arts | country | DE | 4 |
