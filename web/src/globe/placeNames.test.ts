import { describe, expect, it } from 'vitest';
import { countryAnchors, largestPolygonAnchor, placeNames, ringCentroid, type NameCandidate } from './placeNames';
import { loadCountryShapes } from './countries';
import { overlaps, RectGrid } from './rectGrid';

const square = (x: number, y: number, s: number) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];

describe('ringCentroid', () => {
  it('finds the middle of a square', () => {
    const c = ringCentroid(square(10, 20, 4));
    expect(c.lng).toBeCloseTo(12);
    expect(c.lat).toBeCloseTo(22);
    expect(c.area).toBeGreaterThan(0);
  });
});

describe('largestPolygonAnchor', () => {
  it('picks the largest polygon of a multipolygon, not the mean of all parts', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [[square(-60, 0, 2)], [square(0, 40, 10)]] };
    const a = largestPolygonAnchor(geometry)!;
    expect(a.lng).toBeCloseTo(5);
    expect(a.lat).toBeCloseTo(45);
  });

  it('weights area by latitude so a polar strip does not beat an equatorial block', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [[square(0, 80, 9)], [square(50, 0, 8)]] };
    expect(largestPolygonAnchor(geometry)!.lng).toBeCloseTo(54);
  });
});

describe('countryAnchors', () => {
  const anchors = countryAnchors(loadCountryShapes());

  it('uses the English world-atlas names, biggest first', () => {
    const names = anchors.map((a) => a.name);
    expect(names.indexOf('Russia')).toBeLessThan(3);
    expect(names).toContain('Japan');
    expect(names.indexOf('Canada')).toBeLessThan(names.indexOf('Japan'));
  });

  it('puts France in metropolitan France and the US label in the lower 48', () => {
    const fr = anchors.find((a) => a.name === 'France')!;
    expect(fr.lat).toBeGreaterThan(42);
    expect(fr.lng).toBeGreaterThan(-5);
    expect(fr.lng).toBeLessThan(8);
    const us = anchors.find((a) => a.name === 'United States of America')!;
    expect(us.lat).toBeGreaterThan(30);
    expect(us.lat).toBeLessThan(45);
    expect(us.lng).toBeGreaterThan(-110);
    expect(us.lng).toBeLessThan(-85);
  });
});

function cand(id: string, x: number, y: number, priority: number, over: Partial<NameCandidate> = {}): NameCandidate {
  return { id, x, y, w: 60, h: 14, priority, ...over };
}

const view = { w: 800, h: 600 };

describe('placeNames', () => {
  it('centres a free name on its anchor', () => {
    expect(placeNames([cand('a', 400, 300, 1)], [], view, 10).get('a')).toEqual({ x: 370, y: 293, w: 60, h: 14 });
  });

  it('never lets names overlap each other or obstacles, keeping the more important one', () => {
    const cover = { x: 380, y: 250, w: 40, h: 40 };
    const cands = [cand('small', 405, 300, 2), cand('big', 400, 302, 1), cand('far', 100, 100, 3)];
    const placed = placeNames(cands, [cover], view, 10);
    const rects = [...placed.values()];
    for (const r of rects) expect(overlaps(r, cover)).toBe(false);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    expect(placed.has('big')).toBe(true);
    expect(placed.has('far')).toBe(true);
  });

  it('places a name beside its own cover, below first', () => {
    const own = { x: 380, y: 260, w: 40, h: 57 };
    const r = placeNames([cand('c', 400, 288, 1, { around: own })], [own], view, 10).get('c')!;
    expect(r.y).toBeGreaterThanOrEqual(own.y + own.h);
    expect(r.x + r.w / 2).toBeCloseTo(400);
  });

  it('stops at the cap and drops names that would leave the viewport', () => {
    const many = Array.from({ length: 50 }, (_, i) => cand(`n${i}`, 40 + (i % 10) * 75, 40 + Math.floor(i / 10) * 40, i));
    expect(placeNames(many, [], view, 12).size).toBe(12);
    expect(placeNames([cand('edge', 5, 300, 1)], [], view, 10).size).toBe(0);
  });
});

describe('RectGrid', () => {
  it('finds overlaps across cell borders and respects padding', () => {
    const g = new RectGrid(32, 2);
    g.add({ x: 30, y: 30, w: 10, h: 10 });
    expect(g.hits({ x: 39, y: 39, w: 5, h: 5 })).toBe(true);
    expect(g.hits({ x: 41, y: 30, w: 5, h: 5 })).toBe(true);
    expect(g.hits({ x: 43, y: 30, w: 5, h: 5 })).toBe(false);
  });
});

describe('antimeridian', () => {
  it('keeps the centroid of a ring that crosses 180° on the right side of the globe', () => {
    const ring = [
      [178, -16],
      [180, -16],
      [-179, -17],
      [-179, -18],
      [180, -18],
      [178, -18],
      [178, -16],
    ];
    const c = ringCentroid(ring);
    expect(Math.abs(c.lng)).toBeGreaterThan(170);
    expect(c.lat).toBeGreaterThan(-18);
    expect(c.lat).toBeLessThan(-16);
  });

  it('puts the Fiji name near Fiji with the real shapes', () => {
    const fiji = countryAnchors(loadCountryShapes()).find((a) => a.name === 'Fiji')!;
    expect(Math.abs(fiji.lng)).toBeGreaterThan(170);
    expect(fiji.lat).toBeLessThan(-12);
    expect(fiji.lat).toBeGreaterThan(-22);
  });
});
