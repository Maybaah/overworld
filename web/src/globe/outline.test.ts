import { describe, expect, it } from 'vitest';
import type { CountryShape } from './countries';
import { buildOutline, GLOBE_RADIUS, OUTLINE_ALTITUDE, toCartesian } from './outline';

describe('toCartesian', () => {
  it('puts lat 0 lng 0 on +z and the north pole on +y', () => {
    const a: number[] = [];
    toCartesian(0, 0, 0, a);
    expect(a[0]).toBeCloseTo(0);
    expect(a[1]).toBeCloseTo(0);
    expect(a[2]).toBeCloseTo(GLOBE_RADIUS);
    const b: number[] = [];
    toCartesian(90, 0, 0, b);
    expect(b[1]).toBeCloseTo(GLOBE_RADIUS);
  });
});

describe('buildOutline', () => {
  const square: CountryShape = {
    id: '1',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] as never },
  };

  it('splits long edges and keeps every vertex at outline altitude', () => {
    const pos = buildOutline([square]);
    expect(pos.length % 6).toBe(0);
    expect(pos.length / 6).toBeGreaterThanOrEqual(16);
    const r = GLOBE_RADIUS * (1 + OUTLINE_ALTITUDE);
    for (let i = 0; i < pos.length; i += 3) expect(Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!)).toBeCloseTo(r, 3);
  });

  it('handles MultiPolygon and skips antimeridian jumps', () => {
    const multi: CountryShape = {
      geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[170, 0], [-170, 0], [-170, 1], [170, 0]]]] as never },
    };
    const pos = buildOutline([multi]);
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.length / 6).toBeLessThan(20);
  });
});
