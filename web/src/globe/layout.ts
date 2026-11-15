import type { Company } from '@shared';

export const SPIRAL_STEP_DEG = 0.02;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function spiralPosition(lat: number, lng: number, index: number): { lat: number; lng: number } {
  if (index === 0) return { lat, lng };
  const r = SPIRAL_STEP_DEG * Math.sqrt(index);
  const a = index * GOLDEN_ANGLE;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
  let outLng = lng + (r * Math.cos(a)) / cosLat;
  if (outLng > 180) outLng -= 360;
  else if (outLng < -180) outLng += 360;
  const outLat = Math.max(-89.9, Math.min(89.9, lat + r * Math.sin(a)));
  return { lat: outLat, lng: outLng };
}

export interface CompanyLayout {
  lat: Float64Array;
  lng: Float64Array;
  approx: Uint8Array;
  hidden: Uint8Array;
}

export function layoutCompanies(companies: readonly Company[]): CompanyLayout {
  const n = companies.length;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  const approx = new Uint8Array(n);
  const hidden = new Uint8Array(n);

  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const c = companies[i]!;
    if (c.precision === 'none' || c.lat === null || c.lng === null) {
      hidden[i] = 1;
      continue;
    }
    if (c.precision === 'country') approx[i] = 1;
    const key = `${c.precision}|${c.country ?? ''}|${c.lat.toFixed(3)}|${c.lng.toFixed(3)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }

  for (const members of groups.values()) {
    members.sort((a, b) => {
      const ca = companies[a]!;
      const cb = companies[b]!;
      return cb.leadCount - ca.leadCount || cb.gameCount - ca.gameCount || ca.id - cb.id;
    });
    let latSum = 0;
    let lngSum = 0;
    for (const i of members) {
      latSum += companies[i]!.lat!;
      lngSum += companies[i]!.lng!;
    }
    const cLat = latSum / members.length;
    const cLng = lngSum / members.length;
    members.forEach((i, k) => {
      const p = spiralPosition(cLat, cLng, k);
      lat[i] = p.lat;
      lng[i] = p.lng;
    });
  }

  return { lat, lng, approx, hidden };
}
