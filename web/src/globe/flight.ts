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

export const FRAME_MIN_ALTITUDE = 0.6;
export const FRAME_MAX_ALTITUDE = 2.6;
const VIEW_TAN = 0.37;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function unit(lat: number, lng: number): Vec3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
}

export function frameTarget(
  lead: { lat: number; lng: number },
  ends: readonly { lat: number; lng: number }[],
): Target {
  if (ends.length === 0) return { lat: lead.lat, lng: lead.lng, altitude: FLY_ALTITUDE.game };
  const l = unit(lead.lat, lead.lng);
  const w = ends.length;
  let x = l.x * w;
  let y = l.y * w;
  let z = l.z * w;
  const vs = ends.map((e) => unit(e.lat, e.lng));
  for (const v of vs) {
    x += v.x;
    y += v.y;
    z += v.z;
  }
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return { lat: lead.lat, lng: lead.lng, altitude: FRAME_MAX_ALTITUDE };
  const c = { x: x / len, y: y / len, z: z / len };
  const lat = (Math.asin(Math.max(-1, Math.min(1, c.z))) * 180) / Math.PI;
  const lng = (Math.atan2(c.y, c.x) * 180) / Math.PI;

  let altitude = FRAME_MIN_ALTITUDE;
  for (const v of [l, ...vs]) {
    const cos = Math.max(-1, Math.min(1, c.x * v.x + c.y * v.y + c.z * v.z));
    if (cos <= 0.05) {
      altitude = FRAME_MAX_ALTITUDE;
      break;
    }
    const sin = Math.sqrt(1 - cos * cos);
    altitude = Math.max(altitude, cos + sin / VIEW_TAN - 1);
  }
  return { lat, lng, altitude: Math.min(FRAME_MAX_ALTITUDE, altitude) };
}
