import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompanyGamesFile, Company, DataMeta, FlowsFile, GameDetail, GameSummary, StatsFile } from '../../shared/model';
import { emit } from './emit';
import { merge } from './merge';
import { buildSpotCheck, formatSummary, parseValidateArgs, runValidation, validateOutput } from './validate';
import { syntheticInput } from './test-factories';

let dir: string;
let out: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'validate-'));
  out = join(dir, 'data');
  await emit(merge(syntheticInput(30)), { outDir: out, reportDir: join(dir, 'reports') }, {
    retrieved: '2026-01-01',
    countries: { JP: { population: 124_000_000, year: 2024, qid: 'Q17' }, US: { population: 340_000_000, year: 2024, qid: 'Q30' } },
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function edit<T>(file: string, fn: (data: T) => void): void {
  const p = join(out, file);
  const data = JSON.parse(readFileSync(p, 'utf8')) as T;
  fn(data);
  writeFileSync(p, JSON.stringify(data));
}

function failed(): string[] {
  return validateOutput(out).checks.filter((c) => !c.passed).map((c) => c.name);
}

describe('validateOutput', () => {
  it('end to end: a 30-game synthetic merge emits and validates with zero hard failures', () => {
    const r = validateOutput(out);
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.totals.games).toBe(30);
    expect(r.precision.none.count).toBeGreaterThan(0);
    expect(r.flaggedCompanies.length).toBe(r.precision.none.count);
    expect(r.roleCounts.lead_developer).toBe(30);
    expect(r.countryOnlyLeadShare.total).toBe(30);
    for (const f of ['company-games.json', 'stats.json', 'flows.json']) expect(existsSync(join(out, f))).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(expect.arrayContaining(['company-games', 'stats-file', 'flows-file']));
    expect(r.insights.topCountriesByGamesLed.length).toBeGreaterThan(0);
    expect(Object.values(r.leadBasisCounts).reduce((a, b) => a + b, 0)).toBe(30);
  });

  it('catches a game whose leadCompanyId is missing', () => {
    edit<GameSummary[]>('games.json', (g) => { delete (g[0] as Partial<GameSummary>).leadCompanyId; });
    expect(failed()).toContain('game-leads');
  });

  it('catches a lead company that is not in companies.json', () => {
    edit<GameSummary[]>('games.json', (g) => { g[0]!.leadCompanyId = 999_999; });
    expect(failed()).toContain('game-leads');
  });

  it('catches a detail without exactly one matching lead_developer role', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d[0]!.roles = d[0]!.roles.filter((r) => r.role !== 'lead_developer'); });
    expect(failed()).toContain('game-leads');
  });

  it('catches two lead_developer roles', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d[0]!.roles.push({ ...d[0]!.roles[0]! }); });
    expect(failed()).toContain('game-leads');
  });

  it('catches a lead role for a different company', () => {
    edit<GameDetail[]>('details/0.json', (d) => {
      const lead = d[0]!.roles.find((r) => r.role === 'lead_developer')!;
      lead.companyId = 13;
    });
    expect(failed()).toContain('game-leads');
  });

  it('catches a company without a source', () => {
    edit<Company[]>('companies.json', (c) => { c[0]!.sources = []; });
    expect(failed()).toContain('source-ids');
  });

  it('catches an empty source id on a role and on a detail', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d[0]!.roles[0]!.source.id = ''; });
    expect(failed()).toContain('source-ids');
    edit<GameDetail[]>('details/0.json', (d) => { d[1]!.sources = []; });
    expect(validateOutput(out).checks.find((c) => c.name === 'source-ids')!.count).toBe(2);
  });

  it('catches precision none with coordinates, and coordinates null without none', () => {
    edit<Company[]>('companies.json', (c) => { c[0]!.precision = 'none'; });
    expect(failed()).toContain('company-coordinates');
  });

  it('catches a city company without coordinates', () => {
    edit<Company[]>('companies.json', (c) => {
      const x = c.find((k) => k.precision === 'city')!;
      x.lat = null;
      x.lng = null;
    });
    expect(failed()).toContain('company-coordinates');
  });

  it('catches (0, 0) and out-of-range coordinates', () => {
    edit<Company[]>('companies.json', (c) => {
      const x = c.filter((k) => k.precision !== 'none');
      x[0]!.lat = 0;
      x[0]!.lng = 0;
      x[1]!.lat = 91;
    });
    expect(validateOutput(out).checks.find((c) => c.name === 'company-coordinates')!.count).toBe(2);
  });

  it('catches a role pointing to an unknown company', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d[0]!.roles.push({ companyId: 888, role: 'publisher', platform: null, year: null, source: { source: 'igdb', id: '1' } }); });
    expect(failed()).toContain('references');
  });

  it('catches an unknown parentId', () => {
    edit<Company[]>('companies.json', (c) => { c[0]!.parentId = 777; });
    expect(failed()).toContain('references');
  });

  it('catches steam.json pointing to an unknown game', () => {
    edit<Record<string, number>>('steam.json', (s) => { s['1'] = 424242; });
    expect(failed()).toContain('references');
  });

  it('catches duplicate ids', () => {
    edit<Company[]>('companies.json', (c) => { c.push({ ...c[0]! }); });
    expect(failed()).toContain('unique-company-ids');
    edit<GameSummary[]>('games.json', (g) => { g.push({ ...g[0]! }); });
    expect(failed()).toContain('unique-game-ids');
  });

  it('catches games not sorted by popularity', () => {
    edit<GameSummary[]>('games.json', (g) => { g.reverse(); });
    expect(failed()).toContain('games-sorted');
  });

  it('catches details chunks that do not match games.json', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d.reverse(); });
    expect(failed()).toContain('details-chunks');
  });

  it('catches a missing details chunk', () => {
    rmSync(join(out, 'details', '0.json'));
    expect(failed()).toContain('details-chunks');
  });

  it('catches meta counts that do not match', () => {
    edit<DataMeta>('meta.json', (m) => { m.counts.companies += 1; });
    expect(failed()).toContain('meta-counts');
    edit<DataMeta>('meta.json', (m) => { m.counts.companies -= 1; m.counts.rolesByType.qa = 5; });
    expect(failed()).toContain('meta-counts');
  });

  it('catches unknown role types', () => {
    edit<GameDetail[]>('details/0.json', (d) => { (d[0]!.roles[1] as { role: string }).role = 'wizard'; });
    expect(failed()).toContain('role-types');
  });

  it('catches companies with gameCount 0', () => {
    edit<Company[]>('companies.json', (c) => { c[0]!.gameCount = 0; });
    expect(failed()).toContain('company-game-count');
  });

  it('catches a missing company-games.json', () => {
    rmSync(join(out, 'company-games.json'));
    expect(failed()).toEqual(['company-games']);
  });

  it('catches a company-games pair that disagrees with the details', () => {
    edit<CompanyGamesFile>('company-games.json', (f) => { f['1']!.push(2, 0); });
    expect(failed()).toContain('company-games');
  });

  it('catches a (company, game, role) missing from company-games.json', () => {
    edit<CompanyGamesFile>('company-games.json', (f) => { f['1']!.splice(0, 2); });
    expect(failed()).toContain('company-games');
  });

  it('catches a company without an entry in company-games.json', () => {
    edit<CompanyGamesFile>('company-games.json', (f) => { delete f['1']; });
    expect(failed()).toContain('company-games');
  });

  it('catches missing or malformed stats.json', () => {
    edit<StatsFile>('stats.json', (s) => { (s as unknown as { years: unknown }).years = 'x'; });
    expect(failed()).toEqual(['stats-file']);
    rmSync(join(out, 'stats.json'));
    expect(failed()).toEqual(['stats-file']);
  });

  it('catches a stats gamesLed sum that does not match the games with a lead country', () => {
    edit<StatsFile>('stats.json', (s) => { s.countries[0]!.gamesLed += 1; });
    expect(failed()).toEqual(['stats-file']);
  });

  it('catches missing flows.json, unknown examples and lead_developer flows', () => {
    edit<FlowsFile>('flows.json', (f) => { f.flows.push({ role: 'publisher', from: 'JP', to: 'US', games: 1, examples: [987654] }); });
    expect(failed()).toEqual(['flows-file']);
    edit<FlowsFile>('flows.json', (f) => { f.flows = [{ role: 'lead_developer', from: 'JP', to: 'US', games: 1, examples: [1] }]; });
    expect(failed()).toEqual(['flows-file']);
    rmSync(join(out, 'flows.json'));
    expect(failed()).toEqual(['flows-file']);
  });

  it('catches located companies without a location source or basis', () => {
    edit<Company[]>('companies.json', (c) => {
      const x = c.filter((k) => k.precision !== 'none');
      x[0]!.locationSource = null;
      x[1]!.locationBasis = null;
    });
    expect(failed()).toEqual(['company-location-fields']);
    expect(validateOutput(out).checks.find((c) => c.name === 'company-location-fields')!.count).toBe(2);
  });

  it('catches precision city without a city name', () => {
    edit<Company[]>('companies.json', (c) => { c.find((k) => k.precision === 'city')!.city = ' '; });
    expect(failed()).toEqual(['company-location-fields']);
    edit<Company[]>('companies.json', (c) => { c.find((k) => k.precision === 'city')!.city = null; });
    expect(failed()).toEqual(['company-location-fields']);
  });

  it('catches precision none with a location basis', () => {
    edit<Company[]>('companies.json', (c) => { c.find((k) => k.precision === 'none')!.locationBasis = 'country'; });
    expect(failed()).toEqual(['company-location-fields']);
  });

  it('warns, without failing, about coordinates far from the stated country', () => {
    const before = validateOutput(out).warnings[0]!;
    expect(before.name).toBe('Coordinates far from the stated country');
    edit<Company[]>('companies.json', (c) => {
      const x = c.find((k) => k.precision === 'country')!;
      x.country = 'FR';
      x.lat = -33.9;
      x.lng = 151.2;
    });
    const r = validateOutput(out);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]!.count).toBe(before.count + 1);
    expect(r.warnings[0]!.items.some((i) => /\(FR,/.test(i))).toBe(true);
    const md = formatSummary(r);
    expect(md).toContain(`Coordinates far from the stated country: ${before.count + 1}`);
    expect(md).toContain('Overseas territories');
  });

  it('lists low-confidence leads in the markdown', () => {
    edit<GameDetail[]>('details/0.json', (d) => { d[0]!.leadBasis = 'igdb_first_developer'; });
    const r = validateOutput(out);
    expect(r.lowConfidenceLeads).toHaveLength(1);
    expect(formatSummary(r)).toContain('## Low-confidence leads');
  });

  it('fails cleanly when files are missing', () => {
    rmSync(join(out, 'games.json'));
    const r = validateOutput(out);
    expect(r.ok).toBe(false);
    expect(r.checks[0]!.name).toBe('files');
  });
});

describe('validation reports', () => {
  it('writes validation.json, validation.md and spot-check.md', () => {
    const reportDir = join(dir, 'reports');
    const result = runValidation({ outDir: out, reportDir, sample: 5, seed: 3 });
    expect(result.ok).toBe(true);
    for (const f of ['validation.json', 'validation.md', 'spot-check.md']) expect(existsSync(join(reportDir, f))).toBe(true);
    const md = readFileSync(join(reportDir, 'validation.md'), 'utf8');
    expect(md).toContain('Verdict: PASS');
    expect(md).toContain('| lead_developer | 30 |');
    expect(md).toContain('## Insights');
    expect(md).toContain('Top 10 countries by games led');
    expect(md).toContain('Top 10 localization flows');
    expect(md).toContain('Top 10 QA flows');
    expect(md).toContain('## Lead studios without a city');
    expect(md).toContain('Nowhere Games');
    expect(JSON.parse(readFileSync(join(reportDir, 'validation.json'), 'utf8')).ok).toBe(true);
  });

  it('shows the verdict FAIL in the summary', () => {
    edit<GameSummary[]>('games.json', (g) => { g.reverse(); });
    expect(formatSummary(validateOutput(out))).toContain('Verdict: FAIL');
  });

  it('spot check is seeded and lists lead studio and roles', () => {
    const a = buildSpotCheck(out, 6, 1);
    expect(buildSpotCheck(out, 6, 1)).toBe(a);
    expect(buildSpotCheck(out, 6, 2)).not.toBe(a);
    expect(a.match(/^## /gm)).toHaveLength(6);
    expect(a).toContain('https://www.igdb.com/games/game-');
    expect(a).toContain('Lead chosen by: igdb_single_developer');
    expect(a).toContain('| lead_developer |');
    expect(buildSpotCheck(out, 100, 1).match(/^## /gm)).toHaveLength(30);
  });

  it('parses --sample and --seed', () => {
    expect(parseValidateArgs([])).toEqual({ sample: 20, seed: 1 });
    expect(parseValidateArgs(['--sample=7', '--seed=9'])).toEqual({ sample: 7, seed: 9 });
    expect(() => parseValidateArgs(['--sample=x'])).toThrow();
  });
});
