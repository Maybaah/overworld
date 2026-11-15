import { describe, expect, it } from 'vitest';
import { company } from '../data/testData';
import { layoutCompanies, spiralPosition, SPIRAL_STEP_DEG } from './layout';

function many(n: number, over = {}) {
  return Array.from({ length: n }, (_, i) => company(i + 1, { leadCount: n - i, ...over }));
}

describe('spiralPosition', () => {
  it('puts index 0 on the centre', () => {
    expect(spiralPosition(10, 20, 0)).toEqual({ lat: 10, lng: 20 });
  });
  it('grows with the square root of the index', () => {
    const p = spiralPosition(0, 0, 100);
    expect(Math.hypot(p.lat, p.lng)).toBeCloseTo(SPIRAL_STEP_DEG * 10, 6);
  });
  it('keeps latitude and longitude in range', () => {
    const p = spiralPosition(89.95, 179.99, 5000);
    expect(p.lat).toBeLessThanOrEqual(89.9);
    expect(Math.abs(p.lng)).toBeLessThanOrEqual(180);
  });
});

describe('layoutCompanies', () => {
  it('is deterministic', () => {
    const cs = many(50);
    const a = layoutCompanies(cs);
    const b = layoutCompanies(cs);
    expect(Array.from(a.lat)).toEqual(Array.from(b.lat));
    expect(Array.from(a.lng)).toEqual(Array.from(b.lng));
  });

  it('puts the company with most led games in the city centre', () => {
    const cs = [company(1, { leadCount: 1 }), company(2, { leadCount: 9 }), company(3, { leadCount: 4 })];
    const l = layoutCompanies(cs);
    expect(l.lat[1]).toBeCloseTo(35.68, 9);
    expect(l.lng[1]).toBeCloseTo(139.69, 9);
    expect(l.lat[0]).not.toBeCloseTo(35.68, 6);
  });

  it('gives no two companies of one city the same spot', () => {
    const l = layoutCompanies(many(2000));
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(`${l.lat[i]!.toFixed(7)}|${l.lng[i]!.toFixed(7)}`);
    expect(seen.size).toBe(2000);
  });

  it('lays out separate cities around their own centres', () => {
    const cs = [
      company(1, { city: 'Tokyo', lat: 35.68, lng: 139.69 }),
      company(2, { city: 'Osaka', lat: 34.69, lng: 135.5 }),
      company(3, { city: 'Osaka', lat: 34.69, lng: 135.5 }),
    ];
    const l = layoutCompanies(cs);
    expect(l.lat[0]).toBeCloseTo(35.68, 9);
    expect(l.lat[1]).toBeCloseTo(34.69, 9);
    expect(l.lat[2]).not.toBeCloseTo(34.69, 6);
  });

  it('marks country-precision companies approximate and spreads them around the country centre', () => {
    const cs = many(10, { precision: 'country', city: null, lat: 46, lng: 2, country: 'FR' });
    const l = layoutCompanies(cs);
    expect(Array.from(l.approx)).toEqual(new Array(10).fill(1));
    const spots = new Set(Array.from(l.lat, (v, i) => `${v}|${l.lng[i]}`));
    expect(spots.size).toBe(10);
    for (let i = 0; i < 10; i++) expect(Math.abs(l.lat[i]! - 46)).toBeLessThan(0.1);
  });

  it('does not mix city and country precision at the same coordinates', () => {
    const cs = [
      company(1, { precision: 'city', lat: 46, lng: 2, country: 'FR', city: 'X' }),
      company(2, { precision: 'country', lat: 46, lng: 2, country: 'FR', city: null }),
    ];
    const l = layoutCompanies(cs);
    expect(l.lat[0]).toBe(46);
    expect(l.lat[1]).toBe(46);
    expect([l.approx[0], l.approx[1]]).toEqual([0, 1]);
  });

  it('hides companies without a location', () => {
    const cs = [company(1, { precision: 'none', lat: null, lng: null, country: null, city: null }), company(2)];
    const l = layoutCompanies(cs);
    expect([l.hidden[0], l.hidden[1]]).toEqual([1, 0]);
  });
});
