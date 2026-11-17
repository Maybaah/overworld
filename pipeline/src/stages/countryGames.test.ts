import { describe, expect, it } from 'vitest';
import type { RawIgdbGame } from '../raw';
import { correctionFor, developerOf, pickSearchHit, placeOf, type CountryGame } from './countryGames';

const game = (id: number, name: string, year: number | null, devs: number[] = [1]): RawIgdbGame => ({
  id,
  name,
  slug: name.toLowerCase(),
  url: '',
  firstReleaseDate: year === null ? null : Date.UTC(year, 5, 1) / 1000,
  totalRatingCount: 0,
  gameType: 0,
  genres: [],
  platforms: [],
  cover: null,
  screenshots: [],
  involvedCompanies: devs.map((company, i) => ({ id: i, company, developer: true, publisher: false, porting: false, supporting: false })),
  steamAppId: null,
  steamAppIds: [],
});

const entry = (over: Partial<CountryGame> = {}): CountryGame => ({
  country: 'KE',
  game: 'Nairobi X',
  year: 2016,
  developer: 'Black Division Games',
  city: 'Nairobi',
  evidenceUrl: 'https://example.org/kenya',
  ...over,
});

const cities = [
  { name: 'Nairobi', country: 'KE', population: 4_000_000, lat: -1.28, lng: 36.82 },
  { name: 'Nairobi', country: 'XX', population: 10, lat: 0, lng: 0 },
];

describe('pickSearchHit', () => {
  it('takes the same title within a year of the listed one', () => {
    const hits = [game(1, 'Nairobi X: Remastered', 2016), game(2, 'Nairobi X', 2010), game(3, 'Nairobi X', 2017)];
    expect(pickSearchHit(entry(), hits)?.id).toBe(3);
    expect(pickSearchHit(entry({ year: 2005 }), hits)).toBeNull();
    expect(pickSearchHit(entry({ year: null }), hits)?.id).toBe(2);
  });
});

describe('developerOf', () => {
  it('prefers the developer named in the list, else the only developer', () => {
    const names = new Map([[1, 'Some Publisher'], [2, 'Black Division Games Ltd']]);
    expect(developerOf(entry(), game(1, 'Nairobi X', 2016, [1, 2]), names)).toBe(2);
    expect(developerOf(entry({ developer: 'Unknown' }), game(1, 'Nairobi X', 2016, [1]), names)).toBe(1);
    expect(developerOf(entry({ developer: 'Unknown' }), game(1, 'Nairobi X', 2016, [1, 2]), names)).toBeNull();
  });
});

describe('placeOf and correctionFor', () => {
  it('places the studio in the named city of that country, or leaves it at country level', () => {
    expect(placeOf(entry(), cities)).toEqual({ city: 'Nairobi', lat: -1.28, lng: 36.82 });
    expect(placeOf(entry({ city: 'Atlantis' }), cities)).toBeNull();
    expect(placeOf(entry({ city: null }), cities)).toBeNull();
    expect(correctionFor(entry(), 7, 'Black Division Games', cities)).toMatchObject({ igdbCompanyId: 7, country: 'KE', city: 'Nairobi', evidenceUrl: 'https://example.org/kenya' });
  });
});

describe('curated records', () => {
  it('gives games and studios IGDB lacks stable ids above IGDB range, linked to each other', async () => {
    const { curatedGame, curatedCompany, CURATED_ID_BASE } = await import('./countryGames');
    const e = entry({ storeUrl: 'https://store.example/nx' });
    const g = curatedGame(e);
    const c = curatedCompany(e);
    expect(g.id).toBe(curatedGame(e).id);
    expect(g.id).toBeGreaterThanOrEqual(CURATED_ID_BASE);
    expect(c.id).toBeLessThan(2 ** 31);
    expect(g.involvedCompanies[0]).toMatchObject({ company: c.id, developer: true });
    expect(g.url).toBe('https://store.example/nx');
    expect(c).toMatchObject({ name: 'Black Division Games', url: 'https://example.org/kenya', country: 404, curated: true });
    expect(g.firstReleaseDate).toBe(Date.UTC(2016, 0, 1) / 1000);
  });
});
