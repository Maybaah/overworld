import { describe, expect, it } from 'vitest';
import { buildIndexes } from '../data/indexes';
import { company, game } from '../data/testData';
import { computeOrigins, countryRows, largestRemainderPercents, sampleLibrary } from './origins';
import { shareParamsToSummary, summarizeOrigins, summaryToShareParams } from './share';

const companies = [
  company(1, { name: 'Tokyo A', country: 'JP', city: 'Tokyo' }),
  company(2, { name: 'Kyoto B', country: 'JP', city: 'Kyoto' }),
  company(3, { name: 'Austin C', country: 'US', city: 'Austin' }),
  company(4, { name: 'Nowhere', country: null, city: null, lat: null, lng: null, precision: 'none' }),
  company(5, { name: 'Germany D', country: 'DE', city: null, precision: 'country' }),
];
const games = [
  game(1, { leadCompanyId: 1, popularity: 9 }),
  game(2, { leadCompanyId: 1, popularity: 8 }),
  game(3, { leadCompanyId: 2, popularity: 7 }),
  game(4, { leadCompanyId: 3, popularity: 6 }),
  game(5, { leadCompanyId: 4, popularity: 5 }),
  game(6, { leadCompanyId: 5, popularity: 4 }),
  game(7, { leadCompanyId: 3, popularity: 3 }),
];
const indexes = buildIndexes(companies, games);
const steamMap: Record<string, number> = { '100': 1, '200': 2, '300': 3, '400': 4, '500': 5, '600': 6, '999': 999 };

describe('computeOrigins', () => {
  const owned = [
    { appId: 100, minutes: 600 },
    { appId: 200, minutes: 300 },
    { appId: 300, minutes: 100 },
    { appId: 400, minutes: 0 },
    { appId: 500, minutes: 50 },
    { appId: 600, minutes: 0 },
    { appId: 12345, minutes: 10 },
    { appId: 999, minutes: 10 },
  ];
  const o = computeOrigins(owned, steamMap, indexes);

  it('counts owned, matched and unmatched', () => {
    expect(o.owned).toBe(8);
    expect(o.matched).toBe(6);
    expect(o.unmatchedAppIds).toBe(2);
    expect([...o.gameIds].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(o.unknownLocation).toBe(1);
  });

  it('ranks countries by games with shares of located games', () => {
    expect(o.byCountry.map((c) => [c.code, c.games])).toEqual([
      ['JP', 3],
      ['DE', 1],
      ['US', 1],
    ]);
    const jp = o.byCountry[0]!;
    expect(jp.share).toBeCloseTo(3 / 5);
    expect(jp.minutes).toBe(1000);
    expect(jp.minutesShare).toBe(1);
    expect(o.byCountry.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1);
  });

  it('lists cities (city precision only) and studios', () => {
    expect(o.byCity.map((c) => [c.name, c.games])).toEqual([
      ['Tokyo', 2],
      ['Austin', 1],
      ['Kyoto', 1],
    ]);
    expect(o.byStudio[0]).toMatchObject({ name: 'Tokyo A', games: 2 });
    expect(o.byStudio).toHaveLength(5);
  });

  it('limits cities and studios to 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => company(100 + i, { name: `S${i}`, city: `C${i}` }));
    const gs = many.map((c, i) => game(1000 + i, { leadCompanyId: c.id }));
    const idx = buildIndexes(many, gs);
    const map = Object.fromEntries(gs.map((g) => [String(g.id), g.id]));
    const r = computeOrigins(gs.map((g) => ({ appId: g.id, minutes: 1 })), map, idx);
    expect(r.byCity).toHaveLength(10);
    expect(r.byStudio).toHaveLength(10);
  });

  it('handles an empty library and duplicate apps', () => {
    const e = computeOrigins([], steamMap, indexes);
    expect(e).toMatchObject({ owned: 0, matched: 0, byCountry: [], unknownLocation: 0 });
    const d = computeOrigins([{ appId: 100, minutes: 5 }, { appId: 100, minutes: 9 }], steamMap, indexes);
    expect(d.owned).toBe(1);
    expect(d.byCountry[0]!.minutes).toBe(9);
  });

  it('ignores inherited keys in the steam map', () => {
    const r = computeOrigins([{ appId: 0, minutes: 1 }], {}, indexes);
    expect(r.matched).toBe(0);
  });
});

describe('largestRemainderPercents', () => {
  it('sums to 100', () => {
    expect(largestRemainderPercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
    expect(largestRemainderPercents([0.5, 0.25, 0.25])).toEqual([50, 25, 25]);
    expect(largestRemainderPercents(Array(8).fill(0.126)).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('sums to 100 for many pseudo-random inputs', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 200; n++) {
      const k = 1 + Math.floor(rnd() * 12);
      const xs = Array.from({ length: k }, () => rnd());
      const out = largestRemainderPercents(xs);
      expect(out.reduce((a, b) => a + b, 0)).toBe(100);
      expect(out.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });

  it('handles empty and zero input', () => {
    expect(largestRemainderPercents([])).toEqual([]);
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0]);
  });
});

describe('countryRows', () => {
  const o = computeOrigins(
    [
      { appId: 100, minutes: 1 },
      { appId: 200, minutes: 1 },
      { appId: 300, minutes: 1 },
      { appId: 400, minutes: 1000 },
      { appId: 600, minutes: 1 },
    ],
    steamMap,
    indexes,
  );

  it('adds an other row so percents sum to 100', () => {
    const { rows, other } = countryRows(o, 'games', 1);
    expect(rows.map((r) => r.code)).toEqual(['JP']);
    expect(other).toMatchObject({ countries: 2, games: 2 });
    expect(rows[0]!.percent + other!.percent).toBe(100);
  });

  it('can rank by playtime', () => {
    const { rows, other } = countryRows(o, 'playtime', 2);
    expect(rows[0]!.code).toBe('US');
    expect(rows.reduce((a, r) => a + r.percent, 0) + (other?.percent ?? 0)).toBe(100);
  });

  it('has no other row when everything fits', () => {
    expect(countryRows(o, 'games', 10).other).toBeNull();
  });
});

describe('sampleLibrary', () => {
  it('takes the most popular games that have a steam app id', () => {
    const lib = sampleLibrary({ '400': 4, '100': 1, '300': 3 }, indexes, 2);
    expect(lib.map((g) => g.appId)).toEqual([100, 300]);
  });
});

describe('share params', () => {
  const o = computeOrigins(
    [100, 200, 300, 400, 600].map((appId) => ({ appId, minutes: 1 })),
    steamMap,
    indexes,
  );

  it('round-trips a summary without identifiers', () => {
    const summary = summarizeOrigins(o);
    const params = summaryToShareParams(summary);
    expect(params.toString()).toBe('o=5&m=5&c=JP60.DE20.US20');
    expect(shareParamsToSummary(params)).toEqual(summary);
    expect(shareParamsToSummary(params.toString())).toEqual(summary);
  });

  it('keeps only the top 5 countries', () => {
    const summary = {
      owned: 100,
      matched: 90,
      countries: ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'].map((code) => ({ code, percent: 10 })),
    };
    expect(summaryToShareParams(summary).get('c')).toBe('AA10.BB10.CC10.DD10.EE10');
  });

  it('rejects invalid params', () => {
    const bad = [
      '',
      'o=5&m=5',
      'o=5&m=6&c=JP50',
      'o=x&m=5&c=JP50',
      'o=5&m=5&c=jp50',
      'o=5&m=5&c=JP101',
      'o=5&m=5&c=JP60.US60',
      'o=5&m=5&c=JP10.JP10',
      'o=5&m=5&c=AA1.BB1.CC1.DD1.EE1.FF1',
      'o=5&m=5&c=JP5x',
      'o=99999999&m=5&c=JP5',
      'o=-1&m=5&c=JP5',
    ];
    for (const b of bad) expect(shareParamsToSummary(b), b).toBeNull();
    expect(shareParamsToSummary('o=0&m=0&c=')).toEqual({ owned: 0, matched: 0, countries: [] });
  });
});
