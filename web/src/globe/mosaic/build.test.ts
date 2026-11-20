import { describe, expect, it } from 'vitest';
import type { CountryShape } from '../countries';
import { buildCountryMosaic, cellBudget, countryRegions, DEFAULT_OPTIONS, MosaicBuilder, countryCore, spiralSpots, type MosaicGame } from './build';

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

describe('spiralSpots', () => {
  it('puts the first game at the core and the rest on distinct spots that move outward', () => {
    const jp = regions.get('JP')!;
    const core = countryCore(jp);
    const spots = spiralSpots(jp, [100, 50, 20, 10, 5, 2, 1, 1]);
    expect(spots[0]).toEqual(core);
    expect(new Set(spots.map((s) => `${s[0].toFixed(5)},${s[1].toFixed(5)}`)).size).toBe(8);
    const d = spots.map((s) => Math.hypot(s[0] - core[0], s[1] - core[1]));
    expect(d[7]!).toBeGreaterThan(d[1]!);
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
  it('makes one cell per game, most popular first, biggest and in the middle', () => {
    const jp = regions.get('JP')!;
    const games = [game(3, 10, 33.6, 130.4), game(1, 1000, 35.7, 139.7), game(2, 100, 34.7, 135.5)];
    const m = buildCountryMosaic(games, jp, DEFAULT_OPTIONS);
    expect(m.cells.map((c) => c.gameId)).toEqual([1, 2, 3]);
    expect(m.cells[0]!.area).toBeGreaterThan(m.cells[1]!.area);
    expect(m.cells[1]!.area).toBeGreaterThan(m.cells[2]!.area);
    expect(Math.abs(m.cells[0]!.lat - jp.center.lat) + Math.abs(m.cells[0]!.lng - jp.center.lng)).toBeLessThan(Math.abs(m.cells[2]!.lat - jp.center.lat) + Math.abs(m.cells[2]!.lng - jp.center.lng));
    expect(m.position.length % 9).toBe(0);
    expect(m.uv.length / 2).toBe(m.position.length / 3);
    expect(m.lines.length).toBeGreaterThan(0);
  });
});

describe('MosaicBuilder', () => {
  it('builds every country, offsets cell ids and reuses unchanged countries', () => {
    const b = new MosaicBuilder(regions);
    const games = [game(1, 50, 35, 135), game(2, 40, 47, 3, { country: 'FR' }), game(3, 30, 36, 138), game(4, 1, 0, 0, { country: 'ZZ' })];
    const m = b.build(games).mesh;
    expect(m.cells.map((c) => c.gameId).sort()).toEqual([1, 2, 3]);
    const maxCell = Math.max(...m.cell);
    expect(maxCell).toBe(2);
    const again = b.build(games).mesh;
    expect(again.position.length).toBe(m.position.length);
  });
});

describe('layouts', () => {
  it('rebuilds a year from its saved layout without fitting, cell for cell', () => {
    const games = [game(1, 50, 35.7, 139.7), game(2, 40, 34.7, 135.5), game(3, 30, 35.7, 139.7), game(4, 5, 33.6, 130.4)];
    const a = new MosaicBuilder(regions);
    const first = a.build(games);
    const layout = a.layoutOf(first.countries);
    expect(layout.size).toBeGreaterThan(0);
    const b = new MosaicBuilder(regions);
    b.useLayout(layout);
    const again = b.build(games, null, true).mesh;
    expect(again.cells.map((c) => c.gameId)).toEqual(first.mesh.cells.map((c) => c.gameId));
    again.cells.forEach((c, i) => expect(c.area).toBeCloseTo(first.mesh.cells[i]!.area, 3));
  });

  it('round-trips through the binary file', async () => {
    const { encodeLayouts, decodeLayouts } = await import('./layouts');
    const games = [{ ...game(1, 50, 35.7, 139.7), year: 2000 }, { ...game(2, 40, 34.7, 135.5), year: 2001 }];
    const l1 = new Map<string, [number, number, number, number]>([['g1', [1, 2, 3, 1]], ['mJP:1', [4, 5, 6, 1]]]);
    const l2 = new Map<string, [number, number, number, number]>([['g1', [1, 2, 3, 1]], ['g2', [7, 8, 9, 2]], ['mJP:1', [4, 5, 6.5, 1]]]);
    const out = decodeLayouts(encodeLayouts(games, [[2000, l1], [2001, l2]]), games)!;
    expect(out.get(2000)!.get('mJP:1')).toEqual([4, 5, 6, 1]);
    expect(out.get(2001)!.get('mJP:1')).toEqual([4, 5, 6.5, 1]);
    expect(out.get(2001)!.get('g2')).toEqual([7, 8, 9, 2]);
    expect(decodeLayouts(encodeLayouts(games, [[2000, l1]]), games.slice(1))).toBeNull();
  });
});

describe('cellBudget shares', () => {
  it('gives a dense small country more cells than its area alone would', () => {
    const b = cellBudget(new Map([['S', 1000], ['L', 1000]]), new Map([['S', 10], ['L', 1000]]), { ...DEFAULT_OPTIONS, minCellArea: 0.01, maxCells: 200 });
    expect(b.get('S')!).toBeGreaterThan(15);
    expect(b.get('L')!).toBeGreaterThan(b.get('S')!);
    expect(b.get('S')! + b.get('L')!).toBeLessThanOrEqual(200);
  });
});
