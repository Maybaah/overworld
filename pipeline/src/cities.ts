import { createRequire } from 'node:module';

export interface CityRecord {
  name: string;
  population: number;
  lat: number;
  lng: number;
}

export type CityResolver = (label: string, lat: number, lng: number) => string;

const BIG_CITY_POPULATION = 1_000_000;
const BIG_CITY_KM = 12;
const SAME_NAME_KM = 15;
const TOWN_POPULATION = 15_000;
const TOWN_KM = 10;
const MAX_KM = Math.max(BIG_CITY_KM, SAME_NAME_KM, TOWN_KM);
const CELL_DEGREES = 0.25;
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.195;

const CITY_SUFFIX = /-(si|shi)$/i;

function displayName(name: string): string {
  return name.replace(CITY_SUFFIX, '');
}

function foldName(name: string): string {
  return displayName(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim());
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
    population: number;
    loc: { coordinates: [number, number] };
  }[];
  return raw.map((c) => ({ name: c.name, population: c.population, lat: c.loc.coordinates[1], lng: c.loc.coordinates[0] }));
}

export function createCityResolver(cities: CityRecord[] = loadCityRecords()): CityResolver {
  const grid = new Map<string, { city: CityRecord; folded: string }[]>();
  const cellOf = (v: number) => Math.floor(v / CELL_DEGREES);
  for (const city of cities) {
    const key = `${cellOf(city.lat)}:${cellOf(city.lng)}`;
    const entry = { city, folded: foldName(city.name) };
    const bucket = grid.get(key);
    if (bucket) bucket.push(entry);
    else grid.set(key, [entry]);
  }

  return (label, lat, lng) => {
    const dLat = MAX_KM / KM_PER_DEGREE;
    const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    const dLng = MAX_KM / (KM_PER_DEGREE * cosLat);
    const wanted = foldName(label);
    let big: { name: string; km: number } | null = null;
    let same: { name: string; km: number } | null = null;
    let town: { name: string; km: number } | null = null;

    for (let r = cellOf(lat - dLat); r <= cellOf(lat + dLat); r++) {
      for (let c = cellOf(lng - dLng); c <= cellOf(lng + dLng); c++) {
        for (const { city, folded } of grid.get(`${r}:${c}`) ?? []) {
          const km = distanceKm(lat, lng, city.lat, city.lng);
          if (city.population >= BIG_CITY_POPULATION && km <= BIG_CITY_KM && (!big || km < big.km)) big = { name: displayName(city.name), km };
          if (folded === wanted && km <= SAME_NAME_KM && (!same || km < same.km)) same = { name: label, km };
          if (city.population >= TOWN_POPULATION && km <= TOWN_KM && (!town || km < town.km)) town = { name: displayName(city.name), km };
        }
      }
    }
    return (big ?? same ?? town)?.name ?? label;
  };
}
