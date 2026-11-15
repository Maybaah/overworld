export const SOURCE_NAMES = ['igdb', 'wikidata', 'mobygames', 'curated'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export interface SourceRef {
  source: SourceName;
  id: string;
  url?: string;
}

export const ROLE_TYPES = [
  'lead_developer',
  'co_developer',
  'port',
  'publisher',
  'localization',
  'qa',
  'art',
  'audio',
  'support',
] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

// 'city' = coordinates of the headquarters city.
// 'country' = only the country is known; coordinates are the country's centre.
// 'none' = no location at all; the company is listed in the validation report and not drawn.
export type LocationPrecision = 'city' | 'country' | 'none';

export interface Company {
  id: number;
  name: string;
  country: string | null; // ISO 3166-1 alpha-2
  city: string | null;
  lat: number | null;
  lng: number | null;
  precision: LocationPrecision;
  locationSource: SourceRef | null;
  founded: number | null;
  parentId: number | null;
  firstYear: number | null;
  lastYear: number | null;
  gameCount: number;
  leadCount: number;
  sources: SourceRef[];
}

// How the lead studio was chosen, so a wrong pick can be traced.
export type LeadBasis =
  | 'igdb_single_developer'
  | 'igdb_developer_confirmed_by_wikidata'
  | 'igdb_first_developer'
  | 'wikidata_developer'
  | 'mobygames_developer';

export interface GameSummary {
  id: number;
  name: string;
  slug: string;
  year: number | null;
  leadCompanyId: number;
  popularity: number;
  genres: number[];
  cover: string | null; // IGDB image_id
  indie: boolean;
}

export interface GameCompanyRole {
  companyId: number;
  role: RoleType;
  platform: string | null;
  year: number | null;
  source: SourceRef;
}

export interface GameDetail {
  id: number;
  leadBasis: LeadBasis;
  platforms: string[];
  screenshots: string[]; // IGDB image_ids
  steamAppId: number | null;
  roles: GameCompanyRole[];
  sources: SourceRef[];
}

export interface DataMeta {
  generatedAt: string;
  schemaVersion: number;
  fixture?: boolean; // true for generated sample data, never for pipeline output
  counts: {
    games: number;
    companies: number;
    roles: number;
    rolesByType: Record<RoleType, number>;
  };
  genres: { id: number; name: string }[];
  detailChunkSize: number;
  detailChunks: number;
  attribution: { source: SourceName; name: string; url: string; licence: string }[];
}

// Files written to web/public/data/:
//   meta.json                DataMeta
//   companies.json           Company[]
//   games.json               GameSummary[], sorted by popularity (most popular first)
//   details/<n>.json         GameDetail[] for games at positions n*detailChunkSize .. in games.json
//   steam.json               Record<steamAppId, gameId>
//   company-games.json       CompanyGamesFile, loaded when a company is opened
//   flows.json, stats.json   Phase 4 aggregates
// Every (game, role) a company has, keyed by company id, as flat pairs
// [gameId, roleIndex, gameId, roleIndex, ...] where roleIndex is the position in ROLE_TYPES.
// Pairs are ordered by the game's position in games.json, then roleIndex.
export type CompanyGamesFile = Record<string, number[]>;

// stats.json
export interface CountryStats {
  code: string; // ISO alpha-2
  region: string;
  subregion: string;
  population: number | null;
  studios: number; // located companies
  gamesLed: number; // games whose lead studio is here
  gamesPerMillion: number | null;
  genres: Record<string, number>; // genre id → games led here
}

export interface YearStats {
  year: number;
  total: number;
  indie: number; // IGDB genre "Indie"
  majorPublisher: number; // published by one of majorPublishers or a company they own
}

export interface StatsFile {
  countries: CountryStats[]; // sorted by gamesLed, highest first
  regions: { region: string; gamesLed: number; genres: Record<string, number> }[];
  years: YearStats[];
  // The 25 companies that published the most games in the set. "Major publisher" is this
  // list, not an industry label: no source marks games as AAA.
  majorPublishers: { companyId: number; name: string; games: number }[];
  populationSource: { name: string; url: string; licence: string; retrieved: string };
}

// flows.json: how work moves between countries. One entry per (role, from, to) where
// `from` is the lead studio's country and `to` is the other company's country.
// Same-country pairs are included (from === to). Lead roles are never in this file.
export interface CountryFlow {
  role: RoleType;
  from: string;
  to: string;
  games: number;
  examples: number[]; // up to 3 game ids, most popular first
}

export interface FlowsFile {
  flows: CountryFlow[]; // sorted by games, highest first
}

export const SCHEMA_VERSION = 1;
export const DETAIL_CHUNK_SIZE = 250;

export function detailChunkOf(positionInGames: number): number {
  return Math.floor(positionInGames / DETAIL_CHUNK_SIZE);
}
