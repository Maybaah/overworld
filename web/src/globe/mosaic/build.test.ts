import { describe, expect, it } from 'vitest';
import type { CountryShape } from '../countries';
import { buildCountryMosaic, cellBudget, countryRegions, DEFAULT_OPTIONS, MosaicBuilder, placeSites, type MosaicGame } from './build';

const box = (id: string, lng0: number, lat0: number, w: number, h: number): CountryShape => ({
  id,
  geometry: {
    type: 'Polygon',
    coordinates: [[[lng0, lat0], [lng0, lat0 + h], [lng0 + w, lat0 + h], [lng0 + w, lat0], [lng0, lat0]]] as unknown as number[],
  },
});

const game = (id: number, popularity: number, lat: number, lng: number, over: Partial<MosaicGame> = {}): MosaicGame => ({
  id,
  cover: `c${id}`,
  popularity,
  lat,
  lng,
  country: 'JP',
  exact: true,
  ...over,
});

const regions = countryRegions([box('392', 130, 30, 10, 10), box('250', 0, 44, 6, 6)]);

describe('countryRegions', () => {
  it('projects each country around its own centre with equal-area units', () => {
    const jp = regions.get('JP')!;
    expect(jp.center.lat).toBeCloseTo(35, 0);
    expect(jp.area).toBeGreaterThan(80);
    expect(jp.area).toBeLessThan(85);
  });

  it('merges shapes that share a code instead of keeping the last one', () => {
    const au = countryRegions([box('036', 120, -35, 20, 20), box('036', 123, -12, 0.2, 0.2)]).get('AU')!;
    expect(au.region.outers).toHaveLength(2);
    expect(au.area).toBeGreaterThan(300);
  });
});

describe('placeSites', () => {
  it('spreads games that share a city instead of stacking them', () => {
    const jp = regions.get('JP')!;
    const sites = placeSites([game(1, 10, 35, 135), game(2, 5, 35, 135), game(3, 1, 35, 135)], jp);
    const keys = new Set(sites.map((s) => `${s[0].toFixed(5)},${s[1].toFixed(5)}`));
    expect(keys.size).toBe(3);
  });
});

describe('cellBudget', () => {
  it('caps cells by area and by the total', () => {
    const b = cellBudget(new Map([['A', 50], ['B', 50]]), new Map([['A', 1], ['B', 100]]), { ...DEFAULT_OPTIONS, minCellArea: 1, maxCells: 30 });
    expect(b.get('A')).toBe(1);
    expect(b.get('B')).toBeLessThanOrEqual(30);
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(31);
  });
});

describe('buildCountryMosaic', () => {
  it('makes one cell per game, bigger for more popular games, near their city', () => {
    const jp = regions.get('JP')!;
    const games = [game(1, 1000, 35.7, 139.7), game(2, 100, 34.7, 135.5), game(3, 10, 33.6, 130.4)];
    const m = buildCountryMosaic(games, jp, DEFAULT_OPTIONS);
    expect(m.cells.map((c) => c.gameId)).toEqual([1, 2, 3]);
    expect(m.cells[0]!.area).toBeGreaterThan(m.cells[1]!.area);
    expect(m.cells[1]!.area).toBeGreaterThan(m.cells[2]!.area);
    expect(m.cells[2]!.lng).toBeLessThan(m.cells[0]!.lng);
    expect(m.position.length % 9).toBe(0);
    expect(m.uv.length / 2).toBe(m.position.length / 3);
    expect(m.lines.length).toBeGreaterThan(0);
  });
});

describe('MosaicBuilder', () => {
  it('builds every country, offsets cell ids and reuses unchanged countries', () => {
    const b = new MosaicBuilder(regions);
    const games = [game(1, 50, 35, 135), game(2, 40, 47, 3, { country: 'FR' }), game(3, 30, 36, 138), game(4, 1, 0, 0, { country: 'ZZ' })];
    const m = b.build(games);
    expect(m.cells.map((c) => c.gameId).sort()).toEqual([1, 2, 3]);
    const maxCell = Math.max(...m.cell);
    expect(maxCell).toBe(2);
    const again = b.build(games);
    expect(again.position.length).toBe(m.position.length);
  });
});

describe('metroGroups', () => {
  it('joins nearby cities to the most popular one and keeps country-level games together', async () => {
    const { metroGroups } = await import('./build');
    const jp = regions.get('JP')!;
    const groups = metroGroups(
      [game(1, 9, 35.68, 139.7), game(2, 8, 34.69, 135.5), game(3, 7, 35.44, 139.64), game(4, 6, 36, 138, { exact: false }), game(5, 5, 36, 138, { exact: false })],
      jp,
    );
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([[1, 3], [2], [4, 5]]);
  });
});
