import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import countries from 'world-countries';
import {
  DETAIL_CHUNK_SIZE,
  ROLE_TYPES,
  SCHEMA_VERSION,
  type Company,
  type CompanyGamesFile,
  type DataMeta,
  type GameCompanyRole,
  type GameDetail,
  type GameSummary,
  type LeadBasis,
  type RoleType,
  type SourceRef,
} from '../../shared/model';

const GAME_COUNT = 10_000;
const COMPANY_COUNT = 9_000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2026;

const CITY_QUOTA: Record<string, number> = {
  US: 100, JP: 80, CN: 50, GB: 50, DE: 45, FR: 40, CA: 35, KR: 30, SE: 20, PL: 20,
};
const OTHER_CITY_COUNT = 130;
const OTHER_PER_COUNTRY = 4;
const COUNTRY_FACTOR: Record<string, number> = {
  JP: 5, US: 5, GB: 3, CA: 3, FR: 3, DE: 3, SE: 3, PL: 3, KR: 3, CN: 3,
};

const GENRES = [
  'Action', 'Adventure', 'Role-playing', 'Strategy', 'Simulation', 'Puzzle',
  'Platformer', 'Shooter', 'Racing', 'Sports', 'Fighting', 'Horror',
].map((name, i) => ({ id: i + 1, name }));

const PLATFORMS = ['PC', 'PlayStation 5', 'Xbox Series X', 'Nintendo Switch', 'iOS', 'Android', 'Mega Drive', 'SNES'];

const LEAD_BASES: LeadBasis[] = [
  'igdb_single_developer',
  'igdb_developer_confirmed_by_wikidata',
  'igdb_first_developer',
  'wikidata_developer',
  'mobygames_developer',
];

const NON_LEAD_ROLES = ROLE_TYPES.filter((r) => r !== 'lead_developer');
const ROLE_WEIGHTS: Record<RoleType, number> = {
  lead_developer: 0, co_developer: 4, port: 2, publisher: 5, localization: 3, qa: 3, art: 2, audio: 2, support: 3,
};

interface City {
  name: string;
  country: string;
  lat: number;
  lng: number;
  population: number;
}

export interface Fixture {
  meta: DataMeta;
  companies: Company[];
  games: GameSummary[];
  details: GameDetail[];
  steam: Record<string, number>;
  companyGames: CompanyGamesFile;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function loadCities(): City[] {
  const require = createRequire(import.meta.url);
  const raw = require('all-the-cities') as {
    name: string;
    country: string;
    population: number;
    cityId: number;
    loc: { coordinates: [number, number] };
  }[];
  const sorted = raw
    .filter((c) => /^[\x20-\x7e]+$/.test(c.name))
    .sort((a, b) => b.population - a.population || a.cityId - b.cityId);
  const picked: City[] = [];
  const seen = new Set<string>();
  const taken: Record<string, number> = {};
  let others = 0;
  for (const c of sorted) {
    const quota = CITY_QUOTA[c.country];
    const key = `${c.country}|${c.name}`;
    if (seen.has(key)) continue;
    const count = taken[c.country] ?? 0;
    if (quota !== undefined) {
      if (count >= quota) continue;
    } else {
      if (others >= OTHER_CITY_COUNT || count >= OTHER_PER_COUNTRY) continue;
      others++;
    }
    seen.add(key);
    taken[c.country] = count + 1;
    picked.push({
      name: c.name,
      country: c.country,
      lat: c.loc.coordinates[1],
      lng: c.loc.coordinates[0],
      population: c.population,
    });
  }
  return picked;
}

function weightedPicker(weights: number[], rand: () => number): () => number {
  const cum: number[] = [];
  let total = 0;
  for (const w of weights) {
    total += w;
    cum.push(total);
  }
  return () => {
    const x = rand() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

export function generateFixture(seed = 20260101): Fixture {
  const rand = mulberry32(seed);
  const cities = loadCities();
  const pickCity = weightedPicker(
    cities.map((c) => Math.sqrt(c.population) * (COUNTRY_FACTOR[c.country] ?? 1)),
    rand,
  );
  const centres = new Map<string, [number, number]>();
  const countryNames = new Map<string, string>();
  for (const c of countries) {
    centres.set(c.cca2, [c.latlng[0], c.latlng[1]]);
    countryNames.set(c.cca2, c.name.common);
  }
  const cityCountryCentres = cities.filter((c) => centres.has(c.country));
  const pickCountryCity = weightedPicker(
    cityCountryCentres.map((c) => Math.sqrt(c.population) * (COUNTRY_FACTOR[c.country] ?? 1)),
    rand,
  );

  let refCounter = 0;
  const curated = (): SourceRef => ({ source: 'curated', id: `fixture-${++refCounter}` });

  const companies: Company[] = [];
  for (let i = 0; i < COMPANY_COUNT; i++) {
    const id = i + 1;
    const roll = rand();
    let precision: Company['precision'] = 'city';
    if (roll < 0.01) precision = 'none';
    else if (roll < 0.09) precision = 'country';
    let country: string | null = null;
    let city: string | null = null;
    let lat: number | null = null;
    let lng: number | null = null;
    let name: string;
    if (precision === 'city') {
      const c = cities[i < cities.length ? i : pickCity()]!;
      country = c.country;
      city = c.name;
      lat = c.lat + (rand() - 0.5) * 0.08;
      lng = c.lng + (rand() - 0.5) * 0.08;
      name = `Studio ${c.name} ${id}`;
    } else if (precision === 'country') {
      const c = cityCountryCentres[pickCountryCity()]!;
      country = c.country;
      [lat, lng] = centres.get(c.country)!;
      name = `Studio ${countryNames.get(c.country)} ${id}`;
    } else {
      name = `Studio Nowhere ${id}`;
    }
    const founded = rand() < 0.85 ? MIN_YEAR + Math.floor(rand() * 54) : null;
    companies.push({
      id,
      name,
      country,
      city,
      lat,
      lng,
      precision,
      locationSource: precision === 'none' ? null : curated(),
      founded,
      parentId: id > 1 && rand() < 0.05 ? 1 + Math.floor(rand() * (id - 1)) : null,
      firstYear: null,
      lastYear: null,
      gameCount: 0,
      leadCount: 0,
      sources: [curated()],
    });
  }

  const pickRoleType = weightedPicker(NON_LEAD_ROLES.map((r) => ROLE_WEIGHTS[r]), rand);
  const unsorted: { summary: GameSummary; detail: Omit<GameDetail, 'id'> }[] = [];
  for (let i = 0; i < GAME_COUNT; i++) {
    const id = 1000 + i * 3 + Math.floor(rand() * 3);
    const year =
      rand() < 0.03 ? null : Math.min(MAX_YEAR, MIN_YEAR + Math.floor((MAX_YEAR - MIN_YEAR + 1) * Math.pow(rand(), 0.4)));
    const leadIdx = Math.floor(COMPANY_COUNT * Math.pow(rand(), 1.8));
    const leadCompanyId = ((leadIdx * 7919) % COMPANY_COUNT) + 1;
    const popularity = Math.round(1_000_000 * Math.pow(rand(), 4));
    const genreCount = 1 + Math.floor(rand() * 3);
    const genres = new Set<number>();
    while (genres.size < genreCount) genres.add(1 + Math.floor(rand() * GENRES.length));
    const platformCount = 1 + Math.floor(rand() * 3);
    const platforms = new Set<string>();
    while (platforms.size < platformCount) platforms.add(PLATFORMS[Math.floor(rand() * PLATFORMS.length)]!);
    const platformList = [...platforms];
    const label = pad(i + 1, 4);

    const roles: GameCompanyRole[] = [
      { companyId: leadCompanyId, role: 'lead_developer', platform: null, year, source: curated() },
    ];
    const extra = Math.floor(Math.pow(rand(), 1.5) * 13);
    for (let r = 0; r < extra; r++) {
      roles.push({
        companyId: 1 + Math.floor(rand() * COMPANY_COUNT),
        role: NON_LEAD_ROLES[pickRoleType()]!,
        platform: rand() < 0.5 ? platformList[Math.floor(rand() * platformList.length)]! : null,
        year,
        source: curated(),
      });
    }
    const shotCount = rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 4);
    const steamAppId = rand() < 0.4 ? 100_000 + id : null;
    unsorted.push({
      summary: {
        id,
        name: `Sample Game ${label}`,
        slug: `sample-game-${label}`,
        year,
        leadCompanyId,
        popularity,
        genres: [...genres].sort((a, b) => a - b),
        cover: rand() < 0.6 ? `fixture-cover-${id}` : null,
        indie: rand() < 0.35,
      },
      detail: {
        leadBasis: LEAD_BASES[Math.floor(rand() * LEAD_BASES.length)]!,
        platforms: platformList,
        screenshots: Array.from({ length: shotCount }, (_, s) => `fixture-shot-${id}-${s}`),
        steamAppId,
        roles,
        sources: [curated()],
      },
    });
  }
  unsorted.sort((a, b) => b.summary.popularity - a.summary.popularity || a.summary.id - b.summary.id);
  const games = unsorted.map((g) => g.summary);
  const details: GameDetail[] = unsorted.map((g) => ({ id: g.summary.id, ...g.detail }));

  const byId = new Map(companies.map((c) => [c.id, c]));
  const rolesByType = Object.fromEntries(ROLE_TYPES.map((r) => [r, 0])) as Record<RoleType, number>;
  let roleTotal = 0;
  const steam: Record<string, number> = {};
  for (let i = 0; i < games.length; i++) {
    const g = games[i]!;
    const d = details[i]!;
    if (d.steamAppId !== null) steam[String(d.steamAppId)] = g.id;
    const seenCompanies = new Set<number>();
    for (const role of d.roles) {
      rolesByType[role.role]++;
      roleTotal++;
      const c = byId.get(role.companyId)!;
      if (!seenCompanies.has(c.id)) {
        seenCompanies.add(c.id);
        c.gameCount++;
        if (g.year !== null) {
          c.firstYear = c.firstYear === null ? g.year : Math.min(c.firstYear, g.year);
          c.lastYear = c.lastYear === null ? g.year : Math.max(c.lastYear, g.year);
        }
      }
    }
    byId.get(g.leadCompanyId)!.leadCount++;
  }

  const companyGames: CompanyGamesFile = {};
  for (const d of details) {
    const perCompany = new Map<number, Set<number>>();
    for (const role of d.roles) {
      let set = perCompany.get(role.companyId);
      if (!set) perCompany.set(role.companyId, (set = new Set()));
      set.add(ROLE_TYPES.indexOf(role.role));
    }
    for (const [companyId, set] of perCompany) {
      const flat = (companyGames[String(companyId)] ??= []);
      for (const roleIndex of [...set].sort((a, b) => a - b)) flat.push(d.id, roleIndex);
    }
  }

  const meta: DataMeta = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: SCHEMA_VERSION,
    fixture: true,
    counts: { games: games.length, companies: companies.length, roles: roleTotal, rolesByType },
    genres: GENRES,
    detailChunkSize: DETAIL_CHUNK_SIZE,
    detailChunks: Math.ceil(games.length / DETAIL_CHUNK_SIZE),
    attribution: [
      { source: 'curated', name: 'Overworld fixture generator', url: 'https://example.invalid/fixture', licence: 'Synthetic sample data' },
    ],
  };

  return { meta, companies, games, details, steam, companyGames };
}

export function writeFixture(outDir: string, fixture: Fixture = generateFixture()): void {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'details'), { recursive: true });
  const write = (name: string, data: unknown) => writeFileSync(join(outDir, name), JSON.stringify(data));
  write('meta.json', fixture.meta);
  write('companies.json', fixture.companies);
  write('games.json', fixture.games);
  write('steam.json', fixture.steam);
  write('company-games.json', fixture.companyGames);
  const size = fixture.meta.detailChunkSize;
  for (let n = 0; n < fixture.meta.detailChunks; n++) {
    write(`details/${n}.json`, fixture.details.slice(n * size, (n + 1) * size));
  }
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(here, '../../web/public/data-fixture');
  writeFixture(out);
  console.log(`fixture written to ${out}`);
}
