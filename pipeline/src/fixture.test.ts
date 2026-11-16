import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLE_TYPES, type FlowsFile, type StatsFile } from '../../shared/model';
import { generateFixture, writeFixture } from './fixture';

const fixture = generateFixture();

function snapshot(dir: string): string {
  const files = ['meta.json', 'companies.json', 'games.json', 'steam.json', 'company-games.json', 'stats.json', 'flows.json'];
  const parts = files.map((f) => readFileSync(join(dir, f), 'utf8'));
  for (const f of readdirSync(join(dir, 'details')).sort()) parts.push(readFileSync(join(dir, 'details', f), 'utf8'));
  return parts.join('\n');
}

describe('fixture generator', () => {
  it('is deterministic byte for byte', () => {
    const a = mkdtempSync(join(tmpdir(), 'fx-a-'));
    const b = mkdtempSync(join(tmpdir(), 'fx-b-'));
    try {
      writeFixture(a, generateFixture());
      writeFixture(b, generateFixture());
      expect(snapshot(a)).toBe(snapshot(b));
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('has the requested scale and flags', () => {
    expect(fixture.meta.fixture).toBe(true);
    expect(fixture.games).toHaveLength(10_000);
    expect(fixture.companies).toHaveLength(9_000);
    expect(fixture.details).toHaveLength(10_000);
  });

  it('has exactly one lead per game matching the summary', () => {
    fixture.games.forEach((g, i) => {
      const d = fixture.details[i]!;
      expect(d.id).toBe(g.id);
      const leads = d.roles.filter((r) => r.role === 'lead_developer');
      expect(leads).toHaveLength(1);
      expect(leads[0]!.companyId).toBe(g.leadCompanyId);
    });
  });

  it('only references existing companies', () => {
    const ids = new Set(fixture.companies.map((c) => c.id));
    for (const d of fixture.details) for (const r of d.roles) expect(ids.has(r.companyId)).toBe(true);
    for (const g of fixture.games) expect(ids.has(g.leadCompanyId)).toBe(true);
  });

  it('sorts games by popularity, highest first', () => {
    for (let i = 1; i < fixture.games.length; i++) {
      expect(fixture.games[i - 1]!.popularity).toBeGreaterThanOrEqual(fixture.games[i]!.popularity);
    }
  });

  it('covers every role type and the location precisions', () => {
    for (const n of Object.values(fixture.meta.counts.rolesByType)) expect(n).toBeGreaterThan(0);
    const none = fixture.companies.filter((c) => c.precision === 'none');
    const country = fixture.companies.filter((c) => c.precision === 'country');
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((c) => c.lat === null && c.lng === null)).toBe(true);
    expect(country.length / fixture.companies.length).toBeGreaterThan(0.05);
    expect(country.every((c) => c.city === null && c.lat !== null)).toBe(true);
    const nullYear = fixture.games.filter((g) => g.year === null).length / fixture.games.length;
    expect(nullYear).toBeGreaterThan(0.015);
    expect(nullYear).toBeLessThan(0.05);
  });

  it('writes a valid company-games.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-cg-'));
    try {
      writeFixture(dir, fixture);
      const file = JSON.parse(readFileSync(join(dir, 'company-games.json'), 'utf8')) as Record<string, number[]>;
      const position = new Map(fixture.games.map((g, i) => [g.id, i]));
      const companyIds = new Set(fixture.companies.map((c) => String(c.id)));
      let pairs = 0;
      for (const [id, flat] of Object.entries(file)) {
        expect(companyIds.has(id)).toBe(true);
        expect(flat.length % 2).toBe(0);
        let prev = -1;
        for (let i = 0; i < flat.length; i += 2) {
          const pos = position.get(flat[i]!);
          expect(pos).toBeDefined();
          const roleIndex = flat[i + 1]!;
          expect(roleIndex).toBeGreaterThanOrEqual(0);
          expect(roleIndex).toBeLessThan(ROLE_TYPES.length);
          const key = pos! * ROLE_TYPES.length + roleIndex;
          expect(key).toBeGreaterThan(prev);
          prev = key;
          pairs++;
        }
      }
      const expected = new Set<string>();
      for (const d of fixture.details) for (const r of d.roles) expected.add(`${r.companyId}|${d.id}|${ROLE_TYPES.indexOf(r.role)}`);
      expect(pairs).toBe(expected.size);
      const lead = fixture.games[0]!;
      expect(file[String(lead.leadCompanyId)]).toContain(lead.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes stats.json and flows.json that satisfy the validator invariants', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-agg-'));
    try {
      writeFixture(dir, fixture);
      const stats = JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8')) as StatsFile;
      const flowsFile = JSON.parse(readFileSync(join(dir, 'flows.json'), 'utf8')) as FlowsFile;
      for (const key of ['countries', 'regions', 'years', 'majorPublishers'] as const) expect(Array.isArray(stats[key])).toBe(true);
      expect(typeof stats.populationSource).toBe('object');
      for (const c of stats.countries) {
        expect(typeof c.code).toBe('string');
        expect(typeof c.gamesLed).toBe('number');
        expect(typeof c.genres).toBe('object');
      }
      for (const y of stats.years) {
        expect(typeof y.year).toBe('number');
        expect(typeof y.total).toBe('number');
      }
      const companyById = new Map(fixture.companies.map((c) => [c.id, c]));
      const withCountry = fixture.games.filter((g) => companyById.get(g.leadCompanyId)?.country).length;
      expect(stats.countries.reduce((a, c) => a + c.gamesLed, 0)).toBe(withCountry);
      expect(stats.countries.some((c) => c.gamesLed >= 5 && c.gamesPerMillion !== null)).toBe(true);
      expect(stats.majorPublishers).toHaveLength(25);
      expect(stats.years.reduce((a, y) => a + y.indie, 0)).toBe(fixture.games.filter((g) => g.year !== null && g.indie).length);

      const gameIds = new Set(fixture.games.map((g) => g.id));
      expect(Array.isArray(flowsFile.flows)).toBe(true);
      expect(flowsFile.flows.length).toBeGreaterThan(0);
      const known = new Set<string>(ROLE_TYPES);
      for (const f of flowsFile.flows) {
        expect(known.has(f.role)).toBe(true);
        expect(f.role).not.toBe('lead_developer');
        expect(typeof f.from).toBe('string');
        expect(typeof f.to).toBe('string');
        expect(typeof f.games).toBe('number');
        for (const id of f.examples) expect(gameIds.has(id)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
