import { describe, expect, it } from 'vitest';
import { FRAME_MAX_ALTITUDE, FRAME_MIN_ALTITUDE, frameTarget } from './flight';

describe('frameTarget', () => {
  it('falls back to the lead studio at game altitude when there are no ends', () => {
    expect(frameTarget({ lat: 10, lng: 20 }, [])).toEqual({ lat: 10, lng: 20, altitude: 1.6 });
  });

  it('stays at the minimum altitude when everything is close together', () => {
    const t = frameTarget({ lat: 48.85, lng: 2.35 }, [{ lat: 48.9, lng: 2.4 }, { lat: 49, lng: 2.5 }]);
    expect(t.altitude).toBe(FRAME_MIN_ALTITUDE);
    expect(t.lat).toBeCloseTo(48.9, 0);
  });

  it('centres between the lead and a far end and rises with the spread', () => {
    const near = frameTarget({ lat: 48, lng: 2 }, [{ lat: 52, lng: 13 }]);
    const far = frameTarget({ lat: 48, lng: 2 }, [{ lat: 35, lng: 139 }]);
    expect(far.altitude).toBeGreaterThan(near.altitude);
    expect(far.altitude).toBeLessThanOrEqual(FRAME_MAX_ALTITUDE);
  });

  it('weights the centre toward the lead as ends increase and keeps the lead in frame', () => {
    const ends = Array.from({ length: 4 }, () => ({ lat: 35, lng: 139 }));
    const t = frameTarget({ lat: 48, lng: 2 }, ends);
    const lngMid = t.lng;
    expect(lngMid).toBeGreaterThan(2);
    expect(lngMid).toBeLessThan(139);
  });

  it('clamps at the maximum when the spread exceeds a hemisphere', () => {
    const t = frameTarget({ lat: 0, lng: 0 }, [{ lat: 0, lng: 180 }, { lat: 0, lng: 170 }]);
    expect(t.altitude).toBe(FRAME_MAX_ALTITUDE);
  });

  it('keeps altitude within 0.6 and 2.6 for random layouts', () => {
    for (let i = 0; i < 200; i++) {
      const t = frameTarget(
        { lat: (i * 37) % 160 - 80, lng: (i * 91) % 360 - 180 },
        [{ lat: (i * 53) % 160 - 80, lng: (i * 17) % 360 - 180 }],
      );
      expect(t.altitude).toBeGreaterThanOrEqual(FRAME_MIN_ALTITUDE);
      expect(t.altitude).toBeLessThanOrEqual(FRAME_MAX_ALTITUDE);
    }
  });
});
