const EARTH_RADIUS_KM = 6371;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  const phi1 = rad(a.lat);
  const phi2 = rad(b.lat);
  const dLng = rad(b.lng - a.lng);
  const bx = Math.cos(phi2) * Math.cos(dLng);
  const by = Math.cos(phi2) * Math.sin(dLng);
  const lat = Math.atan2(Math.sin(phi1) + Math.sin(phi2), Math.hypot(Math.cos(phi1) + bx, by));
  const lng = rad(a.lng) + Math.atan2(by, Math.cos(phi1) + bx);
  return { lat: deg(lat), lng: ((((deg(lng) + 180) % 360) + 360) % 360) - 180 };
}

export function altitudeForDistance(km: number): number {
  return Math.min(2.5, Math.max(0.5, 0.5 + km / 10000));
}
