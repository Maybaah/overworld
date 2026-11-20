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
  RegionIndex,
  regionArea,
  ringArea,
  segmentInside,
  type ClippedCell,
  type Projection,
  type Pt,
  type Region,
  type Ring,
  type Site,
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
  exact: boolean;
}

export interface MosaicOptions {
  maxCells: number;
  minCellArea: number;
  iterations: number;
  detailIterations: number;
  tether: number;
}

export const DEFAULT_OPTIONS: MosaicOptions = { maxCells: 1500, minCellArea: 0.05, iterations: 40, detailIterations: 6, tether: 0.35 };
const MAX_DETAIL_CELLS = 8000;

export interface MosaicCell {
  gameId: number;
  cover: string | null;
  lat: number;
  lng: number;
  area: number;
  imageH: number;
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
  radius: number;
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
  const byCode = new Map<string, number[][][][]>();
  for (const s of shapes) {
    const code = alpha2OfNumeric(s.id);
    if (!code) continue;
    const list = byCode.get(code);
    if (list) list.push(...rings(s));
    else byCode.set(code, rings(s));
  }
  const out = new Map<string, CountryRegion>();
  for (const [code, polys] of byCode) {
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
    const b = bbox(region.outers.flat());
    const radius = Math.max(Math.hypot(b[0], b[1]), Math.hypot(b[2], b[1]), Math.hypot(b[0], b[3]), Math.hypot(b[2], b[3]));
    out.set(code, { code, projection, region, area: regionArea(region), center, radius });
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

export function cellBudget(counts: ReadonlyMap<string, number>, areas: ReadonlyMap<string, number>, o: MosaicOptions): Map<string, number> {
  const out = new Map<string, number>();
  const cap = new Map<string, number>();
  const weight = new Map<string, number>();
  for (const [code, n] of counts) {
    const area = areas.get(code) ?? 0;
    cap.set(code, Math.max(1, Math.min(n, Math.floor(area / o.minCellArea))));
    weight.set(code, Math.sqrt(n * Math.max(area, o.minCellArea)));
    out.set(code, 1);
  }
  let left = o.maxCells - out.size;
  let open = [...counts.keys()].filter((c) => cap.get(c)! > 1);
  while (left > 0 && open.length > 0) {
    const sum = open.reduce((a, c) => a + weight.get(c)!, 0);
    let used = 0;
    const next: string[] = [];
    for (const c of open) {
      const k = Math.min(Math.max(1, Math.floor((left * weight.get(c)!) / sum)), cap.get(c)! - out.get(c)!, left - used);
      out.set(c, out.get(c)! + k);
      used += k;
      if (out.get(c)! < cap.get(c)!) next.push(c);
    }
    if (used === 0) break;
    left -= used;
    open = next;
  }
  return out;
}

export interface MosaicFocus {
  lat: number;
  lng: number;
  radius: number;
  zoom: number;
}

function arcDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

export function focusBudget(
  budget: Map<string, number>,
  counts: ReadonlyMap<string, number>,
  regions: ReadonlyMap<string, CountryRegion>,
  focus: MosaicFocus | null,
): Map<string, number> {
  if (!focus || focus.zoom <= 1) return budget;
  const near = [...budget.keys()].filter((c) => {
    const r = regions.get(c);
    return r && arcDegrees(r.center, focus) < focus.radius + r.radius;
  });
  let zoom = focus.zoom;
  for (let k = 0; k < 20; k++) {
    let total = 0;
    for (const [c, n] of budget) total += near.includes(c) ? Math.min(counts.get(c)!, Math.ceil(n * zoom)) : n;
    if (total <= Math.max(MAX_DETAIL_CELLS, [...budget.values()].reduce((a, b) => a + b, 0)) || zoom <= 1) break;
    zoom = Math.max(1, zoom * 0.8);
  }
  const out = new Map(budget);
  for (const c of near) out.set(c, Math.min(counts.get(c)!, Math.ceil(budget.get(c)! * zoom)));
  return out;
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

export interface CellPiece {
  gameId: number;
  outer: Ring;
  holes: Ring[];
  box: [number, number, number, number];
}

export interface CountryMosaic {
  key: string;
  sites: string[];
  pieces: CellPiece[];
  position: number[];
  uv: number[];
  cell: number[];
  lines: number[];
  cells: MosaicCell[];
}

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

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function partOf(country: CountryRegion, outer: Ring): Region {
  const b = bbox(outer);
  return { outers: [outer], holes: country.region.holes.filter((h) => { const hb = bbox(h); return hb[0] < b[2] && hb[2] > b[0] && hb[1] < b[3] && hb[3] > b[1]; }) };
}

const cores = new WeakMap<CountryRegion, Pt>();
export function countryCore(country: CountryRegion): Pt {
  const known = cores.get(country);
  if (known) return known;
  const main = country.region.outers.reduce((x, r) => (Math.abs(ringArea(r)) > Math.abs(ringArea(x)) ? r : x));
  const part = partOf(country, main);
  const rings = [main, ...part.holes];
  let best: Pt = interiorPoint(1, part);
  let bestD = -1;
  for (const p of spreadPoints(part, 300, 1)) {
    let d = Infinity;
    for (const ring of rings) {
      for (let k = 0; k < ring.length && d > bestD; k++) d = Math.min(d, segmentDistance(p, ring[k]!, ring[(k + 1) % ring.length]!));
      if (d <= bestD) break;
    }
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  cores.set(country, best);
  return best;
}

interface Spot {
  p: Pt;
  a: number;
}

const pools = new WeakMap<CountryRegion, Spot[]>();
function spotPool(country: CountryRegion, want: number): Spot[] {
  const cached = pools.get(country);
  if (cached && cached.length >= want * 0.9) return cached;
  const size = Math.max(256, 2 ** Math.ceil(Math.log2(want)));
  const core = countryCore(country);
  const found: { p: Pt; d: number }[] = [];
  country.region.outers.forEach((outer, i) => {
    const k = Math.round((size * Math.abs(ringArea(outer))) / country.area);
    if (k > 0) for (const p of spreadPoints(partOf(country, outer), k, 7 + i)) found.push({ p, d: Math.hypot(p[0] - core[0], p[1] - core[1]) });
  });
  const pool = found.sort((x, y) => x.d - y.d).map(({ p }) => ({ p, a: Math.atan2(p[1] - core[1], p[0] - core[0]) }));
  pools.set(country, pool);
  return pool;
}

export function spiralSpots(country: CountryRegion, weights: readonly number[]): Pt[] {
  const core = countryCore(country);
  if (weights.length <= 1) return weights.map(() => core);
  const pool = spotPool(country, weights.length * 6);
  const used = new Uint8Array(pool.length);
  const total = weights.reduce((a, b) => a + b, 0);
  let before = weights[0]!;
  const out: Pt[] = [core];
  for (let i = 1; i < weights.length; i++) {
    const w = weights[i]!;
    const target = Math.min(pool.length - 1, Math.floor(((before + w / 2) / total) * pool.length));
    before += w;
    const reach = Math.ceil(2 * Math.sqrt(target) + 6);
    const angle = (i * GOLDEN) % (Math.PI * 2);
    let pick = -1;
    let score = Infinity;
    for (let k = Math.max(0, target - reach); k <= Math.min(pool.length - 1, target + reach); k++) {
      if (used[k]) continue;
      let da = Math.abs(pool[k]!.a + Math.PI - angle);
      da = Math.min(da, Math.PI * 2 - da);
      const s = da + Math.abs(k - target) / reach;
      if (s < score) {
        score = s;
        pick = k;
      }
    }
    if (pick < 0) for (let r = 0; pick < 0 && r < pool.length; r++) pick = [target - r, target + r].find((k) => k >= 0 && k < pool.length && !used[k]) ?? -1;
    if (pick < 0) {
      out.push(interiorPoint(i, country.region));
      continue;
    }
    used[pick] = 1;
    out.push(pool[pick]!.p);
  }
  return out;
}

const landIndexes = new WeakMap<CountryRegion, RegionIndex>();
function landIndex(country: CountryRegion): RegionIndex {
  let index = landIndexes.get(country);
  if (!index) landIndexes.set(country, (index = new RegionIndex(country.region)));
  return index;
}

export function buildCountryMosaic(
  games: readonly MosaicGame[],
  country: CountryRegion,
  o: MosaicOptions,
  memory: Map<string, Site> = new Map(),
  spots?: () => ReadonlyMap<number, Pt>,
): CountryMosaic {
  const key = games.map((g) => g.id).join(',');
  const out: CountryMosaic = { key, sites: [], pieces: [], position: [], uv: [], cell: [], lines: [], cells: [] };
  if (games.length === 0) return out;
  const proj = country.projection;
  const land = landIndex(country);
  const onLand = (p: Pt) => land.containsBox([p[0], p[1], p[0], p[1]]) || pointInRegion(p, country.region);
  const list = [...games].sort((a, b) => b.popularity - a.popularity || a.id - b.id);
  const weights = list.map((g) => Math.max(1, g.popularity) ** POPULARITY_EXPONENT);
  const start = list.map((g) => memory.get(`g${g.id}`));
  const iterations = list.length === 1 ? 0 : o.iterations;
  const needHomes = iterations > 0 || start.some((st) => !st);
  const known = needHomes && spots ? spots() : null;
  const home: Pt[] = !needHomes ? start.map((st) => [st!.x, st!.y]) : known ? list.map((g) => known.get(g.id) ?? countryCore(country)) : spiralSpots(country, weights);
  const fit = fitPowerDiagram(home, weights, country.region, { iterations, tether: o.tether, start });
  list.forEach((g, k) => {
    memory.set(`g${g.id}`, fit.fitted[k]!);
    out.sites.push(`g${g.id}`);
  });
  const flat: number[] = [];

  const emitLines = (convex: Pt[], region: Region, index: RegionIndex) => {
    for (let k = 0; k < convex.length; k++) {
      const p = convex[k]!;
      const q = convex[(k + 1) % convex.length]!;
      const box: [number, number, number, number] = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
      const parts: [Pt, Pt][] = index.containsBox(box) ? [[p, q]] : segmentInside(p, q, region);
      for (const [s, e] of parts) {
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
    out.cells.push({ gameId: g.id, cover: g.cover, lat: centre.lat, lng: centre.lng, area: c.area, imageH: H });
    for (const piece of c.pieces) {
      out.pieces.push({ gameId: g.id, outer: piece.outer, holes: piece.holes, box: bbox(piece.outer) });
      const contour = piece.outer.map((p) => new THREE.Vector2(p[0], p[1]));
      const holes = piece.holes.map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
      const verts = [...contour, ...holes.flat()];
      const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
      flat.length = 0;
      for (const f of faces) {
        const a = verts[f[0]!]!;
        const bb = verts[f[1]!]!;
        const cc = verts[f[2]!]!;
        // Clipping a cell by a ragged coast leaves zero-width bridges along the cell's edge between bits of land;
        // their triangles lie over the sea and showed as thin streaks of cover across the water.
        if (!onLand([(a.x + bb.x + cc.x) / 3, (a.y + bb.y + cc.y) / 3])) continue;
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

  fit.cells.forEach((c, k) => {
    emitCell(list[k]!, c);
    emitLines(c.convex, country.region, fit.index);
  });
  return out;
}

export interface BuildResult {
  mesh: MosaicMesh;
  countries: Map<string, CountryMosaic>;
}

export type Layout = Map<string, [number, number, number, number]>;

const CACHE_LIMIT = 600;
const SPOT_CACHE_LIMIT = 400;

export class MosaicBuilder {
  private readonly cache = new Map<string, CountryMosaic>();
  private readonly memory = new Map<string, Site>();
  private readonly spots = new Map<string, Map<number, Pt>>();

  constructor(
    private readonly regions: Map<string, CountryRegion>,
    private readonly options: MosaicOptions = DEFAULT_OPTIONS,
  ) {}

  private spotsOf(code: string, list: readonly MosaicGame[]): Map<number, Pt> {
    const key = `${code}:${list.length}:${list[0]!.id}:${list[list.length - 1]!.id}`;
    let spots = this.spots.get(key);
    if (spots) return spots;
    const weights = list.map((g) => Math.max(1, g.popularity) ** POPULARITY_EXPONENT);
    const points = spiralSpots(this.regions.get(code)!, weights);
    spots = new Map(list.map((g, i) => [g.id, points[i]!]));
    this.spots.set(key, spots);
    while (this.spots.size > SPOT_CACHE_LIMIT) this.spots.delete(this.spots.keys().next().value!);
    return spots;
  }

  useLayout(layout: Layout): void {
    for (const [k, [x, y, weight, want]] of layout) this.memory.set(k, { x, y, weight, want });
  }

  layoutOf(countries: Map<string, CountryMosaic>): Layout {
    const out: Layout = new Map();
    for (const m of countries.values()) {
      for (const k of m.sites) {
        const s = this.memory.get(k);
        if (s) out.set(k, [s.x, s.y, s.weight, s.want ?? 0]);
      }
    }
    return out;
  }

  build(games: readonly MosaicGame[], focus: MosaicFocus | null = null, fitted = false, pinned: number | null = null): BuildResult {
    const byCountry = new Map<string, MosaicGame[]>();
    for (const g of games) {
      if (!this.regions.has(g.country)) continue;
      let list = byCountry.get(g.country);
      if (!list) byCountry.set(g.country, (list = []));
      list.push(g);
    }
    const counts = new Map([...byCountry].map(([c, l]) => [c, l.length]));
    const areas = new Map([...this.regions].map(([c, r]) => [c, r.area]));
    const base = cellBudget(counts, areas, this.options);
    const budget = focusBudget(base, counts, this.regions, focus);
    const parts: CountryMosaic[] = [];
    const countries = new Map<string, CountryMosaic>();
    for (const [code, list] of byCountry) {
      const n = budget.get(code) ?? 1;
      const chosen = list.sort((a, b) => b.popularity - a.popularity || a.id - b.id).slice(0, n);
      const pin = pinned === null ? -1 : list.findIndex((g) => g.id === pinned);
      const forced = pin >= n;
      if (forced) chosen.push(list[pin]!);
      const key = `${code}:${chosen.map((g) => g.id).join(',')}`;
      let m = this.cache.get(key);
      if (m) this.cache.delete(key);
      else {
        const extra = n > (base.get(code) ?? 1);
        const iterations = extra || forced ? this.options.detailIterations : fitted ? 0 : this.options.iterations;
        m = buildCountryMosaic(chosen, this.regions.get(code)!, { ...this.options, iterations }, this.memory, () => this.spotsOf(code, list));
      }
      this.cache.set(key, m);
      countries.set(code, m);
      parts.push(m);
    }
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);

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
    return { mesh: { position, uv, cell, lines, cells }, countries };
  }
}
