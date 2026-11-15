import type { Indexes } from './indexes';

export type PlaceLevel = 'country' | 'city' | 'company';
export type PlaceKey = string | number;

interface LevelData {
  keys: PlaceKey[];
  rowOf: Map<PlaceKey, number>;
  data: Uint32Array;
}

export interface Timeline {
  minYear: number;
  maxYear: number;
  years: number;
  keys(level: PlaceLevel): readonly PlaceKey[];
  countAt(level: PlaceLevel, key: PlaceKey, year: number): number;
  fillLevelAt(level: PlaceLevel, year: number, out: Uint32Array): void;
  levelAt(level: PlaceLevel, year: number): Uint32Array;
  seriesOf(level: PlaceLevel, key: PlaceKey): Uint32Array;
}

// Layout is year-major (data[yearIndex * keys.length + row]) so one year of a level is a contiguous slice.
function makeLevel(keys: PlaceKey[], years: number): LevelData {
  const rowOf = new Map<PlaceKey, number>();
  keys.forEach((k, i) => rowOf.set(k, i));
  return { keys, rowOf, data: new Uint32Array(keys.length * years) };
}

export function buildTimeline(indexes: Indexes, minYear = 1970, maxYear?: number): Timeline {
  let max = maxYear;
  if (max === undefined) {
    max = minYear;
    for (const g of indexes.games) if (g.year !== null && g.year > max) max = g.year;
  }
  const top = max;
  const years = top - minYear + 1;

  const levels: Record<PlaceLevel, LevelData> = {
    country: makeLevel(indexes.countries.map((c) => c.code), years),
    city: makeLevel(indexes.cities.map((c) => c.key), years),
    company: makeLevel(indexes.companies.map((c) => c.id), years),
  };

  const countryRowOfCompany = new Map<number, number>();
  indexes.countries.forEach((c, row) => c.companyIds.forEach((id) => countryRowOfCompany.set(id, row)));
  const cityRowOfCompany = new Map<number, number>();
  indexes.cities.forEach((c, row) => c.companyIds.forEach((id) => cityRowOfCompany.set(id, row)));

  for (const g of indexes.games) {
    const yi = g.year === null ? years - 1 : Math.min(Math.max(g.year, minYear), top) - minYear;
    const companyRow = levels.company.rowOf.get(g.leadCompanyId);
    if (companyRow === undefined) continue;
    levels.company.data[yi * levels.company.keys.length + companyRow]!++;
    const cr = countryRowOfCompany.get(g.leadCompanyId);
    if (cr !== undefined) levels.country.data[yi * levels.country.keys.length + cr]!++;
    const yr = cityRowOfCompany.get(g.leadCompanyId);
    if (yr !== undefined) levels.city.data[yi * levels.city.keys.length + yr]!++;
  }

  for (const level of Object.values(levels)) {
    const n = level.keys.length;
    for (let yi = 1; yi < years; yi++) {
      const base = yi * n;
      const prev = base - n;
      for (let r = 0; r < n; r++) level.data[base + r]! += level.data[prev + r]!;
    }
  }

  const yearIndex = (year: number) => Math.min(Math.max(year, minYear), top) - minYear;

  return {
    minYear,
    maxYear: top,
    years,
    keys: (level) => levels[level].keys,
    countAt(level, key, year) {
      const l = levels[level];
      const row = l.rowOf.get(key);
      return row === undefined ? 0 : l.data[yearIndex(year) * l.keys.length + row]!;
    },
    fillLevelAt(level, year, out) {
      const l = levels[level];
      const n = l.keys.length;
      const base = yearIndex(year) * n;
      const data = l.data;
      for (let r = 0; r < n; r++) out[r] = data[base + r]!;
    },
    levelAt(level, year) {
      const l = levels[level];
      const n = l.keys.length;
      const base = yearIndex(year) * n;
      return l.data.subarray(base, base + n);
    },
    seriesOf(level, key) {
      const l = levels[level];
      const out = new Uint32Array(years);
      const row = l.rowOf.get(key);
      if (row === undefined) return out;
      const n = l.keys.length;
      for (let yi = 0; yi < years; yi++) out[yi] = l.data[yi * n + row]!;
      return out;
    },
  };
}
