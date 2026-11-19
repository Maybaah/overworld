export const STAGE_FILES = {
  igdbGames: 'igdb-games.json',
  igdbCompanies: 'igdb-companies.json',
  countryStudios: 'country-studios.json',
  countryLeads: 'country-leads.json',
  igdbGenres: 'igdb-genres.json',
  wikidataGames: 'wikidata-games.json',
  wikidataCompanies: 'wikidata-companies.json',
  mobygames: 'mobygames.json',
  population: 'population.json',
  steamspy: 'steamspy.json',
  steamReviews: 'steam-reviews.json',
  rawg: 'rawg.json',
} as const;

export interface RawRawgGame {
  id: number;
  slug: string;
  name: string;
  year: number | null;
  added: number;
  ratingsCount: number;
}

export interface RawSteamApp {
  appid: number;
  name: string;
  reviews: number;
  positive: number;
  ownersLow: number;
  ownersHigh: number;
}

export interface RawPopulation {
  retrieved: string;
  countries: Record<string, { population: number; year: number | null; qid: string }>;
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
  firstReleaseDate: number | null;
  totalRatingCount: number;
  gameType: number | null;
  genres: number[];
  platforms: string[];
  cover: string | null;
  screenshots: string[];
  involvedCompanies: RawIgdbInvolvedCompany[];
  steamAppId: number | null;
  steamAppIds: number[];
  players?: number | null;
  playersBasis?: 'steam' | 'igdb_played' | 'rawg_added' | 'igdb_ratings' | null;
  curated?: boolean;
}

export interface RawIgdbCompany {
  id: number;
  name: string;
  slug: string;
  url: string;
  country: number | null;
  startDate: number | null;
  parent: number | null;
  changedCompanyId: number | null;
  curated?: boolean;
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
  countryOfOrigin: string | null;
}

export type WikidataMatchBasis = 'external_id' | 'via_game' | 'name';

export interface RawWikidataCompany {
  igdbCompanyId: number;
  qid: string;
  label: string;
  matchedBy: WikidataMatchBasis;
  hq: { qid: string; label: string; lat: number; lng: number } | null;
  hqBasis?: 'headquarters' | 'located_in' | 'formation';
  country: string | null;
  inception: number | null;
}

export interface RawMobyCompanyRole {
  mobyCompanyId: number;
  companyName: string;
  roleName: string;
  platform: string | null;
  year: number | null;
}

export interface RawMobyGame {
  igdbGameId: number;
  mobyGameId: number;
  url: string;
  roles: RawMobyCompanyRole[];
}
