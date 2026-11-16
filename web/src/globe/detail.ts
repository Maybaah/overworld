import type { CountryShape } from './countries';

export interface DetailShape {
  key: string;
  shape: CountryShape;
  xyz: Float32Array;
}

function collect(coords: unknown, out: number[]): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') {
    const lng = ((coords[0] as number) * Math.PI) / 180;
    const lat = ((coords[1] as number) * Math.PI) / 180;
    out.push(Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat));
    return;
  }
  for (const c of coords) collect(c, out);
}

export function prepareDetail(shapes: readonly CountryShape[]): DetailShape[] {
  const out: DetailShape[] = [];
  for (const shape of shapes) {
    if (shape.id === undefined) continue;
    const xyz: number[] = [];
    collect(shape.geometry.coordinates, xyz);
    out.push({ key: String(shape.id), shape, xyz: Float32Array.from(xyz) });
  }
  return out;
}

export function visibleAngle(altitude: number): number {
  return Math.acos(1 / (1 + altitude)) + 0.08;
}

export function nearShapes(detail: readonly DetailShape[], lat: number, lng: number, altitude: number): DetailShape[] {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  const cx = Math.cos(la) * Math.cos(lo);
  const cy = Math.cos(la) * Math.sin(lo);
  const cz = Math.sin(la);
  const threshold = Math.cos(visibleAngle(altitude));
  const scored: { d: DetailShape; best: number }[] = [];
  for (const d of detail) {
    let best = -1;
    for (let i = 0; i < d.xyz.length; i += 3) {
      const dot = d.xyz[i]! * cx + d.xyz[i + 1]! * cy + d.xyz[i + 2]! * cz;
      if (dot > best) best = dot;
    }
    if (best >= threshold) scored.push({ d, best });
  }
  return scored.sort((a, b) => b.best - a.best).map((s) => s.d);
}

export function upgradeShapes(base: readonly CountryShape[], replacement: DetailShape): CountryShape[] {
  const key = String(replacement.key);
  let replaced = false;
  const next = base.map((s) => {
    if (s.id !== undefined && String(s.id) === key) {
      replaced = true;
      return replacement.shape;
    }
    return s;
  });
  if (!replaced) next.push(replacement.shape);
  return next;
}
