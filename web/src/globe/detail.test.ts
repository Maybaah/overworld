import { describe, expect, it } from 'vitest';
import type { CountryShape } from './countries';
import { nearShapes, prepareDetail, upgradeShapes, visibleAngle } from './detail';

function square(id: string, lng: number, lat: number): CountryShape {
  return {
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng, lat], [lng + 1, lat], [lng + 1, lat + 1], [lng, lat + 1], [lng, lat]]] as never,
    },
  };
}

describe('detail shapes', () => {
  const detail = prepareDetail([square('392', 139, 35), square('250', 2, 46), square('643', 179, 60), { geometry: { type: 'Polygon', coordinates: [] } }]);

  it('skips shapes without an id', () => {
    expect(detail).toHaveLength(3);
  });

  it('finds only countries within the visible cap, nearest first', () => {
    const near = nearShapes(detail, 36, 139.5, 0.08);
    expect(near.map((d) => d.key)).toEqual(['392']);
    const wide = nearShapes(detail, 40, 60, 0.3);
    expect(wide.map((d) => d.key)).not.toContain('392');
  });

  it('handles the antimeridian', () => {
    expect(nearShapes(detail, 60, -179.5, 0.08).map((d) => d.key)).toEqual(['643']);
  });

  it('visible angle grows with altitude', () => {
    expect(visibleAngle(0.3)).toBeGreaterThan(visibleAngle(0.08));
  });

  it('replaces a coarse shape by id, or adds one that has no coarse counterpart', () => {
    const coarse = [square('392', 139, 35), square('250', 2, 46)];
    const fine = detail[0]!;
    const up = upgradeShapes(coarse, fine);
    expect(up).toHaveLength(2);
    expect(up[0]).toBe(fine.shape);
    expect(up[1]).toBe(coarse[1]);
    expect(upgradeShapes([coarse[1]!], fine)).toHaveLength(2);
  });
});
