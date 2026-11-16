import { describe, expect, it } from 'vitest';
import type { CountryShape } from './countries';
import { CAP_ALTITUDE, triangulatePlanar, triangulateShape } from './fill';
import { GLOBE_RADIUS } from './outline';

function area(planar: number[]): number {
  let sum = 0;
  for (let i = 0; i < planar.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = planar.slice(i, i + 6) as [number, number, number, number, number, number];
    sum += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return sum;
}

const ring = (x: number, y: number, s: number) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

describe('triangulatePlanar', () => {
  it('covers the polygon area exactly, with a hole removed', () => {
    const shape: CountryShape = { geometry: { type: 'Polygon', coordinates: [ring(0, 0, 20), ring(5, 5, 4).reverse()] as never } };
    expect(area(triangulatePlanar(shape))).toBeCloseTo(400 - 16, 6);
  });

  it('subdivides so no edge is longer than the limit', () => {
    const shape: CountryShape = { geometry: { type: 'Polygon', coordinates: [ring(0, 0, 40)] as never } };
    const t = triangulatePlanar(shape, 3);
    for (let i = 0; i < t.length; i += 6) {
      const xs = [t[i]!, t[i + 2]!, t[i + 4]!];
      const ys = [t[i + 1]!, t[i + 3]!, t[i + 5]!];
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(3 + 1e-9);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(3 + 1e-9);
    }
    expect(area(t)).toBeCloseTo(1600, 6);
  });

  it('handles MultiPolygon', () => {
    const shape: CountryShape = {
      geometry: { type: 'MultiPolygon', coordinates: [[ring(0, 0, 4)], [ring(50, 50, 4)]] as never },
    };
    expect(area(triangulatePlanar(shape))).toBeCloseTo(32, 6);
  });
});

describe('triangulateShape', () => {
  it('places every vertex on the cap sphere', () => {
    const shape: CountryShape = { geometry: { type: 'Polygon', coordinates: [ring(10, 10, 10)] as never } };
    const pos = triangulateShape(shape);
    expect(pos.length % 9).toBe(0);
    for (let i = 0; i < pos.length; i += 3) {
      expect(Math.hypot(pos[i]!, pos[i + 1]!, pos[i + 2]!)).toBeCloseTo(GLOBE_RADIUS * (1 + CAP_ALTITUDE), 3);
    }
  });
});
