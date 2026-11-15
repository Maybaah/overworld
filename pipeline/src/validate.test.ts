import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Company, DataMeta, GameDetail, GameSummary } from '../../shared/model';
import { emit } from './emit';
import { merge } from './merge';
import { buildSpotCheck, formatSummary, parseValidateArgs, runValidation, validateOutput } from './validate';
import { syntheticInput } from './test-factories';

let dir: string;
let out: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'validate-'));
  out = join(dir, 'data');
  await emit(merge(syntheticInput(30)), { outDir: out, reportDir: join(dir, 'reports') });
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
