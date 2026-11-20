import { describe, expect, it } from 'vitest';
import { makeStarField, STAR_OPTIONS } from './starsLayer';

describe('makeStarField', () => {
  it('fills a shell around the globe beyond the farthest camera, the same way every time', () => {
    const a = makeStarField({ ...STAR_OPTIONS, count: 2000 });
    const b = makeStarField({ ...STAR_OPTIONS, count: 2000 });
    expect(Array.from(a.positions.slice(0, 30))).toEqual(Array.from(b.positions.slice(0, 30)));
    expect(STAR_OPTIONS.inner).toBeGreaterThan(100 * (1 + 2.4));
    for (let i = 0; i < 2000; i++) {
      const r = Math.hypot(a.positions[i * 3]!, a.positions[i * 3 + 1]!, a.positions[i * 3 + 2]!);
      expect(r).toBeGreaterThanOrEqual(STAR_OPTIONS.inner - 1e-3);
      expect(r).toBeLessThanOrEqual(STAR_OPTIONS.outer + 1e-3);
    }
  });

  it('keeps most stars small and a few bright', () => {
    const f = makeStarField({ ...STAR_OPTIONS, count: 4000 });
    const big = Array.from(f.sizes).filter((s) => s > 4.5).length;
    expect(big).toBeGreaterThan(0);
    expect(big / 4000).toBeLessThan(0.1);
  });
});
