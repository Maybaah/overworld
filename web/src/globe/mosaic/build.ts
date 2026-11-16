import * as THREE from 'three';
import type { CountryShape } from '../countries';
import { alpha2OfNumeric } from '../countries';
import { toCartesian } from '../outline';
import {
  azimuthalEqualArea,
  bbox,
  fitPowerDiagram,
  orient,
  pointInRegion,
  regionArea,
  ringArea,
  segmentInside,
  type ClippedCell,
  type Projection,
  type Pt,
  type Region,
  type Ring,
} from './geometry';

export const MOSAIC_ALTITUDE = 0.0041;
export const MOSAIC_LINE_ALTITUDE = 0.00415;
export const COVER_ASPECT = 264 / 374;
const MAX_EDGE = 1.2;
const POPULARITY_EXPONENT = 0.7;

export interface MosaicGame {
  id: number;
  cover: string | null;
  popularity: number;
  lat: number;
  lng: number;
  country: string;
  exact: boolean; // city-level location
}

export interface MosaicOptions {
  maxCells: number;
  minCellArea: number; // square degrees of arc
  iterations: number;
  tether: number;
}

export const DEFAULT_OPTIONS: MosaicOptions = { maxCells: 1200, minCellArea: 0.12, iterations: 40, tether: 0.15 };

export interface MosaicCell {
  gameId: number;
  cover: string | null;
  lat: number;
  lng: number;
  area: number;
}

export interface MosaicMesh {
  position: Float32Array;
  uv: Float32Array;
  cell: Float32Array;
  lines: Float32Array;
  cells: MosaicCell[];
}

export interface CountryRegion {
  code: string;
  projection: Projection;
  region: Region;
  area: number;
  center: { lat: number; lng: number };
}

function rings(shape: CountryShape): number[][][][] {
  const g = shape.geometry;
  const c = g.coordinates as unknown as number[][][] | number[][][][];
  if (g.type === 'Polygon') return [c as number[][][]];
  if (g.type === 'MultiPolygon') return c as number[][][][];
  return [];
}

function sphericalCenter(polys: number[][][][]): { lat: number; lng: number } {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const poly of polys) {
    const ring = poly[0] ?? [];
    const outer = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring;
    for (const [lng, lat] of outer) {
      const p = (lat! * Math.PI) / 180;
      const l = (lng! * Math.PI) / 180;
      x += Math.cos(p) * Math.cos(l);
      y += Math.cos(p) * Math.sin(l);
      z += Math.sin(p);
    }
  }
  return { lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lng: (Math.atan2(y, x) * 180) / Math.PI };
}

function closeless(ring: number[][], proj: Projection): Ring {
  const out: Ring = ring.map(([lng, lat]) => proj.forward(lat!, lng!));
  const a = out[0];
  const b = out[out.length - 1];
  if (a && b && a[0] === b[0] && a[1] === b[1]) out.pop();
  return out;
}

export function countryRegions(shapes: readonly CountryShape[]): Map<string, CountryRegion> {
  const out = new Map<string, CountryRegion>();
  for (const s of shapes) {
    const code = alpha2OfNumeric(s.id);
    if (!code) continue;
    const polys = rings(s);
    if (polys.length === 0) continue;
    const center = sphericalCenter(polys);
    const projection = azimuthalEqualArea(center.lat, center.lng);
    const region: Region = { outers: [], holes: [] };
    for (const poly of polys) {
      poly.forEach((ring, k) => {
        const r = closeless(ring, projection);
        if (r.length < 3) return;
        if (k === 0) region.outers.push(orient(r, true));
        else region.holes.push(orient(r, true));
      });
    }
    out.set(code, { code, projection, region, area: regionArea(region), center });
  }
  return out;
}

function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function interiorPoint(seed: number, region: Region): Pt {
  const b = bbox(region.outers.flat());
  for (let k = 0; k < 200; k++) {
    const p: Pt = [b[0] + (b[2] - b[0]) * hash(seed * 7919 + k * 2), b[1] + (b[3] - b[1]) * hash(seed * 104729 + k * 2 + 1)];
    if (pointInRegion(p, region)) return p;
  }
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

export function placeSites(games: readonly MosaicGame[], country: CountryRegion): Pt[] {
  const n = games.length;
  const step = 0.35 * Math.sqrt(country.area / Math.max(1, n));
  const used = new Map<string, number>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  return games.map((g) => {
    const base = g.exact ? country.projection.forward(g.lat, g.lng) : interiorPoint(g.id, country.region);
    const key = `${base[0].toFixed(4)},${base[1].toFixed(4)}`;
    const k = used.get(key) ?? 0;
    used.set(key, k + 1);
    const r = step * Math.sqrt(k);
    const p: Pt = k === 0 ? base : [base[0] + r * Math.cos(k * golden), base[1] + r * Math.sin(k * golden)];
    return insideNear(p, country.region, step, g.id);
  });
}

// The nearest point inside the region found by walking out in rings, so coastal cities stay on land.
export function insideNear(p: Pt, region: Region, step: number, seed: number): Pt {
  if (pointInRegion(p, region)) return p;
  for (let ring = 1; ring <= 60; ring++) {
    const r = step * 0.5 * ring;
    const k = 8 + ring * 2;
    for (let a = 0; a < k; a++) {
      const t = ((a + hash(seed + ring) ) / k) * Math.PI * 2;
      const q: Pt = [p[0] + r * Math.cos(t), p[1] + r * Math.sin(t)];
      if (pointInRegion(q, region)) return q;
    }
  }
  return interiorPoint(seed, region);
}

export function cellBudget(counts: ReadonlyMap<string, number>, areas: ReadonlyMap<string, number>, o: MosaicOptions): Map<string, number> {
  const want = new Map<string, number>();
  let total = 0;
  for (const [code, n] of counts) {
    const k = Math.max(1, Math.min(n, Math.floor((areas.get(code) ?? 0) / o.minCellArea)));
    want.set(code, k);
    total += k;
  }
  if (total <= o.maxCells) return want;
  const scale = o.maxCells / total;
  for (const [code, k] of want) want.set(code, Math.max(1, Math.floor(k * scale)));
  return want;
}

function splitTriangle(t: number[], out: number[]): void {
  const stack: number[][] = [t];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy] = stack.pop()! as [number, number, number, number, number, number];
    const ab = Math.hypot(bx - ax, by - ay);
    const bc = Math.hypot(cx - bx, cy - by);
    const ca = Math.hypot(ax - cx, ay - cy);
    const longest = Math.max(ab, bc, ca);
    if (longest <= MAX_EDGE) {
      out.push(ax, ay, bx, by, cx, cy);
      continue;
    }
    if (longest === ab) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      stack.push([ax, ay, mx, my, cx, cy], [mx, my, bx, by, cx, cy]);
    } else if (longest === bc) {
      const mx = (bx + cx) / 2;
      const my = (by + cy) / 2;
      stack.push([bx, by, mx, my, ax, ay], [mx, my, cx, cy, ax, ay]);
    } else {
      const mx = (cx + ax) / 2;
      const my = (cy + ay) / 2;
      stack.push([cx, cy, mx, my, bx, by], [mx, my, ax, ay, bx, by]);
    }
  }
}

export interface CountryMosaic {
  key: string;
  position: number[];
  uv: number[];
  cell: number[]; // local cell index
  lines: number[];
  cells: MosaicCell[];
}

// Evenly spread points inside a region: a jittered grid over its box, keeping the cells that fall inside.
export function spreadPoints(region: Region, k: number, seed: number): Pt[] {
  const b = bbox(region.outers.flat());
  const area = Math.max(1e-9, regionArea(region));
  const boxArea = Math.max(1e-9, (b[2] - b[0]) * (b[3] - b[1]));
  for (let scale = 1; scale < 64; scale *= 1.5) {
    const cell = Math.sqrt(area / (k * scale)) || 1e-3;
    const out: Pt[] = [];
    let n = 0;
    for (let y = b[1] + cell / 2; y < b[3]; y += cell) {
      for (let x = b[0] + cell / 2; x < b[2]; x += cell) {
        n++;
        const p: Pt = [x + (hash(seed + n * 2) - 0.5) * cell * 0.6, y + (hash(seed + n * 2 + 1) - 0.5) * cell * 0.6];
        if (pointInRegion(p, region)) out.push(p);
      }
    }
    if (out.length >= k) {
      const picked: Pt[] = [];
      const stride = out.length / k;
      for (let i = 0; i < k; i++) picked.push(out[Math.floor(i * stride)]!);
      return picked;
    }
    if (boxArea / (cell * cell) > 4e5) break;
  }
  return Array.from({ length: k }, (_, i) => interiorPoint(seed + i, region));
}

// Groups games by metro area: a game joins the first group whose anchor city is within reach, in popularity order,
// so the anchor of each group is the city of its most popular game. Games placed only by country form one group.
export function metroGroups(games: readonly MosaicGame[], country: CountryRegion): MosaicGame[][] {
  const reach = Math.min(3, Math.max(0.5, 0.08 * Math.sqrt(country.area)));
  const groups: { anchor: Pt | null; list: MosaicGame[] }[] = [];
  for (const g of games) {
    const p = g.exact ? country.projection.forward(g.lat, g.lng) : null;
    const hit = groups.find((x) => (p === null ? x.anchor === null : x.anchor !== null && Math.hypot(x.anchor[0] - p[0], x.anchor[1] - p[1]) <= reach));
    if (hit) hit.list.push(g);
    else groups.push({ anchor: p, list: [g] });
  }
  return groups.map((x) => x.list);
}

function regionOf(cell: ClippedCell): Region {
  return { outers: cell.pieces.map((p) => p.outer), holes: cell.pieces.flatMap((p) => p.holes) };
}

// Two levels: the country is split between cities (area by the cities' total popularity, sites at the cities),
// then each city's part is split between its games, which may move freely inside it.
export function buildCountryMosaic(games: readonly MosaicGame[], country: CountryRegion, o: MosaicOptions): CountryMosaic {
  const key = games.map((g) => g.id).join(',');
  const out: CountryMosaic = { key, position: [], uv: [], cell: [], lines: [], cells: [] };
  if (games.length === 0) return out;
  const proj = country.projection;
  const weight = (g: MosaicGame) => Math.max(1, g.popularity) ** POPULARITY_EXPONENT;
  const cities = metroGroups(games, country);
  const homes = placeSites(cities.map((list) => list[0]!), country);
  const top = fitPowerDiagram(homes, cities.map((list) => list.reduce((a, g) => a + weight(g), 0)), country.region, {
    iterations: cities.length === 1 ? 0 : o.iterations,
    tether: o.tether,
  });
  const flat: number[] = [];

  const emitLines = (convex: Pt[], region: Region) => {
    for (let k = 0; k < convex.length; k++) {
      const p = convex[k]!;
      const q = convex[(k + 1) % convex.length]!;
      for (const [s, e] of segmentInside(p, q, region)) {
        const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
        const steps = Math.max(1, Math.ceil(len / MAX_EDGE));
        for (let t = 0; t < steps; t++) {
          const a = proj.inverse(s[0] + ((e[0] - s[0]) * t) / steps, s[1] + ((e[1] - s[1]) * t) / steps);
          const z = proj.inverse(s[0] + ((e[0] - s[0]) * (t + 1)) / steps, s[1] + ((e[1] - s[1]) * (t + 1)) / steps);
          toCartesian(a.lat, a.lng, MOSAIC_LINE_ALTITUDE, out.lines);
          toCartesian(z.lat, z.lng, MOSAIC_LINE_ALTITUDE, out.lines);
        }
      }
    }
  };

  const emitCell = (g: MosaicGame, c: ClippedCell) => {
    if (c.pieces.length === 0) return;
    const local = out.cells.length;
    const main = c.pieces.reduce((x, p) => (Math.abs(ringArea(p.outer)) > Math.abs(ringArea(x.outer)) ? p : x));
    const bx = bbox(main.outer);
    const w = bx[2] - bx[0];
    const h = bx[3] - bx[1];
    const cx = (bx[0] + bx[2]) / 2;
    const cy = (bx[1] + bx[3]) / 2;
    const W = w / h > COVER_ASPECT ? w : h * COVER_ASPECT;
    const H = W / COVER_ASPECT;
    const centre = proj.inverse(cx, cy);
    out.cells.push({ gameId: g.id, cover: g.cover, lat: centre.lat, lng: centre.lng, area: c.area });
    for (const piece of c.pieces) {
      const contour = piece.outer.map((p) => new THREE.Vector2(p[0], p[1]));
      const holes = piece.holes.map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
      const verts = [...contour, ...holes.flat()];
      const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      flat.length = 0;
      for (const f of faces) {
        const a = verts[f[0]!]!;
        const bb = verts[f[1]!]!;
        const cc = verts[f[2]!]!;
        splitTriangle([a.x, a.y, bb.x, bb.y, cc.x, cc.y], flat);
      }
      for (let k = 0; k < flat.length; k += 2) {
        const x = flat[k]!;
        const y = flat[k + 1]!;
        const ll = proj.inverse(x, y);
        toCartesian(ll.lat, ll.lng, MOSAIC_ALTITUDE, out.position);
        out.uv.push((x - cx) / W + 0.5, (y - cy) / H + 0.5);
        out.cell.push(local);
      }
    }
  };

  top.cells.forEach((cityCell, ci) => {
    const list = cities[ci]!;
    if (cityCell.pieces.length === 0) return;
    emitLines(cityCell.convex, country.region);
    if (list.length === 1) {
      emitCell(list[0]!, cityCell);
      return;
    }
    const region = regionOf(cityCell);
    const home = top.sites[ci]!;
    const spots = spreadPoints(region, list.length, list[0]!.id).sort(
      (p, q) => Math.hypot(p[0] - home[0], p[1] - home[1]) - Math.hypot(q[0] - home[0], q[1] - home[1]),
    );
    const inner = spots;
    const fit = fitPowerDiagram(inner, list.map(weight), region, { iterations: o.iterations, tether: 0 });
    fit.cells.forEach((c, k) => {
      emitCell(list[k]!, c);
      emitLines(c.convex, region);
    });
  });
  return out;
}

export class MosaicBuilder {
  private readonly cache = new Map<string, CountryMosaic>();

  constructor(
    private readonly regions: Map<string, CountryRegion>,
    private readonly options: MosaicOptions = DEFAULT_OPTIONS,
  ) {}

  // games must come in popularity order, most popular first
  build(games: readonly MosaicGame[]): MosaicMesh {
    const byCountry = new Map<string, MosaicGame[]>();
    for (const g of games) {
      if (!this.regions.has(g.country)) continue;
      let list = byCountry.get(g.country);
      if (!list) byCountry.set(g.country, (list = []));
      list.push(g);
    }
    const counts = new Map([...byCountry].map(([c, l]) => [c, l.length]));
    const areas = new Map([...this.regions].map(([c, r]) => [c, r.area]));
    const budget = cellBudget(counts, areas, this.options);
    const parts: CountryMosaic[] = [];
    const next = new Map<string, CountryMosaic>();
    for (const [code, list] of byCountry) {
      const chosen = list.slice(0, budget.get(code) ?? 1);
      const key = `${code}:${chosen.map((g) => g.id).join(',')}`;
      let m = this.cache.get(key);
      if (!m) m = buildCountryMosaic(chosen, this.regions.get(code)!, this.options);
      next.set(key, m);
      parts.push(m);
    }
    this.cache.clear();
    for (const [k, v] of next) this.cache.set(k, v);

    let nPos = 0;
    let nLines = 0;
    for (const p of parts) {
      nPos += p.position.length;
      nLines += p.lines.length;
    }
    const position = new Float32Array(nPos);
    const uv = new Float32Array((nPos / 3) * 2);
    const cell = new Float32Array(nPos / 3);
    const lines = new Float32Array(nLines);
    const cells: MosaicCell[] = [];
    let op = 0;
    let ou = 0;
    let oc = 0;
    let ol = 0;
    for (const p of parts) {
      position.set(p.position, op);
      uv.set(p.uv, ou);
      const base = cells.length;
      for (let i = 0; i < p.cell.length; i++) cell[oc + i] = base + p.cell[i]!;
      lines.set(p.lines, ol);
      cells.push(...p.cells);
      op += p.position.length;
      ou += p.uv.length;
      oc += p.cell.length;
      ol += p.lines.length;
    }
    return { position, uv, cell, lines, cells };
  }
}
