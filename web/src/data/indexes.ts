import type { Company, GameSummary } from '@shared';

export interface CountryPlace {
  code: string;
  lat: number;
  lng: number;
  companyIds: number[];
}

export interface CityPlace {
  key: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  companyIds: number[];
}

export interface Indexes {
  companies: Company[];
  games: GameSummary[];
  companyById: Map<number, Company>;
  gameById: Map<number, GameSummary>;
  gamePosition: Map<number, number>;
  gamesByLeadCompany: Map<number, GameSummary[]>;
  countries: CountryPlace[];
  cities: CityPlace[];
}

export function cityKey(country: string, city: string): string {
  return `${country}|${city}`;
}

interface Acc {
  latSum: number;
  lngSum: number;
  companyIds: number[];
}

function newAcc(): Acc {
  return { latSum: 0, lngSum: 0, companyIds: [] };
}

function add(acc: Acc, id: number, lat: number, lng: number): void {
  acc.latSum += lat;
  acc.lngSum += lng;
  acc.companyIds.push(id);
}

export function buildIndexes(companies: Company[], games: GameSummary[]): Indexes {
  const companyById = new Map<number, Company>();
  for (const c of companies) companyById.set(c.id, c);

  const gameById = new Map<number, GameSummary>();
  const gamePosition = new Map<number, number>();
  const gamesByLeadCompany = new Map<number, GameSummary[]>();
  games.forEach((g, i) => {
    gameById.set(g.id, g);
    gamePosition.set(g.id, i);
    const list = gamesByLeadCompany.get(g.leadCompanyId);
    if (list) list.push(g);
    else gamesByLeadCompany.set(g.leadCompanyId, [g]);
  });
  for (const list of gamesByLeadCompany.values()) {
    list.sort((a, b) => b.popularity - a.popularity || gamePosition.get(a.id)! - gamePosition.get(b.id)!);
  }

  const countryAcc = new Map<string, Acc>();
  const cityAcc = new Map<string, Acc & { name: string; country: string }>();
  for (const c of companies) {
    if (c.precision === 'none' || c.country === null || c.lat === null || c.lng === null) continue;
    let ca = countryAcc.get(c.country);
    if (!ca) countryAcc.set(c.country, (ca = newAcc()));
    add(ca, c.id, c.lat, c.lng);
    if (c.precision === 'city' && c.city !== null) {
      const key = cityKey(c.country, c.city);
      let ya = cityAcc.get(key);
      if (!ya) cityAcc.set(key, (ya = { ...newAcc(), name: c.city, country: c.country }));
      add(ya, c.id, c.lat, c.lng);
    }
  }

  const countries: CountryPlace[] = [];
  for (const [code, a] of countryAcc) {
    const n = a.companyIds.length;
    countries.push({ code, lat: a.latSum / n, lng: a.lngSum / n, companyIds: a.companyIds });
  }
  const cities: CityPlace[] = [];
  for (const [key, a] of cityAcc) {
    const n = a.companyIds.length;
    cities.push({ key, name: a.name, country: a.country, lat: a.latSum / n, lng: a.lngSum / n, companyIds: a.companyIds });
  }

  return { companies, games, companyById, gameById, gamePosition, gamesByLeadCompany, countries, cities };
}
