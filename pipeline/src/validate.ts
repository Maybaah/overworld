import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLE_TYPES,
  type Company,
  type CompanyGamesFile,
  type CountryFlow,
  type FlowsFile,
  type StatsFile,
  type DataMeta,
  type GameCompanyRole,
  type GameDetail,
  type GameSummary,
  type LeadBasis,
  type LocationPrecision,
  type RoleType,
  type SourceRef,
} from '../../shared/model';
import { loadConfig } from './config';
import { countryName } from './countries';

export interface ValidationCheck {
  name: string;
  description: string;
  passed: boolean;
  count: number;
  examples: string[];
}

export interface FlaggedCompany {
  id: number;
  name: string;
  gameCount: number;
}

export interface ValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
  totals: { games: number; companies: number; roles: number };
  roleCounts: Record<string, number>;
  precision: Record<LocationPrecision, { count: number; percent: number }>;
  flaggedCompanies: FlaggedCompany[];
  countryOnlyLeadShare: { count: number; total: number; percent: number };
  leadBasisCounts: Record<string, number>;
  insights: Insights;
}

export interface Insights {
  topCountriesByGamesLed: { code: string; name: string; gamesLed: number }[];
  topCountriesPerMillion: { code: string; name: string; gamesLed: number; gamesPerMillion: number }[];
  topLocalizationFlows: CountryFlow[];
  topQaFlows: CountryFlow[];
}

const MAX_EXAMPLES = 10;
const PRECISIONS: LocationPrecision[] = ['city', 'country', 'none'];

class Check {
  count = 0;
  examples: string[] = [];
  constructor(readonly name: string, readonly description: string) {}
  fail(message: string): void {
    this.count++;
    if (this.examples.length < MAX_EXAMPLES) this.examples.push(message);
  }
  result(): ValidationCheck {
    return { name: this.name, description: this.description, passed: this.count === 0, count: this.count, examples: this.examples };
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function emptyResult(check: Check): ValidationResult {
  return {
    ok: false,
    checks: [check.result()],
    totals: { games: 0, companies: 0, roles: 0 },
    roleCounts: {},
    precision: { city: { count: 0, percent: 0 }, country: { count: 0, percent: 0 }, none: { count: 0, percent: 0 } },
    flaggedCompanies: [],
    countryOnlyLeadShare: { count: 0, total: 0, percent: 0 },
    leadBasisCounts: {},
    insights: { topCountriesByGamesLed: [], topCountriesPerMillion: [], topLocalizationFlows: [], topQaFlows: [] },
  };
}

function badSource(s: SourceRef | undefined | null): boolean {
  return !s || typeof s.source !== 'string' || (s.source as string) === '' || typeof s.id !== 'string' || s.id === '';
}

function noSources(list: SourceRef[] | undefined): boolean {
  return !Array.isArray(list) || list.length === 0 || list.some(badSource);
}

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

function readOptional<T>(file: string, check: Check): T | null {
  if (!existsSync(file)) {
    check.fail(`${path.basename(file)} is missing`);
    return null;
  }
  try {
    return readJson<T>(file);
  } catch (e) {
    check.fail(`${path.basename(file)} is not valid JSON: ${(e as Error).message}`);
    return null;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function statsProblems(stats: unknown): string[] {
  if (!isObject(stats)) return ['stats.json is not an object'];
  const problems: string[] = [];
  for (const key of ['countries', 'regions', 'years', 'majorPublishers']) {
    if (!Array.isArray(stats[key])) problems.push(`stats.${key} is not an array`);
  }
  if (!isObject(stats.populationSource)) problems.push('stats.populationSource is missing');
  if (Array.isArray(stats.countries)) {
    for (const c of stats.countries as unknown[]) {
      if (!isObject(c) || typeof c.code !== 'string' || typeof c.gamesLed !== 'number' || !isObject(c.genres)) {
        problems.push(`malformed country entry ${JSON.stringify(c).slice(0, 80)}`);
      }
    }
  }
  if (Array.isArray(stats.years)) {
    for (const y of stats.years as unknown[]) {
      if (!isObject(y) || typeof y.year !== 'number' || typeof y.total !== 'number') problems.push(`malformed year entry ${JSON.stringify(y).slice(0, 80)}`);
    }
  }
  return problems.slice(0, MAX_EXAMPLES);
}

export function validateOutput(outDir: string): ValidationResult {
  const files = ['meta.json', 'companies.json', 'games.json', 'steam.json'];
  const missing = new Check('files', 'meta.json, companies.json, games.json and steam.json exist and parse');
  let meta!: DataMeta;
  let companies!: Company[];
  let games!: GameSummary[];
  let steam!: Record<string, number>;
  for (const f of files) {
    const p = path.join(outDir, f);
    if (!existsSync(p)) {
      missing.fail(`${f} is missing`);
      continue;
    }
    try {
      const data = readJson<unknown>(p);
      if (f === 'meta.json') meta = data as DataMeta;
      else if (f === 'companies.json') companies = data as Company[];
      else if (f === 'games.json') games = data as GameSummary[];
      else steam = data as Record<string, number>;
    } catch (e) {
      missing.fail(`${f} is not valid JSON: ${(e as Error).message}`);
    }
  }
  if (missing.count > 0) return emptyResult(missing);
  if (!Array.isArray(companies) || !Array.isArray(games) || typeof meta !== 'object' || typeof steam !== 'object') {
    missing.fail('a data file has the wrong top-level shape');
    return emptyResult(missing);
  }

  const chunkSize = meta.detailChunkSize;
  const detailsDir = path.join(outDir, 'details');
  const detailChunks: GameDetail[][] = [];
  const chunkCheck = new Check('details-chunks', 'details/<n>.json files match games.json order and ids, and meta.detailChunks');
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    chunkCheck.fail(`meta.detailChunkSize is invalid: ${String(chunkSize)}`);
  } else {
    const expected = Math.ceil(games.length / chunkSize);
    if (meta.detailChunks !== expected) chunkCheck.fail(`meta.detailChunks is ${meta.detailChunks}, expected ${expected}`);
    const onDisk = existsSync(detailsDir) ? readdirSync(detailsDir).filter((f) => /^\d+\.json$/.test(f)) : [];
    for (const f of onDisk) {
      if (Number(f.slice(0, -5)) >= expected) chunkCheck.fail(`unexpected details/${f}`);
    }
    for (let n = 0; n < expected; n++) {
      const p = path.join(detailsDir, `${n}.json`);
      if (!existsSync(p)) {
        chunkCheck.fail(`details/${n}.json is missing`);
        detailChunks.push([]);
        continue;
      }
      let chunk: GameDetail[];
      try {
        chunk = readJson<GameDetail[]>(p);
      } catch (e) {
        chunkCheck.fail(`details/${n}.json is not valid JSON`);
        detailChunks.push([]);
        continue;
      }
      detailChunks.push(chunk);
      const slice = games.slice(n * chunkSize, (n + 1) * chunkSize);
      if (chunk.length !== slice.length) {
        chunkCheck.fail(`details/${n}.json has ${chunk.length} entries, expected ${slice.length}`);
        continue;
      }
      slice.forEach((g, i) => {
        if (chunk[i]!.id !== g.id) chunkCheck.fail(`details/${n}.json position ${i} is game ${chunk[i]!.id}, expected ${g.id}`);
      });
    }
  }
  const detailByGame = new Map<number, GameDetail>();
  detailChunks.flat().forEach((d) => detailByGame.set(d.id, d));

  const companyById = new Map<number, Company>();
  const dupCompanies = new Check('unique-company-ids', 'company ids are unique');
  for (const c of companies) {
    if (companyById.has(c.id)) dupCompanies.fail(`company ${c.id} appears twice`);
    companyById.set(c.id, c);
  }
  const dupGames = new Check('unique-game-ids', 'game ids are unique');
  const gameIds = new Set<number>();
  for (const g of games) {
    if (gameIds.has(g.id)) dupGames.fail(`game ${g.id} appears twice`);
    gameIds.add(g.id);
  }

  const leads = new Check('game-leads', 'every game has a lead company present in companies.json and exactly one matching lead_developer role');
  for (const g of games) {
    const label = `game ${g.id} "${g.name}"`;
    if (g.leadCompanyId === undefined || g.leadCompanyId === null) {
      leads.fail(`${label}: leadCompanyId missing`);
      continue;
    }
    if (!companyById.has(g.leadCompanyId)) {
      leads.fail(`${label}: lead company ${g.leadCompanyId} not in companies.json`);
      continue;
    }
    const d = detailByGame.get(g.id);
    if (!d) {
      leads.fail(`${label}: no detail record`);
      continue;
    }
    const leadRoles = (d.roles ?? []).filter((r) => r.role === 'lead_developer');
    if (leadRoles.length !== 1 || leadRoles[0]!.companyId !== g.leadCompanyId) {
      leads.fail(`${label}: detail has ${leadRoles.length} lead_developer role(s) for [${leadRoles.map((r) => r.companyId)}], lead is ${g.leadCompanyId}`);
    }
  }

  const sourcesCheck = new Check('source-ids', 'every company, game detail and role has a source with a non-empty source and id');
  for (const c of companies) if (noSources(c.sources)) sourcesCheck.fail(`company ${c.id} "${c.name}"`);
  for (const d of detailByGame.values()) {
    if (noSources(d.sources)) sourcesCheck.fail(`game detail ${d.id}`);
    for (const r of d.roles ?? []) if (badSource(r.source)) sourcesCheck.fail(`game ${d.id} role ${r.role} of company ${r.companyId}`);
  }

  const coords = new Check('company-coordinates', "precision is 'none' exactly when lat/lng are null; city and country need valid coordinates");
  for (const c of companies) {
    const label = `company ${c.id} "${c.name}"`;
    const nullCoords = c.lat === null && c.lng === null;
    if (!PRECISIONS.includes(c.precision)) coords.fail(`${label}: unknown precision ${String(c.precision)}`);
    else if (c.precision === 'none') {
      if (!nullCoords) coords.fail(`${label}: precision none but has coordinates`);
    } else if (!validCoord(c.lat, c.lng)) {
      coords.fail(`${label}: precision ${c.precision} with invalid coordinates (${c.lat}, ${c.lng})`);
    }
    if (c.precision !== 'none' && nullCoords) coords.fail(`${label}: no coordinates but precision ${c.precision}`);
  }

  const refs = new Check('references', 'role.companyId, parentId and steam.json point at existing records');
  for (const c of companies) {
    if (c.parentId !== null && c.parentId !== undefined && !companyById.has(c.parentId)) refs.fail(`company ${c.id}: parentId ${c.parentId} not found`);
  }
  for (const d of detailByGame.values()) {
    for (const r of d.roles ?? []) if (!companyById.has(r.companyId)) refs.fail(`game ${d.id}: role company ${r.companyId} not found`);
  }
  for (const [app, gameId] of Object.entries(steam)) {
    if (!gameIds.has(gameId)) refs.fail(`steam app ${app}: game ${gameId} not found`);
  }

  const sorted = new Check('games-sorted', 'games.json is sorted by popularity, highest first');
  for (let i = 1; i < games.length; i++) {
    if (games[i - 1]!.popularity < games[i]!.popularity) sorted.fail(`position ${i}: ${games[i - 1]!.popularity} before ${games[i]!.popularity}`);
  }

  const roleTypes = new Check('role-types', 'every role has a known role type');
  const known = new Set<string>(ROLE_TYPES);
  const roleCounts: Record<string, number> = Object.fromEntries(ROLE_TYPES.map((r) => [r, 0]));
  let roleTotal = 0;
  for (const d of detailByGame.values()) {
    for (const r of d.roles ?? []) {
      roleTotal++;
      if (!known.has(r.role)) roleTypes.fail(`game ${d.id}: unknown role "${String(r.role)}"`);
      roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;
    }
  }

  const counts = new Check('meta-counts', 'meta.counts match the files');
  const mc = meta.counts;
  if (!mc) counts.fail('meta.counts missing');
  else {
    if (mc.games !== games.length) counts.fail(`meta games ${mc.games} != ${games.length}`);
    if (mc.companies !== companies.length) counts.fail(`meta companies ${mc.companies} != ${companies.length}`);
    if (mc.roles !== roleTotal) counts.fail(`meta roles ${mc.roles} != ${roleTotal}`);
    for (const r of ROLE_TYPES) {
      if (mc.rolesByType?.[r] !== roleCounts[r]) counts.fail(`meta rolesByType.${r} ${mc.rolesByType?.[r]} != ${roleCounts[r]}`);
    }
  }

  const gameCount = new Check('company-game-count', 'every company has gameCount above 0');
  for (const c of companies) if (!(c.gameCount > 0)) gameCount.fail(`company ${c.id} "${c.name}" has gameCount ${c.gameCount}`);

  const cgCheck = new Check('company-games', 'company-games.json exists and matches the (company, game, role) rows in the details chunks');
  const companyGames = readOptional<CompanyGamesFile>(path.join(outDir, 'company-games.json'), cgCheck);
  if (companyGames) {
    const position = new Map(games.map((g, i) => [g.id, i]));
    const expected = new Map<string, Set<string>>();
    for (const d of detailByGame.values()) {
      for (const r of d.roles ?? []) {
        const key = String(r.companyId);
        if (!expected.has(key)) expected.set(key, new Set());
        expected.get(key)!.add(`${d.id}:${ROLE_TYPES.indexOf(r.role)}`);
      }
    }
    for (const c of companies) if (!(String(c.id) in companyGames)) cgCheck.fail(`company ${c.id} has no entry`);
    for (const [key, flat] of Object.entries(companyGames)) {
      if (!Array.isArray(flat) || flat.length % 2 !== 0) {
        cgCheck.fail(`company ${key}: entry is not a flat list of pairs`);
        continue;
      }
      const want = expected.get(key) ?? new Set<string>();
      const got = new Set<string>();
      let prev: [number, number] = [-1, -1];
      for (let i = 0; i < flat.length; i += 2) {
        const gameId = flat[i]!;
        const roleIndex = flat[i + 1]!;
        const id = `${gameId}:${roleIndex}`;
        if (!want.has(id)) cgCheck.fail(`company ${key}: pair [${gameId}, ${roleIndex}] is not in the details`);
        if (got.has(id)) cgCheck.fail(`company ${key}: pair [${gameId}, ${roleIndex}] appears twice`);
        got.add(id);
        const pos = position.get(gameId) ?? -1;
        if (pos < prev[0] || (pos === prev[0] && roleIndex < prev[1])) cgCheck.fail(`company ${key}: pairs out of order at game ${gameId}`);
        prev = [pos, roleIndex];
      }
      for (const id of want) if (!got.has(id)) cgCheck.fail(`company ${key}: details row ${id} (game:role) is missing from company-games.json`);
    }
    for (const key of expected.keys()) if (!(key in companyGames)) cgCheck.fail(`company ${key} has roles but no entry`);
  }

  const statsCheck = new Check('stats-file', 'stats.json is well formed and its gamesLed sum equals the games whose lead studio has a country');
  const stats = readOptional<StatsFile>(path.join(outDir, 'stats.json'), statsCheck);
  if (stats) {
    for (const problem of statsProblems(stats)) statsCheck.fail(problem);
    if (statsCheck.count === 0) {
      const withCountry = games.filter((g) => companyById.get(g.leadCompanyId)?.country).length;
      const sum = stats.countries.reduce((a, c) => a + c.gamesLed, 0);
      if (sum !== withCountry) statsCheck.fail(`countries[].gamesLed sums to ${sum}, expected ${withCountry}`);
    }
  }

  const flowsCheck = new Check('flows-file', 'flows.json is well formed, examples exist in games.json, no lead_developer flow');
  const flowsFile = readOptional<FlowsFile>(path.join(outDir, 'flows.json'), flowsCheck);
  if (flowsFile) {
    if (!Array.isArray(flowsFile.flows)) flowsCheck.fail('flows.json has no flows array');
    else {
      for (const f of flowsFile.flows) {
        const label = `flow ${f?.role} ${f?.from}->${f?.to}`;
        if (!f || !known.has(f.role) || typeof f.from !== 'string' || typeof f.to !== 'string' || typeof f.games !== 'number' || !Array.isArray(f.examples)) {
          flowsCheck.fail(`${label}: malformed`);
          continue;
        }
        if (f.role === 'lead_developer') flowsCheck.fail(`${label}: lead_developer must not be a flow`);
        for (const id of f.examples) if (!gameIds.has(id)) flowsCheck.fail(`${label}: example game ${id} not in games.json`);
      }
    }
  }

  const checks = [missing, chunkCheck, dupCompanies, dupGames, leads, sourcesCheck, coords, refs, sorted, roleTypes, counts, gameCount, cgCheck, statsCheck, flowsCheck].map((c) => c.result());

  const precision = {} as ValidationResult['precision'];
  for (const p of PRECISIONS) {
    const n = companies.filter((c) => c.precision === p).length;
    precision[p] = { count: n, percent: pct(n, companies.length) };
  }
  const flaggedCompanies = companies
    .filter((c) => c.precision === 'none')
    .map((c) => ({ id: c.id, name: c.name, gameCount: c.gameCount }))
    .sort((a, b) => b.gameCount - a.gameCount || a.id - b.id);

  let countryLeads = 0;
  for (const g of games) if (companyById.get(g.leadCompanyId)?.precision === 'country') countryLeads++;

  const leadBasisCounts: Record<string, number> = {};
  for (const d of detailByGame.values()) leadBasisCounts[d.leadBasis as LeadBasis] = (leadBasisCounts[d.leadBasis] ?? 0) + 1;

  return {
    ok: checks.every((c) => c.passed),
    checks,
    totals: { games: games.length, companies: companies.length, roles: roleTotal },
    roleCounts,
    precision,
    flaggedCompanies,
    countryOnlyLeadShare: { count: countryLeads, total: games.length, percent: pct(countryLeads, games.length) },
    leadBasisCounts,
    insights: buildInsights(statsCheck.count === 0 ? stats : null, flowsCheck.count === 0 ? flowsFile : null),
  };
}

function buildInsights(stats: StatsFile | null, flows: FlowsFile | null): Insights {
  const name = (code: string) => countryName(code) ?? code;
  const countries = stats?.countries ?? [];
  const flowList = flows?.flows ?? [];
  return {
    topCountriesByGamesLed: [...countries]
      .sort((a, b) => b.gamesLed - a.gamesLed || a.code.localeCompare(b.code))
      .slice(0, 10)
      .map((c) => ({ code: c.code, name: name(c.code), gamesLed: c.gamesLed })),
    topCountriesPerMillion: countries
      .filter((c) => c.gamesLed >= 5 && c.gamesPerMillion !== null)
      .sort((a, b) => b.gamesPerMillion! - a.gamesPerMillion! || a.code.localeCompare(b.code))
      .slice(0, 10)
      .map((c) => ({ code: c.code, name: name(c.code), gamesLed: c.gamesLed, gamesPerMillion: c.gamesPerMillion! })),
    topLocalizationFlows: flowList.filter((f) => f.role === 'localization').slice(0, 10),
    topQaFlows: flowList.filter((f) => f.role === 'qa').slice(0, 10),
  };
}

export function formatSummary(result: ValidationResult, topFlagged = 50): string {
  const lines: string[] = [];
  lines.push('# Validation report', '');
  lines.push(`Verdict: ${result.ok ? 'PASS' : 'FAIL'}`, '');
  lines.push(`${result.totals.games} games, ${result.totals.companies} companies, ${result.totals.roles} roles`, '');
  lines.push('## Checks', '');
  for (const c of result.checks) {
    lines.push(`- ${c.passed ? 'PASS' : 'FAIL'} ${c.name} (${c.count} problem${c.count === 1 ? '' : 's'}): ${c.description}`);
    for (const e of c.examples) lines.push(`    - ${e}`);
  }
  lines.push('', '## Role counts', '', '| Role | Count |', '| --- | ---: |');
  for (const [role, n] of Object.entries(result.roleCounts)) lines.push(`| ${role} | ${n} |`);
  lines.push('', '## Companies by location precision', '', '| Precision | Companies | Share |', '| --- | ---: | ---: |');
  for (const p of PRECISIONS) lines.push(`| ${p} | ${result.precision[p].count} | ${result.precision[p].percent}% |`);
  const s = result.countryOnlyLeadShare;
  lines.push('', `Games whose lead studio has only a country-level location: ${s.count} of ${s.total} (${s.percent}%)`);
  lines.push('', '## Lead basis', '', '| Basis | Games |', '| --- | ---: |');
  for (const [b, n] of Object.entries(result.leadBasisCounts)) lines.push(`| ${b} | ${n} |`);
  lines.push('', `## Flagged companies (no location): ${result.flaggedCompanies.length}`, '');
  if (result.flaggedCompanies.length > 0) {
    lines.push(`Top ${Math.min(topFlagged, result.flaggedCompanies.length)} by game count`, '', '| Id | Name | Games |', '| ---: | --- | ---: |');
    for (const c of result.flaggedCompanies.slice(0, topFlagged)) lines.push(`| ${c.id} | ${c.name.replace(/\|/g, '\\|')} | ${c.gameCount} |`);
  }
  const ins = result.insights;
  lines.push('', '## Insights', '', '### Top 10 countries by games led', '', '| Country | Games led |', '| --- | ---: |');
  for (const c of ins.topCountriesByGamesLed) lines.push(`| ${c.name} (${c.code}) | ${c.gamesLed} |`);
  lines.push('', '### Top 10 countries by games per million people (at least 5 games led)', '', '| Country | Games led | Per million |', '| --- | ---: | ---: |');
  for (const c of ins.topCountriesPerMillion) lines.push(`| ${c.name} (${c.code}) | ${c.gamesLed} | ${c.gamesPerMillion} |`);
  const flowTable = (title: string, flows: CountryFlow[]) => {
    lines.push('', `### ${title}`, '', '| From | To | Games |', '| --- | --- | ---: |');
    for (const f of flows) lines.push(`| ${f.from} | ${f.to} | ${f.games} |`);
  };
  flowTable('Top 10 localization flows (lead studio country to localizer country)', ins.topLocalizationFlows);
  flowTable('Top 10 QA flows (lead studio country to QA country)', ins.topQaFlows);
  return lines.join('\n') + '\n';
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSpotCheck(outDir: string, sample: number, seed: number): string {
  const meta = readJson<DataMeta>(path.join(outDir, 'meta.json'));
  const companies = readJson<Company[]>(path.join(outDir, 'companies.json'));
  const games = readJson<GameSummary[]>(path.join(outDir, 'games.json'));
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const chunks = new Map<number, GameDetail[]>();
  const detailAt = (pos: number): GameDetail | undefined => {
    const n = Math.floor(pos / meta.detailChunkSize);
    if (!chunks.has(n)) {
      const p = path.join(outDir, 'details', `${n}.json`);
      chunks.set(n, existsSync(p) ? readJson<GameDetail[]>(p) : []);
    }
    return chunks.get(n)![pos % meta.detailChunkSize];
  };

  const rand = mulberry32(seed);
  const count = Math.min(sample, games.length);
  const picks: number[] = [];
  for (let i = 0; i < count; i++) {
    const lo = Math.floor((i * games.length) / count);
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * games.length) / count));
    picks.push(lo + Math.floor(rand() * (hi - lo)));
  }

  const lines = ['# Spot check', '', `${picks.length} games, seed ${seed}, spread across the popularity range (most popular first).`, ''];
  for (const pos of picks) {
    const g = games[pos]!;
    const d = detailAt(pos);
    const igdb = d?.sources.find((s) => s.source === 'igdb');
    const lead = companyById.get(g.leadCompanyId);
    lines.push(`## ${g.name} (${g.year ?? 'year unknown'})`, '');
    lines.push(`- Game id: ${g.id}, popularity rank ${pos + 1} of ${games.length}, popularity ${g.popularity}`);
    lines.push(`- IGDB: ${igdb?.url ?? 'no url'}`);
    if (lead) {
      const place = [lead.city, countryName(lead.country) ?? lead.country].filter(Boolean).join(', ') || 'unknown';
      const where = lead.lat === null ? 'no coordinates' : `${lead.lat}, ${lead.lng}`;
      lines.push(`- Lead studio: ${lead.name} (company ${lead.id})`);
      lines.push(`  - Location: ${place}; ${where}; precision ${lead.precision}`);
      lines.push(`  - Location source: ${lead.locationSource?.url ?? 'none'}`);
    } else {
      lines.push(`- Lead studio: company ${g.leadCompanyId} NOT FOUND`);
    }
    lines.push(`- Lead chosen by: ${d?.leadBasis ?? 'unknown'}`, '', '| Company | Role | Platform | Source |', '| --- | --- | --- | --- |');
    for (const r of (d?.roles ?? []) as GameCompanyRole[]) {
      const name = companyById.get(r.companyId)?.name ?? `company ${r.companyId} (missing)`;
      lines.push(`| ${name.replace(/\|/g, '\\|')} | ${r.role} | ${r.platform ?? ''} | ${r.source.url ?? `${r.source.source}:${r.source.id}`} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface ValidateOptions {
  outDir: string;
  reportDir: string;
  sample: number;
  seed: number;
}

export function runValidation(options: ValidateOptions): ValidationResult {
  const result = validateOutput(options.outDir);
  mkdirSync(options.reportDir, { recursive: true });
  writeFileSync(path.join(options.reportDir, 'validation.json'), JSON.stringify(result, null, 2));
  const summary = formatSummary(result);
  writeFileSync(path.join(options.reportDir, 'validation.md'), summary);
  if (options.sample > 0 && result.totals.games > 0) {
    try {
      writeFileSync(path.join(options.reportDir, 'spot-check.md'), buildSpotCheck(options.outDir, options.sample, options.seed));
    } catch (e) {
      console.error(`spot-check skipped: ${(e as Error).message}`);
    }
  }
  console.log(summary);
  return result;
}

export function parseValidateArgs(argv: string[]): { sample: number; seed: number } {
  const num = (name: string, fallback: number): number => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    const n = Number(hit.slice(name.length + 3));
    if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid --${name}: ${hit}`);
    return n;
  };
  return { sample: num('sample', 20), seed: num('seed', 1) };
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    const config = loadConfig(argv);
    const result = runValidation({ outDir: config.outDir, reportDir: config.reportDir, ...parseValidateArgs(argv) });
    process.exitCode = result.ok ? 0 : 1;
  } catch (e) {
    console.error(`validate failed: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
