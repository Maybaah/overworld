export const SOURCE_NAMES = ['igdb', 'wikidata', 'mobygames', 'steam', 'rawg', 'curated'] as const;
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

export type LocationPrecision = 'city' | 'country' | 'none';

export type LocationBasis =
  | 'correction'
  | 'headquarters'
  | 'located_in'
  | 'formation'
  | 'parent'
  | 'country'
  | 'games_origin';

export interface Company {
  id: number;
  name: string;
  country: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  precision: LocationPrecision;
  locationSource: SourceRef | null;
  locationBasis: LocationBasis | null;
  founded: number | null;
  parentId: number | null;
  firstYear: number | null;
  lastYear: number | null;
  gameCount: number;
  leadCount: number;
  sources: SourceRef[];
}

export type LeadBasis =
  | 'curated'
  | 'igdb_single_developer'
  | 'igdb_developer_confirmed_by_wikidata'
  | 'igdb_developer_heuristic'
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
  cover: string | null;
  indie: boolean;
}

export interface GameCompanyRole {
  companyId: number;
  role: RoleType;
  platform: string | null;
  year: number | null;
  source: SourceRef;
}

export const PERSON_ROLES = ['creator', 'director', 'producer', 'designer', 'writer', 'artist', 'programmer', 'composer', 'sound'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export interface KeyPerson {
  name: string;
  role: PersonRole;
  wikidata: string;
}

export interface GameDetail {
  id: number;
  leadBasis: LeadBasis;
  platforms: string[];
  screenshots: string[];
  steamAppId: number | null;
  roles: GameCompanyRole[];
  sources: SourceRef[];
  players?: number | null;
  playersBasis?: PlayersBasis | null;
  people?: KeyPerson[];
}

export type PlayersBasis = 'steam' | 'igdb_played' | 'rawg_added' | 'igdb_ratings';

export interface DataMeta {
  generatedAt: string;
  schemaVersion: number;
  fixture?: boolean;
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

export type CompanyGamesFile = Record<string, number[]>;

export interface CountryStats {
  code: string;
  region: string;
  subregion: string;
  population: number | null;
  studios: number;
  gamesLed: number;
  gamesPerMillion: number | null;
  genres: Record<string, number>;
}

export interface YearStats {
  year: number;
  total: number;
  indie: number;
  majorPublisher: number;
}

export interface StatsFile {
  countries: CountryStats[];
  regions: { region: string; gamesLed: number; genres: Record<string, number> }[];
  years: YearStats[];
  majorPublishers: { companyId: number; name: string; games: number }[];
  populationSource: { name: string; url: string; licence: string; retrieved: string };
}

export interface CountryFlow {
  role: RoleType;
  from: string;
  to: string;
  games: number;
  examples: number[];
}

export interface FlowsFile {
  flows: CountryFlow[];
}

export const SCHEMA_VERSION = 2;
export const DETAIL_CHUNK_SIZE = 250;

export function detailChunkOf(positionInGames: number): number {
  return Math.floor(positionInGames / DETAIL_CHUNK_SIZE);
}
