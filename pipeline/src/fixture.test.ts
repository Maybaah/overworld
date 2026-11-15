import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateFixture, writeFixture } from './fixture';

const fixture = generateFixture();

function snapshot(dir: string): string {
  const files = ['meta.json', 'companies.json', 'games.json', 'steam.json'];
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
});
