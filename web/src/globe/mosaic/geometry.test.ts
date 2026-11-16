import { describe, expect, it } from 'vitest';
import {
  azimuthalEqualArea,
  clipByConvex,
  fitPowerDiagram,
  pointInRegion,
  ringArea,
  segmentInside,
  type Pt,
  type Region,
} from './geometry';

const square = (x0: number, y0: number, s: number): Pt[] => [
  [x0, y0],
  [x0 + s, y0],
  [x0 + s, y0 + s],
  [x0, y0 + s],
];

describe('azimuthalEqualArea', () => {
  it('round-trips points, including across the antimeridian', () => {
    const p = azimuthalEqualArea(64, 170);
    for (const [lat, lng] of [[64, 170], [60, 179.5], [66, -175], [50, 150]] as const) {
      const [x, y] = p.forward(lat, lng);
      const back = p.inverse(x, y);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lng).toBeCloseTo(lng, 6);
    }
  });

  it('keeps north up at the centre', () => {
    const p = azimuthalEqualArea(35, 139);
    expect(p.forward(36, 139)[1]).toBeGreaterThan(0);
    expect(p.forward(35, 140)[0]).toBeGreaterThan(0);
  });
});

describe('clipping', () => {
  it('clips a concave polygon by a convex one', () => {
    const l: Pt[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
    const out = clipByConvex(l, square(0, 0, 2));
    expect(Math.abs(ringArea(out))).toBeCloseTo(3, 6);
  });

  it('keeps only the parts of a segment inside a region with a hole', () => {
    const region: Region = { outers: [square(0, 0, 10)], holes: [square(4, -1, 2).map((p) => [p[0], p[1] + 5] as Pt)] };
    const parts = segmentInside([-5, 5], [15, 5], region);
    expect(parts).toHaveLength(2);
    expect(parts[0]![0][0]).toBeCloseTo(0);
    expect(parts[0]![1][0]).toBeCloseTo(4);
    expect(parts[1]![0][0]).toBeCloseTo(6);
    expect(parts[1]![1][0]).toBeCloseTo(10);
    expect(pointInRegion([5, 5], region)).toBe(false);
  });
});

describe('fitPowerDiagram', () => {
  it('fills the region and sizes cells by target', () => {
    const region: Region = { outers: [square(0, 0, 10)], holes: [] };
    const points: Pt[] = [[2, 2], [8, 2], [5, 8], [2, 8], [8, 8]];
    const targets = [8, 4, 2, 1, 1];
    const fit = fitPowerDiagram(points, targets, region, { iterations: 80 });
    const areas = fit.cells.map((c) => c.area);
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 4);
    expect(areas[0]!).toBeGreaterThan(areas[1]!);
    expect(areas[1]!).toBeGreaterThan(areas[3]!);
    expect(fit.error).toBeLessThan(0.15);
  });

  it('gives every site a non-empty cell even when sites crowd one corner', () => {
    const region: Region = { outers: [square(0, 0, 10)], holes: [] };
    const points: Pt[] = Array.from({ length: 12 }, (_, i) => [1 + (i % 4) * 0.3, 1 + Math.floor(i / 4) * 0.3] as Pt);
    const fit = fitPowerDiagram(points, points.map((_, i) => 12 - i), region, { iterations: 60 });
    expect(fit.cells.every((c) => c.area > 0)).toBe(true);
    expect(fit.cells.reduce((a, c) => a + c.area, 0)).toBeCloseTo(100, 4);
  });

  it('splits a cell across two islands', () => {
    const region: Region = { outers: [square(0, 0, 4), square(6, 0, 4)], holes: [] };
    const fit = fitPowerDiagram([[2, 2]], [1], region, { iterations: 1 });
    expect(fit.cells[0]!.pieces).toHaveLength(2);
    expect(fit.cells[0]!.area).toBeCloseTo(32, 6);
  });
});
