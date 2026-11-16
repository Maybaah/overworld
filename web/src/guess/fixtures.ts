import { buildIndexes } from '../data/indexes';
import { company, game } from '../data/testData';

const PLACES: [string, string, number, number][] = [
  ['JP', 'Tokyo', 35.68, 139.69],
  ['US', 'Austin', 30.27, -97.74],
  ['GB', 'London', 51.51, -0.13],
  ['FR', 'Paris', 48.86, 2.35],
  ['DE', 'Berlin', 52.52, 13.4],
  ['SE', 'Stockholm', 59.33, 18.07],
  ['PL', 'Warsaw', 52.23, 21.01],
  ['CA', 'Montreal', 45.5, -73.57],
  ['BR', 'Sao Paulo', -23.55, -46.63],
  ['AU', 'Sydney', -33.87, 151.21],
];

export function fixtureData() {
  const companies = [
    ...PLACES.map(([country, city, lat, lng], i) =>
      company(i + 1, { name: `Studio ${city}`, country, city, lat, lng, precision: 'city' }),
    ),
    company(20, { name: 'Country Only', country: 'IT', city: null, lat: 42, lng: 12, precision: 'country' }),
    company(21, { name: 'Nowhere', country: null, city: null, lat: null, lng: null, precision: 'none' }),
  ];
  const games = [
    ...PLACES.map((_, i) => game(100 + i, { name: `Game ${i + 1}`, year: 1990 + i, leadCompanyId: i + 1, cover: `cov${i + 1}` })),
    game(200, { name: 'Second from Tokyo', leadCompanyId: 1, cover: 'covx' }),
    game(201, { name: 'No cover', leadCompanyId: 2, cover: null }),
    game(202, { name: 'Country precision', leadCompanyId: 20, cover: 'covy' }),
    game(203, { name: 'No location', leadCompanyId: 21, cover: 'covz' }),
  ];
  return { companies, games, indexes: buildIndexes(companies, games) };
}
