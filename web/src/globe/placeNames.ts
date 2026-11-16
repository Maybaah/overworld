import { insideView, RectGrid, type Rect } from './rectGrid';

type Ring = number[][];

export interface CountryAnchor {
  id: string;
  name: string;
  lat: number;
  lng: number;
  area: number;
}

export interface NamedShape {
  id?: string | number;
  properties?: { name?: string } | null;
  geometry: { type: string; coordinates: unknown };
}

export function ringCentroid(ring: Ring): { lat: number; lng: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const cross = p[0]! * q[1]! - q[0]! * p[1]!;
    a += cross;
    cx += (p[0]! + q[0]!) * cross;
    cy += (p[1]! + q[1]!) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0]!;
      sy += p[1]!;
    }
    return { lng: sx / Math.max(1, n), lat: sy / Math.max(1, n), area: 0 };
  }
  const lng = cx / (6 * a);
  const lat = cy / (6 * a);
  return { lng, lat, area: Math.abs(a) * Math.cos((lat * Math.PI) / 180) };
}

export function largestPolygonAnchor(geometry: NamedShape['geometry']): { lat: number; lng: number; area: number } | null {
  const polys: Ring[][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as Ring[]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])
        : [];
  let best: { lat: number; lng: number; area: number } | null = null;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 3) continue;
    const c = ringCentroid(outer);
    if (!best || c.area > best.area) best = c;
  }
  return best;
}

export function countryAnchors(shapes: readonly NamedShape[]): CountryAnchor[] {
  const out: CountryAnchor[] = [];
  shapes.forEach((s, i) => {
    const name = s.properties?.name;
    if (!name) return;
    const c = largestPolygonAnchor(s.geometry);
    if (!c) return;
    out.push({ id: String(s.id ?? `n${i}`), name, lat: c.lat, lng: c.lng, area: c.area });
  });
  return out.sort((a, b) => b.area - a.area);
}

export interface NameCandidate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
  around?: Rect;
}

const GAP = 3;
const FAR = 30;

function options(c: NameCandidate): Rect[] {
  const { x, y, w, h } = c;
  const a = c.around;
  if (!a) {
    return [
      { x: x - w / 2, y: y - h / 2, w, h },
      { x: x - w / 2, y: y + h / 2 + GAP, w, h },
      { x: x - w / 2, y: y - h * 1.5 - GAP, w, h },
      { x: x - w / 2, y: y + h / 2 + GAP + FAR, w, h },
      { x: x - w / 2, y: y - h * 1.5 - GAP - FAR, w, h },
    ];
  }
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const near = [
    { x: cx - w / 2, y: a.y + a.h + GAP, w, h },
    { x: a.x + a.w + GAP, y: cy - h / 2, w, h },
    { x: a.x - GAP - w, y: cy - h / 2, w, h },
    { x: cx - w / 2, y: a.y - GAP - h, w, h },
  ];
  const far = near.map((r, i) => ({ ...r, x: r.x + [0, FAR, -FAR, 0][i]!, y: r.y + [FAR, 0, 0, -FAR][i]! }));
  return [...near, ...far];
}

export function placeNames(
  candidates: readonly NameCandidate[],
  obstacles: readonly Rect[],
  view: { w: number; h: number },
  max: number,
  margin = 4,
): Map<string, Rect> {
  const grid = new RectGrid(64, 2);
  for (const o of obstacles) grid.add(o);
  const placed = new Map<string, Rect>();
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
  for (const c of sorted) {
    if (placed.size >= max) break;
    for (const r of options(c)) {
      if (!insideView(r, view, margin) || grid.hits(r)) continue;
      grid.add(r);
      placed.set(c.id, r);
      break;
    }
  }
  return placed;
}
