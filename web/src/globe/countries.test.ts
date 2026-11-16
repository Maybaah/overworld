import { describe, expect, it } from 'vitest';
import { alpha2OfNumeric, loadCountryShapes, shadeBucket, shadeColor, SHADE_BUCKETS } from './countries';

describe('alpha2OfNumeric', () => {
  it('maps ten known countries', () => {
    const known: [string | number, string][] = [
      ['840', 'US'],
      ['826', 'GB'],
      ['250', 'FR'],
      ['276', 'DE'],
      ['392', 'JP'],
      ['156', 'CN'],
      ['076', 'BR'],
      ['356', 'IN'],
      ['036', 'AU'],
      [372, 'IE'],
    ];
    for (const [id, code] of known) expect(alpha2OfNumeric(id)).toBe(code);
  });

  it('returns null for missing and unknown ids', () => {
    expect(alpha2OfNumeric(undefined)).toBeNull();
    expect(alpha2OfNumeric('999')).toBeNull();
  });

  it('resolves almost every 110m shape', () => {
    const shapes = loadCountryShapes();
    const resolved = shapes.filter((s) => alpha2OfNumeric(s.id) !== null).length;
    expect(resolved / shapes.length).toBeGreaterThan(0.95);
  });
});

describe('shade', () => {
  it('keeps zero and missing values at the normal fill', () => {
    expect(shadeBucket(undefined)).toBe(0);
    expect(shadeBucket(0)).toBe(0);
    expect(shadeColor(0, '#111a26', '#2f8f9d')).toBe('#111a26');
  });

  it('reaches the bright colour at 1 and is monotonic', () => {
    expect(shadeBucket(1)).toBe(SHADE_BUCKETS - 1);
    expect(shadeBucket(5)).toBe(SHADE_BUCKETS - 1);
    expect(shadeColor(SHADE_BUCKETS - 1, '#111a26', '#2f8f9d')).toBe('#2f8f9d');
    let prev = 0;
    for (let v = 0; v <= 1; v += 0.05) {
      const b = shadeBucket(v);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
    expect(shadeBucket(0.01)).toBe(1);
  });
});
