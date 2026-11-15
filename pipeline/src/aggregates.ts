import {
  ROLE_TYPES,
  type CompanyGamesFile,
  type CountryFlow,
  type CountryStats,
  type FlowsFile,
  type StatsFile,
  type YearStats,
} from '../../shared/model';
import { countryRegion } from './countries';
import type { MergeResult } from './merge';
import type { RawPopulation } from './raw';

const INDIE_GENRE_ID = 32;
const MAJOR_PUBLISHER_COUNT = 25;
const MAX_EXAMPLES = 3;
const UNKNOWN_REGION = 'Unknown';

type MergeData = Pick<MergeResult, 'companies' | 'games' | 'details'>;

export interface Aggregates {
  stats: StatsFile;
  flows: FlowsFile;
  companyGames: CompanyGamesFile;
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function buildCompanyGames(result: MergeData): CompanyGamesFile {
  const perCompany = new Map<number, Set<number>>();
  const pairs = new Map<number, [number, number, number][]>();
  for (const c of result.companies) {
    perCompany.set(c.id, new Set());
    pairs.set(c.id, []);
  }
  result.details.forEach((d, position) => {
    for (const r of d.roles) {
      const roleIndex = ROLE_TYPES.indexOf(r.role);
      const key = position * ROLE_TYPES.length + roleIndex;
      const seen = perCompany.get(r.companyId);
      if (!seen || seen.has(key)) continue;
      seen.add(key);
      pairs.get(r.companyId)!.push([position, roleIndex, d.id]);
    }
  });
  const out: CompanyGamesFile = {};
  for (const id of [...pairs.keys()].sort((a, b) => a - b)) {
    out[String(id)] = pairs
      .get(id)!
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .flatMap(([, roleIndex, gameId]) => [gameId, roleIndex]);
  }
  return out;
}

export function buildFlows(result: MergeData): FlowsFile {
  const countryOf = new Map(result.companies.map((c) => [c.id, c.country]));
  const groups = new Map<string, { role: (typeof ROLE_TYPES)[number]; from: string; to: string; positions: Set<number> }>();
  result.games.forEach((g, position) => {
    const from = countryOf.get(g.leadCompanyId);
    if (!from) return;
    for (const r of result.details[position]!.roles) {
      if (r.role === 'lead_developer') continue;
      const to = countryOf.get(r.companyId);
      if (!to) continue;
      const key = `${r.role}|${from}|${to}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { role: r.role, from, to, positions: new Set() }));
      group.positions.add(position);
    }
  });
  const flows: CountryFlow[] = [...groups.values()].map((g) => ({
    role: g.role,
    from: g.from,
    to: g.to,
    games: g.positions.size,
    examples: [...g.positions].sort((a, b) => a - b).slice(0, MAX_EXAMPLES).map((p) => result.games[p]!.id),
  }));
  flows.sort(
    (a, b) =>
      b.games - a.games ||
      ROLE_TYPES.indexOf(a.role) - ROLE_TYPES.indexOf(b.role) ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  );
  return { flows };
}

export function buildStats(result: MergeData, population: RawPopulation | null): StatsFile {
  const companyById = new Map(result.companies.map((c) => [c.id, c]));

  const countries = new Map<string, CountryStats>();
  const countryFor = (code: string): CountryStats => {
    let c = countries.get(code);
    if (!c) {
      const r = countryRegion(code);
      c = {
        code,
        region: r?.region || UNKNOWN_REGION,
        subregion: r?.subregion ?? '',
        population: population?.countries[code]?.population ?? null,
        studios: 0,
        gamesLed: 0,
        gamesPerMillion: null,
        genres: {},
      };
      countries.set(code, c);
    }
    return c;
  };
  for (const co of result.companies) {
    if (!co.country) continue;
    const c = countryFor(co.country);
    if (co.precision !== 'none') c.studios++;
  }
  for (const g of result.games) {
    const code = companyById.get(g.leadCompanyId)?.country;
    if (!code) continue;
    const c = countryFor(code);
    c.gamesLed++;
    for (const id of g.genres) bump(c.genres, String(id));
  }
  const countryList = [...countries.values()];
  for (const c of countryList) {
    c.gamesPerMillion =
      c.population && c.population > 0 ? Math.round((c.gamesLed / c.population) * 1_000_000 * 100) / 100 : null;
  }
  countryList.sort((a, b) => b.gamesLed - a.gamesLed || a.code.localeCompare(b.code));

  const regions = new Map<string, { region: string; gamesLed: number; genres: Record<string, number> }>();
  for (const c of countryList) {
    let r = regions.get(c.region);
    if (!r) regions.set(c.region, (r = { region: c.region, gamesLed: 0, genres: {} }));
    r.gamesLed += c.gamesLed;
    for (const [id, n] of Object.entries(c.genres)) r.genres[id] = (r.genres[id] ?? 0) + n;
  }
  const regionList = [...regions.values()].sort((a, b) => b.gamesLed - a.gamesLed || a.region.localeCompare(b.region));

  const publisherGames = new Map<number, Set<number>>();
  for (const d of result.details) {
    for (const r of d.roles) {
      if (r.role !== 'publisher') continue;
      let set = publisherGames.get(r.companyId);
      if (!set) publisherGames.set(r.companyId, (set = new Set()));
      set.add(d.id);
    }
  }
  const majorPublishers = [...publisherGames.entries()]
    .map(([companyId, games]) => ({ companyId, name: companyById.get(companyId)?.name ?? String(companyId), games: games.size }))
    .sort((a, b) => b.games - a.games || a.companyId - b.companyId)
    .slice(0, MAJOR_PUBLISHER_COUNT);
  const majorIds = new Set(majorPublishers.map((m) => m.companyId));

  const years = new Map<number, YearStats>();
  result.games.forEach((g, position) => {
    if (g.year === null) return;
    let y = years.get(g.year);
    if (!y) years.set(g.year, (y = { year: g.year, total: 0, indie: 0, majorPublisher: 0 }));
    y.total++;
    if (g.genres.includes(INDIE_GENRE_ID)) y.indie++;
    const isMajor = result.details[position]!.roles.some((r) => {
      if (r.role !== 'publisher') return false;
      if (majorIds.has(r.companyId)) return true;
      const parent = companyById.get(r.companyId)?.parentId;
      return parent !== null && parent !== undefined && majorIds.has(parent);
    });
    if (isMajor) y.majorPublisher++;
  });

  return {
    countries: countryList,
    regions: regionList,
    years: [...years.values()].sort((a, b) => a.year - b.year),
    majorPublishers,
    populationSource: {
      name: 'Wikidata',
      url: 'https://www.wikidata.org',
      licence: 'CC0 1.0',
      retrieved: population?.retrieved ?? '',
    },
  };
}

export function buildAggregates(result: MergeData, population: RawPopulation | null): Aggregates {
  return {
    stats: buildStats(result, population),
    flows: buildFlows(result),
    companyGames: buildCompanyGames(result),
  };
}
