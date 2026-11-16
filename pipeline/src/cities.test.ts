import { beforeAll, describe, expect, it } from 'vitest';
import { createCityResolver, type CityRecord, type CityResolver } from './cities';

let resolve: CityResolver;

beforeAll(() => {
  resolve = createCityResolver();
});

describe('city resolver with the real city list', () => {
  it('maps wards and districts of a metropolis to the metropolis', () => {
    expect(resolve('Shinagawa-ku', 35.61, 139.73)).toBe('Tokyo');
    expect(resolve('Chūō-ku', 34.68, 135.51)).toBe('Osaka');
    expect(resolve('Peck Building', 41.88, -87.63)).toBe('Chicago');
  });

  it('maps central Montreal to the package spelling', () => {
    expect(resolve('Ville-Marie', 45.5017, -73.5673)).toMatch(/^Montr[eé]al$/);
  });

  it('keeps suburbs that are real cities', () => {
    expect(resolve('Redwood City', 37.48, -122.24)).toBe('Redwood City');
    expect(resolve('Santa Monica', 34.02, -118.49)).toBe('Santa Monica');
    expect(resolve('Seongnam', 37.42, 127.13)).toBe('Seongnam');
  });

  it('keeps the label in the open ocean', () => {
    expect(resolve('Somewhere', 0, -30)).toBe('Somewhere');
  });

  it('does 6000 lookups well under a second', () => {
    const start = Date.now();
    for (let i = 0; i < 6000; i++) resolve('x', 30 + ((i * 7) % 2000) / 100, -100 + ((i * 13) % 5000) / 100);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('city resolver rules on a small list', () => {
  const cities: CityRecord[] = [
    { name: 'Metropolis', population: 2_000_000, lat: 10, lng: 10 },
    { name: 'Smallville', population: 20_000, lat: 20, lng: 20 },
    { name: 'Hamlet', population: 2_000, lat: 30, lng: 30 },
    { name: 'Nearby Town', population: 50_000, lat: 40, lng: 40 },
    { name: 'Bigtown', population: 3_000_000, lat: 50, lng: 50 },
  ];
  const r = createCityResolver(cities);

  it('rule a: a city of at least a million within 12 km wins, beyond that it does not', () => {
    expect(r('Ward', 10.05, 10.05)).toBe('Metropolis');
    expect(r('Ward', 10.2, 10)).toBe('Ward');
  });

  it('rule b: a city named like the label within 15 km keeps the label, with diacritics ignored', () => {
    expect(r('smállville', 20.1, 20)).toBe('smállville');
    expect(r('Hamlet', 30.1, 30)).toBe('Hamlet');
  });

  it('rule c: the nearest city of at least 15,000 within 10 km', () => {
    expect(r('Some Building', 40.05, 40)).toBe('Nearby Town');
    expect(r('Some Building', 30.02, 30)).toBe('Some Building');
  });

  it('rule a has priority over rule b', () => {
    expect(r('Bigtown', 50.05, 50)).toBe('Bigtown');
    expect(r('Metropolis', 10.05, 10.05)).toBe('Metropolis');
    expect(r('Smallville', 10.05, 10.05)).toBe('Metropolis');
  });
});
