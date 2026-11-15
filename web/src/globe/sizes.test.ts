import { describe, expect, it } from 'vitest';
import type { Company, GameSummary } from '@shared';
import { buildIndexes } from '../data/indexes';
import { buildTimeline } from '../data/timeline';
import { company, game } from '../data/testData';
import { LEVELS } from './levels';
import { applyYear, NO_YEAR, sizeFor, ZERO_DOT_PX, type LevelBuffers } from './sizes';

describe('sizeFor', () => {
  it('keeps zero at zero', () => {
    for (const l of LEVELS) expect(sizeFor(l, 0)).toBe(0);
  });
  it('is monotonic and clamped', () => {
    for (const l of LEVELS) {
      let prev = 0;
      for (const c of [1, 2, 5, 20, 100, 1000, 5000, 1e6]) {
        const s = sizeFor(l, c);
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
      expect(sizeFor(l, 1e9)).toBe(sizeFor(l, 1e6));
      expect(sizeFor(l, 1)).toBeGreaterThan(0);
    }
  });
  it('grows slower than linearly', () => {
    expect(sizeFor('city', 400) - sizeFor('city', 100)).toBeLessThan(sizeFor('city', 100) * 4);
  });
});

function buffers(companies: Company[], counts: { c: number; ci: number; co: number }): LevelBuffers[] {
  const mk = (level: 'country' | 'city' | 'company', n: number): LevelBuffers => ({
    level,
    size: new Float32Array(n),
    lead: new Float32Array(n),
  });
  const company_ = mk('company', companies.length);
  company_.firstYear = Int16Array.from(companies, (c) => c.firstYear ?? NO_YEAR);
  company_.hidden = Uint8Array.from(companies, (c) => (c.precision === 'none' ? 1 : 0));
  return [mk('country', counts.c), mk('city', counts.ci), company_];
}

describe('applyYear', () => {
  it('shows led places by size and zero-lead companies as a fixed dot after firstYear', () => {
    const companies = [
      company(1, { firstYear: 1990 }),
      company(2, { firstYear: 2000 }),
      company(3, { firstYear: null }),
      company(4, { firstYear: 1990, precision: 'none' }),
    ];
    const [, , comp] = buffers(companies, { c: 1, ci: 1, co: 4 });
    const n = applyYear(comp!, [5, 0, 0, 0], 1995);
    expect(n).toBe(1);
    expect(comp!.size[0]).toBeGreaterThan(ZERO_DOT_PX);
    expect(comp!.lead[0]).toBe(1);
    expect(comp!.size[1]).toBe(0);
    expect(comp!.size[2]).toBe(0);
    expect(comp!.size[3]).toBe(0);

    applyYear(comp!, [0, 0, 0, 0], 2001);
    expect(comp!.size[0]).toBe(ZERO_DOT_PX);
    expect(comp!.lead[0]).toBe(0);
    expect(comp!.size[1]).toBe(ZERO_DOT_PX);
    expect(comp!.size[3]).toBe(0);
  });

  it('hides countries and cities with no led games', () => {
    const [country] = buffers([], { c: 3, ci: 0, co: 0 });
    const n = applyYear(country!, [0, 3, 0], 2000);
    expect(n).toBe(1);
    expect(Array.from(country!.size).map((s) => s > 0)).toEqual([false, true, false]);
  });
});

describe('year step speed', () => {
  it('stays under 2 ms for 100 countries, 600 cities and 9000 companies', () => {
    const companies: Company[] = [];
    for (let i = 0; i < 9000; i++) {
      const city = i % 600;
      companies.push(
        company(i + 1, {
          country: `C${city % 100}`,
          city: `City${city}`,
          lat: (city % 160) - 80,
          lng: (city % 340) - 170,
          firstYear: 1970 + (i % 55),
        }),
      );
    }
    const games: GameSummary[] = [];
    for (let i = 0; i < 10000; i++) {
      games.push(game(i + 1, { year: 1970 + (i % 56), leadCompanyId: (i * 7) % 9000 + 1 }));
    }
    const idx = buildIndexes(companies, games);
    const tl = buildTimeline(idx);
    expect(idx.cities.length).toBe(600);
    expect(idx.countries.length).toBe(100);

    const bufs = buffers(idx.companies, { c: idx.countries.length, ci: idx.cities.length, co: 0 });
    const run = (year: number) => {
      for (const b of bufs) applyYear(b, tl.levelAt(b.level, year), year);
    };
    for (let i = 0; i < 50; i++) run(1970 + (i % 56));

    const steps = 400;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) run(1970 + (i % 56));
    const avg = (performance.now() - t0) / steps;
    expect(avg).toBeLessThan(2);
  });
});
