import { describe, expect, it } from 'vitest';
import { buildIndexes } from './indexes';
import { buildTimeline } from './timeline';
import { company, game } from './testData';

const companies = [
  company(1, { country: 'JP', city: 'Tokyo' }),
  company(2, { country: 'JP', city: 'Osaka' }),
  company(3, { country: 'US', city: null, precision: 'country' }),
  company(4, { country: null, city: null, lat: null, lng: null, precision: 'none' }),
];
const games = [
  game(1, { leadCompanyId: 1, year: 1990 }),
  game(2, { leadCompanyId: 1, year: 1995 }),
  game(3, { leadCompanyId: 2, year: 1995 }),
  game(4, { leadCompanyId: 3, year: 1960 }),
  game(5, { leadCompanyId: 1, year: null }),
  game(6, { leadCompanyId: 4, year: 2000 }),
  game(7, { leadCompanyId: 999, year: 2000 }),
];

describe('buildTimeline', () => {
  const idx = buildIndexes(companies, games);
  const tl = buildTimeline(idx, 1970, 2020);

  it('counts cumulatively per company, city and country', () => {
    expect(tl.countAt('company', 1, 1989)).toBe(0);
    expect(tl.countAt('company', 1, 1990)).toBe(1);
    expect(tl.countAt('company', 1, 1995)).toBe(2);
    expect(tl.countAt('company', 1, 2019)).toBe(2);
    expect(tl.countAt('city', 'JP|Tokyo', 1995)).toBe(2);
    expect(tl.countAt('city', 'JP|Osaka', 1994)).toBe(0);
    expect(tl.countAt('city', 'JP|Osaka', 1995)).toBe(1);
    expect(tl.countAt('country', 'JP', 1995)).toBe(3);
  });

  it('counts null-year games only at the max year', () => {
    expect(tl.countAt('company', 1, 2019)).toBe(2);
    expect(tl.countAt('company', 1, 2020)).toBe(3);
    expect(tl.countAt('country', 'JP', 2020)).toBe(4);
  });

  it('counts games before the min year from the min year', () => {
    expect(tl.countAt('company', 3, 1970)).toBe(1);
    expect(tl.countAt('country', 'US', 1970)).toBe(1);
    expect(tl.countAt('city', 'US|none', 1970)).toBe(0);
  });

  it('clamps years and tolerates unknown keys', () => {
    expect(tl.countAt('company', 1, 1900)).toBe(0);
    expect(tl.countAt('company', 1, 3000)).toBe(3);
    expect(tl.countAt('company', 12345, 2000)).toBe(0);
  });

  it('still counts games for unlocated companies at company level only', () => {
    expect(tl.countAt('company', 4, 2000)).toBe(1);
    expect(tl.keys('country')).not.toContain(null);
  });

  it('reads a whole level without allocating per entry', () => {
    const keys = tl.keys('country');
    const out = new Uint32Array(keys.length);
    tl.fillLevelAt('country', 1995, out);
    keys.forEach((k, i) => expect(out[i]).toBe(tl.countAt('country', k, 1995)));
    const view = tl.levelAt('country', 2020);
    keys.forEach((k, i) => expect(view[i]).toBe(tl.countAt('country', k, 2020)));
  });

  it('exposes whole series', () => {
    const s = tl.seriesOf('company', 1);
    expect(s).toHaveLength(51);
    expect(s[0]).toBe(0);
    expect(s[20]).toBe(1);
    expect(s[50]).toBe(3);
  });

  it('defaults maxYear to the latest game year', () => {
    expect(buildTimeline(idx).maxYear).toBe(2000);
  });
});
