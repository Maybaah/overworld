import type { Indexes } from '../data/indexes';
import type { SelectedPlace } from '../data/store';
import type { CompanyLayout } from './layout';
import { FLY_ALTITUDE } from './levels';

export interface Target {
  lat: number;
  lng: number;
  altitude: number;
}

export function placeTarget(
  indexes: Indexes,
  layout: CompanyLayout,
  companyIndex: ReadonlyMap<number, number>,
  place: SelectedPlace,
): Target | null {
  if (place.level === 'country') {
    const c = indexes.countries.find((x) => x.code === place.key);
    return c ? { lat: c.lat, lng: c.lng, altitude: FLY_ALTITUDE.country } : null;
  }
  if (place.level === 'city') {
    const c = indexes.cities.find((x) => x.key === place.key);
    return c ? { lat: c.lat, lng: c.lng, altitude: FLY_ALTITUDE.city } : null;
  }
  const i = companyIndex.get(place.key as number);
  if (i === undefined || layout.hidden[i]) return null;
  return { lat: layout.lat[i]!, lng: layout.lng[i]!, altitude: FLY_ALTITUDE.company };
}

export function gameTarget(
  indexes: Indexes,
  layout: CompanyLayout,
  companyIndex: ReadonlyMap<number, number>,
  gameId: number,
): Target | null {
  const g = indexes.gameById.get(gameId);
  if (!g) return null;
  const i = companyIndex.get(g.leadCompanyId);
  if (i === undefined || layout.hidden[i]) return null;
  return { lat: layout.lat[i]!, lng: layout.lng[i]!, altitude: FLY_ALTITUDE.game };
}
