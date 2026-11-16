// Contracts between pipeline stages. Each fetch stage writes these files to
// pipeline/.cache/stage/ and the merge stage reads them. Fetch stages never
// decide anything about the final model; merge never calls the network.

export const STAGE_FILES = {
  igdbGames: 'igdb-games.json',
  igdbCompanies: 'igdb-companies.json',
  igdbGenres: 'igdb-genres.json',
  wikidataGames: 'wikidata-games.json',
  wikidataCompanies: 'wikidata-companies.json',
  mobygames: 'mobygames.json',
  population: 'population.json',
  steamspy: 'steamspy.json',
  steamReviews: 'steam-reviews.json',
  rawg: 'rawg.json',
} as const;

// One RAWG game; "added" counts the RAWG users who put it on one of their lists.
export interface RawRawgGame {
  id: number;
  slug: string;
  name: string;
  year: number | null;
  added: number;
  ratingsCount: number;
}

// One Steam app from SteamSpy's owner-sorted catalogue; reviews are positive plus negative.
export interface RawSteamApp {
  appid: number;
  name: string;
  reviews: number;
  positive: number;
  ownersLow: number;
  ownersHigh: number;
}

export interface RawPopulation {
  retrieved: string; // ISO date
  countries: Record<string, { population: number; year: number | null; qid: string }>; // key: ISO alpha-2
}

export interface RawIgdbInvolvedCompany {
  id: number;
  company: number;
  developer: boolean;
  publisher: boolean;
  porting: boolean;
  supporting: boolean;
}

export interface RawIgdbGame {
  id: number;
  name: string;
  slug: string;
  url: string;
  firstReleaseDate: number | null; // unix seconds
  totalRatingCount: number;
  gameType: number | null;
  genres: number[];
  platforms: string[]; // platform names
  cover: string | null; // image_id
  screenshots: string[]; // image_ids, at most 5
  involvedCompanies: RawIgdbInvolvedCompany[];
  steamAppId: number | null; // first Steam id listed
  steamAppIds: number[]; // every Steam id listed for the game
  // Estimated players (pipeline/src/audience.ts) once Steam data exists; null in rating-only runs.
  players?: number | null;
  playersBasis?: 'steam' | 'igdb_played' | 'rawg_added' | 'igdb_ratings' | null;
}

export interface RawIgdbCompany {
  id: number;
  name: string;
  slug: string;
  url: string;
  country: number | null; // ISO 3166-1 numeric
  startDate: number | null; // unix seconds
  parent: number | null;
  changedCompanyId: number | null;
}

export interface RawIgdbGenre {
  id: number;
  name: string;
}

export interface RawWikidataEntityRef {
  qid: string;
  label: string;
}

export interface RawWikidataGame {
  igdbGameId: number;
  igdbSlug: string;
  qid: string;
  developers: RawWikidataEntityRef[];
  publishers: RawWikidataEntityRef[];
  countryOfOrigin: string | null; // ISO alpha-2
}

// How a Wikidata item was linked to an IGDB company.
//   'external_id' – the item carries the IGDB company id.
//   'via_game'    – the item is developer/publisher of a Wikidata game that carries the
//                   IGDB game id, and its label or alias equals the IGDB company name
//                   of a company involved in that same game.
//   'name'        – exact label/alias match among video game companies, unique result.
export type WikidataMatchBasis = 'external_id' | 'via_game' | 'name';

export interface RawWikidataCompany {
  igdbCompanyId: number;
  qid: string;
  label: string;
  matchedBy: WikidataMatchBasis;
  hq: { qid: string; label: string; lat: number; lng: number } | null;
  // Which statement the place came from: headquarters location, located-in,
  // or place of formation (weakest: the studio may have moved since).
  hqBasis?: 'headquarters' | 'located_in' | 'formation';
  country: string | null; // ISO alpha-2, from the HQ's country, else the item's country
  inception: number | null; // year
}

export interface RawMobyCompanyRole {
  mobyCompanyId: number;
  companyName: string;
  roleName: string; // as MobyGames names it, e.g. "Published by"
  platform: string | null;
  year: number | null;
}

export interface RawMobyGame {
  igdbGameId: number;
  mobyGameId: number;
  url: string;
  roles: RawMobyCompanyRole[];
}
