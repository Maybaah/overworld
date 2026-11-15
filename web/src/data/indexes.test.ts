import { describe, expect, it } from 'vitest';
import { buildIndexes } from './indexes';
import { company, game } from './testData';

const companies = [
  company(1, { country: 'JP', city: 'Tokyo', lat: 35, lng: 139 }),
  company(2, { country: 'JP', city: 'Tokyo', lat: 36, lng: 141 }),
  company(3, { country: 'JP', city: 'Osaka', lat: 34, lng: 135 }),
  company(4, { country: 'JP', city: null, lat: 36.2, lng: 138.2, precision: 'country' }),
  company(5, { country: 'US', city: 'Austin', lat: 30, lng: -97 }),
  company(6, { country: null, city: null, lat: null, lng: null, precision: 'none' }),
];
const games = [
  game(10, { leadCompanyId: 1, popularity: 50 }),
  game(11, { leadCompanyId: 1, popularity: 90 }),
  game(12, { leadCompanyId: 2, popularity: 70 }),
  game(13, { leadCompanyId: 1, popularity: 70 }),
];

describe('buildIndexes', () => {
  const idx = buildIndexes(companies, games);

  it('builds lookup maps', () => {
    expect(idx.companyById.get(3)?.name).toBe('Company 3');
    expect(idx.gameById.get(12)?.leadCompanyId).toBe(2);
    expect(idx.gamePosition.get(10)).toBe(0);
    expect(idx.gamePosition.get(13)).toBe(3);
  });

  it('groups games by lead company sorted by popularity', () => {
    expect(idx.gamesByLeadCompany.get(1)?.map((g) => g.id)).toEqual([11, 13, 10]);
    expect(idx.gamesByLeadCompany.get(2)?.map((g) => g.id)).toEqual([12]);
    expect(idx.gamesByLeadCompany.get(3)).toBeUndefined();
  });

  it('builds countries with mean coordinates, including country-precision companies', () => {
    const jp = idx.countries.find((c) => c.code === 'JP')!;
    expect(jp.companyIds).toEqual([1, 2, 3, 4]);
    expect(jp.lat).toBeCloseTo((35 + 36 + 34 + 36.2) / 4);
    expect(jp.lng).toBeCloseTo((139 + 141 + 135 + 138.2) / 4);
    expect(idx.countries.map((c) => c.code).sort()).toEqual(['JP', 'US']);
  });

  it('builds cities only from city-precision companies', () => {
    expect(idx.cities.map((c) => c.key).sort()).toEqual(['JP|Osaka', 'JP|Tokyo', 'US|Austin']);
    const tokyo = idx.cities.find((c) => c.key === 'JP|Tokyo')!;
    expect(tokyo).toMatchObject({ name: 'Tokyo', country: 'JP', companyIds: [1, 2] });
    expect(tokyo.lat).toBeCloseTo(35.5);
    expect(tokyo.lng).toBeCloseTo(140);
    expect(idx.cities.flatMap((c) => c.companyIds)).not.toContain(4);
  });

  it('leaves precision none companies out of every place', () => {
    expect(idx.countries.flatMap((c) => c.companyIds)).not.toContain(6);
    expect(idx.cities.flatMap((c) => c.companyIds)).not.toContain(6);
    expect(idx.companyById.has(6)).toBe(true);
  });
});
