import { describe, expect, it } from 'vitest';
import type { CountryFlow, CountryStats, YearStats } from '@shared';
import {
  ALL_WORK,
  arcWidth,
  capitaRows,
  flyAltitude,
  formatPercent,
  formatPerMillion,
  formatPopulation,
  linkTotals,
  midpoint,
  niceMax,
  shadeFor,
  shareOf,
  sqrtScale,
  topFlows,
  topWithOther,
  yearSeries,
} from './helpers';

function country(code: string, gamesLed: number, population: number | null): CountryStats {
  return { code, region: 'R', subregion: '', population, studios: 1, gamesLed, gamesPerMillion: null, genres: {} };
}

function flow(role: CountryFlow['role'], from: string, to: string, games: number, examples: number[] = []): CountryFlow {
  return { role, from, to, games, examples };
}

describe('sqrtScale', () => {
  it('scales on a square-root curve and clamps', () => {
    expect(sqrtScale(25, 100)).toBeCloseTo(0.5);
    expect(sqrtScale(100, 100)).toBe(1);
    expect(sqrtScale(400, 100)).toBe(1);
    expect(sqrtScale(0, 100)).toBe(0);
    expect(sqrtScale(5, 0)).toBe(0);
  });
});

describe('capitaRows', () => {
  const countries = [country('US', 60, 330_000_000), country('JP', 30, 120_000_000), country('SE', 6, 10_000_000), country('NO', 4, 5_000_000), country('FR', 20, null)];

  it('keeps countries with at least five games and sorts per million', () => {
    const rows = capitaRows(countries, 'perMillion');
    expect(rows.map((r) => r.code)).toEqual(['SE', 'JP', 'US']);
    expect(rows[0]!.value).toBeCloseTo(0.6);
  });

  it('sorts by total games and keeps countries without a population', () => {
    expect(capitaRows(countries, 'total').map((r) => r.code)).toEqual(['US', 'JP', 'FR', 'SE']);
  });

  it('shades every row between 0 and 1 with the maximum at 1', () => {
    const shade = shadeFor(capitaRows(countries, 'perMillion'));
    expect(Object.keys(shade).sort()).toEqual(['JP', 'SE', 'US']);
    for (const v of Object.values(shade)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(shade.SE).toBe(1);
    expect(shade.US).toBeCloseTo(Math.sqrt(shadeRatio(0.18, 0.6)), 1);
  });
});

function shadeRatio(a: number, b: number): number {
  return a / b;
}

describe('formatting', () => {
  it('formats population and per-million values', () => {
    expect(formatPopulation(340_110_988)).toBe('340.1 million');
    expect(formatPopulation(412_000)).toBe('412,000');
    expect(formatPerMillion(20.784)).toBe('20.8');
    expect(formatPerMillion(3)).toBe('3.0');
  });

  it('rounds percentages', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.004)).toBe('<1%');
    expect(formatPercent(0.0149)).toBe('1.5%');
    expect(formatPercent(0.0951)).toBe('9.5%');
    expect(formatPercent(0.0999)).toBe('10%');
    expect(formatPercent(0.2349)).toBe('23%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('computes shares', () => {
    expect(shareOf(1, 4)).toBe(0.25);
    expect(shareOf(1, 0)).toBe(0);
  });

  it('picks a nice axis maximum', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.34)).toBe(0.5);
    expect(niceMax(137)).toBe(200);
    expect(niceMax(500)).toBe(500);
    expect(niceMax(501)).toBe(1000);
  });
});

describe('topWithOther', () => {
  it('returns the top n and sums the rest', () => {
    const r = topWithOther({ '1': 10, '2': 30, '3': 20, '4': 5, '5': 5, '6': 0 }, 3);
    expect(r.top.map((t) => t.id)).toEqual(['2', '3', '1']);
    expect(r.otherKinds).toBe(2);
    expect(r.otherCount).toBe(10);
  });

  it('breaks ties by id and handles fewer than n', () => {
    const r = topWithOther({ '10': 4, '2': 4 }, 6);
    expect(r.top.map((t) => t.id)).toEqual(['2', '10']);
    expect(r.otherKinds).toBe(0);
    expect(r.otherCount).toBe(0);
  });
});

describe('yearSeries', () => {
  const years: YearStats[] = [
    { year: 1958, total: 1, indie: 0, majorPublisher: 0 },
    { year: 1971, total: 4, indie: 1, majorPublisher: 2 },
    { year: 1974, total: 10, indie: 5, majorPublisher: 1 },
  ];

  it('runs from 1970 to the last year and fills gaps', () => {
    const s = yearSeries(years);
    expect(s[0]!.year).toBe(1970);
    expect(s[s.length - 1]!.year).toBe(1974);
    expect(s).toHaveLength(5);
    expect(s[0]).toMatchObject({ total: 0, indieShare: null, majorShare: null });
    expect(s[1]).toMatchObject({ total: 4, indieShare: 0.25, majorShare: 0.5 });
  });
});

describe('flows', () => {
  const flows: CountryFlow[] = [
    flow('publisher', 'JP', 'US', 100, [1, 2]),
    flow('publisher', 'JP', 'JP', 300, [9]),
    flow('port', 'JP', 'US', 20, [2, 3]),
    flow('co_developer', 'US', 'GB', 20, [4]),
    flow('art', 'GB', 'PL', 2),
    flow('audio', 'GB', 'PL', 3),
  ];

  it('totals links per group and for all', () => {
    const t = linkTotals(flows);
    expect(t[ALL_WORK]).toBe(445);
    expect(t.publisher).toBe(400);
    expect(t.port).toBe(20);
    expect(t.art_audio).toBe(5);
    expect(t.localization).toBe(0);
    expect(t.qa).toBe(0);
  });

  it('merges roles for the same country pair and drops same-country by default', () => {
    const rows = topFlows(flows, ALL_WORK, false);
    expect(rows.map((r) => `${r.from}>${r.to}:${r.games}`)).toEqual(['JP>US:120', 'US>GB:20', 'GB>PL:5']);
    expect(rows[0]!.examples).toEqual([1, 2, 3]);
  });

  it('includes same-country flows when asked', () => {
    const rows = topFlows(flows, ALL_WORK, true);
    expect(rows[0]).toMatchObject({ from: 'JP', to: 'JP', games: 300 });
  });

  it('filters by role group and limits the list', () => {
    expect(topFlows(flows, 'port', false).map((r) => r.games)).toEqual([20]);
    expect(topFlows(flows, 'art_audio', false)[0]!.games).toBe(5);
    expect(topFlows(flows, 'qa', false)).toEqual([]);
    expect(topFlows(flows, ALL_WORK, true, 2)).toHaveLength(2);
  });

  it('never includes the lead role', () => {
    expect(topFlows([flow('lead_developer', 'JP', 'US', 5)], ALL_WORK, true)).toEqual([]);
  });
});

describe('globe geometry', () => {
  it('scales arc width', () => {
    expect(arcWidth(100, 100)).toBeCloseTo(1.5);
    expect(arcWidth(0, 100)).toBeCloseTo(0.3);
  });

  it('finds a midpoint and a bounded altitude', () => {
    const m = midpoint(0, 0, 0, 90);
    expect(m.lat).toBeCloseTo(0);
    expect(m.lng).toBeCloseTo(45);
    expect(flyAltitude(0)).toBe(1.1);
    expect(flyAltitude(20_000)).toBe(2.8);
  });
});
