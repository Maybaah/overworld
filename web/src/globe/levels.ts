import type { PlaceLevel } from '../data/timeline';

export type Level = PlaceLevel;

export const LEVELS: readonly Level[] = ['country', 'city', 'company'];
export const COUNTRY_ABOVE = 1.1;
export const CITY_FROM = 0.3;

export const FLY_ALTITUDE = {
  country: 0.7,
  city: 0.15,
  company: 0.08,
  game: 1.6,
} as const;

export function levelForAltitude(altitude: number): Level {
  if (altitude > COUNTRY_ABOVE) return 'country';
  if (altitude >= CITY_FROM) return 'city';
  return 'company';
}
