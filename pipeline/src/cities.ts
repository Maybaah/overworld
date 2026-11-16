import { createRequire } from 'node:module';

export interface CityRecord {
  name: string;
  country?: string;
  population: number;
  lat: number;
  lng: number;
}

export type CityResolver = (label: string, lat: number, lng: number) => string;
export type CountryResolver = (lat: number, lng: number) => string | null;

const BIG_CITY_POPULATION = 1_000_000;
const BIG_CITY_KM = 20;
const SAME_NAME_KM = 15;
const TOWN_POPULATION = 15_000;
const TOWN_KM = 10;
const COUNTRY_KM = 50;
const CELL_DEGREES = 0.25;
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.195;

const CITY_SUFFIX = /[- ]s(h)?i$/i;

function displayName(name: string): string {
  return name.replace(CITY_SUFFIX, '');
}

function foldName(name: string): string {
  return displayName(name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function loadCityRecords(): CityRecord[] {
  const require = createRequire(import.meta.url);
  const raw = require('all-the-cities') as {
    name: string;
    country: string;
    population: number;
    loc: { coordinates: [number, number] };
  }[];
  return raw.map((c) => ({
    name: c.name,
    country: c.country,
    population: c.population,
    lat: c.loc.coordinates[1],
    lng: c.loc.coordinates[0],
  }));
}

export interface CityIndex {
  resolveCity: CityResolver;
  resolveCountry: CountryResolver;
}

export function createCityIndex(cities: CityRecord[] = loadCityRecords()): CityIndex {
  const grid = new Map<string, { city: CityRecord; folded: string }[]>();
  const cellOf = (v: number) => Math.floor(v / CELL_DEGREES);
  for (const city of cities) {
    const key = `${cellOf(city.lat)}:${cellOf(city.lng)}`;
    const entry = { city, folded: foldName(city.name) };
    const bucket = grid.get(key);
    if (bucket) bucket.push(entry);
    else grid.set(key, [entry]);
  }

  function* near(lat: number, lng: number, km: number) {
    const dLat = km / KM_PER_DEGREE;
    const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const dLng = km / (KM_PER_DEGREE * cosLat);
    for (let r = cellOf(lat - dLat); r <= cellOf(lat + dLat); r++) {
      for (let c = cellOf(lng - dLng); c <= cellOf(lng + dLng); c++) {
        for (const entry of grid.get(`${r}:${c}`) ?? []) {
          yield { ...entry, km: distanceKm(lat, lng, entry.city.lat, entry.city.lng) };
        }
      }
    }
  }

  const resolveCity: CityResolver = (label, lat, lng) => {
    const wanted = foldName(label);
    let sameName = false;
    let big: CityRecord | null = null;
    let town: { name: string; km: number } | null = null;
    for (const { city, folded, km } of near(lat, lng, Math.max(BIG_CITY_KM, SAME_NAME_KM, TOWN_KM))) {
      if (folded === wanted && km <= SAME_NAME_KM) sameName = true;
      if (city.population >= BIG_CITY_POPULATION && km <= BIG_CITY_KM && (!big || city.population > big.population)) big = city;
      if (city.population >= TOWN_POPULATION && km <= TOWN_KM && (!town || km < town.km)) town = { name: city.name, km };
    }
    if (sameName) return displayName(label);
    if (big) return displayName(big.name);
    if (town) return displayName(town.name);
    return displayName(label);
  };

  const resolveCountry: CountryResolver = (lat, lng) => {
    let best: { country: string; km: number } | null = null;
    for (const { city, km } of near(lat, lng, COUNTRY_KM)) {
      if (city.country && km <= COUNTRY_KM && (!best || km < best.km)) best = { country: city.country, km };
    }
    return best?.country ?? null;
  };

  return { resolveCity, resolveCountry };
}

export function createCityResolver(cities?: CityRecord[]): CityResolver {
  return createCityIndex(cities).resolveCity;
}
