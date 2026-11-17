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
  type RegionIndex,
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
  exact: boolean; // city-level location
}

export interface MosaicOptions {
  maxCells: number;
  minCellArea: number; // square degrees of arc
  iterations: number;
  detailIterations: number; // for countries given extra cells when zoomed in; their old sites start in place
  topIterations?: number; // for splitting the country between metro areas; defaults to iterations
  tether: number;
}

export const DEFAULT_OPTIONS: MosaicOptions = { maxCells: 3000, minCellArea: 0.05, iterations: 40, detailIterations: 5, tether: 0.15 };
const MAX_DETAIL_CELLS = 16000;

export interface MosaicCell {
  gameId: number;
  cover: string | null;
  lat: number;
  lng: number;
  area: number;
  imageH: number; // height of the cover as laid over the cell, degrees of arc
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
  radius: number; // degrees of arc from the centre to the farthest corner of the projected box
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

// Some codes have several shapes (Australia and the Ashmore and Cartier Islands are both 036), so they are merged.
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

// Cells are shared by the geometric mean of a country's game count and its area, so dense small countries
// (Japan, Korea) and big sparse ones (Canada, Russia) both get a fair number; every country gets at least one.
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
  radius: number; // degrees of arc in view around the point
  zoom: number; // how many times more cells per area than the whole-globe view
}

function arcDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lng - b.lng) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

// Countries in view get more cells, up to all their games, so zooming in shows every game.
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
  sites: string[]; // memory keys of the sites this mosaic used
  pieces: CellPiece[];
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
  // A town with one or two games next to a big metro joins it; alone it would hold a cell far bigger than its share.
  const order = new Map(games.map((g, i) => [g.id, i]));
  const big = groups.filter((x) => x.anchor !== null && x.list.length > SMALL_TOWN);
  const kept = groups.filter((x) => {
    if (x.anchor === null || x.list.length > SMALL_TOWN) return true;
    let best: (typeof groups)[number] | null = null;
    let bestD = reach * SMALL_TOWN_REACH;
    for (const y of big) {
      const d = Math.hypot(y.anchor![0] - x.anchor[0], y.anchor![1] - x.anchor[1]);
      if (d <= bestD) {
        best = y;
        bestD = d;
      }
    }
    if (!best) return true;
    best.list.push(...x.list);
    return false;
  });
  for (const x of kept) x.list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return kept.map((x) => x.list);
}

const SMALL_TOWN = 2;
const SMALL_TOWN_REACH = 4;

function regionOf(cell: ClippedCell): Region {
  return { outers: cell.pieces.map((p) => p.outer), holes: cell.pieces.flatMap((p) => p.holes) };
}

// Two levels: the country is split between cities (area by the cities' total popularity, sites at the cities),
// then each city's part is split between its games, which may move freely inside it.
// memory keeps where every site ended last time, so the next build (another year, more games when zoomed in)
// starts from there: cells stay where they were and the fit needs few iterations.
export function buildCountryMosaic(
  games: readonly MosaicGame[],
  country: CountryRegion,
  o: MosaicOptions,
  memory: Map<string, Site> = new Map(),
): CountryMosaic {
  const key = games.map((g) => g.id).join(',');
  const out: CountryMosaic = { key, sites: [], pieces: [], position: [], uv: [], cell: [], lines: [], cells: [] };
  if (games.length === 0) return out;
  const proj = country.projection;
  const weight = (g: MosaicGame) => Math.max(1, g.popularity) ** POPULARITY_EXPONENT;
  const cities = metroGroups(games, country);
  const homes = placeSites(cities.map((list) => list[0]!), country);
  const metroKey = (list: MosaicGame[]) => `m${country.code}:${list[0]!.id}`;
  const top = fitPowerDiagram(homes, cities.map((list) => list.reduce((a, g) => a + weight(g), 0)), country.region, {
    iterations: cities.length === 1 ? 0 : (o.topIterations ?? o.iterations),
    tether: o.tether,
    start: cities.map((list) => memory.get(metroKey(list))),
  });
  cities.forEach((list, i) => {
    memory.set(metroKey(list), top.fitted[i]!);
    out.sites.push(metroKey(list));
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
    emitLines(cityCell.convex, country.region, top.index);
    if (list.length === 1) {
      emitCell(list[0]!, cityCell);
      return;
    }
    const region = regionOf(cityCell);
    const home = top.sites[ci]!;
    const spots = spreadPoints(region, list.length, list[0]!.id).sort(
      (p, q) => Math.hypot(p[0] - home[0], p[1] - home[1]) - Math.hypot(q[0] - home[0], q[1] - home[1]),
    );
    const fit = fitPowerDiagram(spots, list.map(weight), region, {
      iterations: o.iterations,
      tether: 0,
      start: list.map((g) => memory.get(`g${g.id}`)),
    });
    list.forEach((g, k) => {
      memory.set(`g${g.id}`, fit.fitted[k]!);
      out.sites.push(`g${g.id}`);
    });
    fit.cells.forEach((c, k) => {
      emitCell(list[k]!, c);
      emitLines(c.convex, region, fit.index);
    });
  });
  return out;
}

export interface BuildResult {
  mesh: MosaicMesh;
  countries: Map<string, CountryMosaic>;
}

// A layout is where every site of one year's mosaic sits: memory key -> [x, y, weight, area it was fitted for].
export type Layout = Map<string, [number, number, number, number]>;

const CACHE_LIMIT = 600;

export class MosaicBuilder {
  private readonly cache = new Map<string, CountryMosaic>();
  private readonly memory = new Map<string, Site>();

  constructor(
    private readonly regions: Map<string, CountryRegion>,
    private readonly options: MosaicOptions = DEFAULT_OPTIONS,
  ) {}

  // Puts the sites of a precomputed layout into memory; countries then build without fitting.
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

  // games must come in popularity order, most popular first. With fitted = true, countries outside the focus
  // take their sites from memory as they are (a loaded layout) instead of fitting them again.
  build(games: readonly MosaicGame[], focus: MosaicFocus | null = null, fitted = false): BuildResult {
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
      const chosen = list.slice(0, n);
      const key = `${code}:${chosen.map((g) => g.id).join(',')}`;
      let m = this.cache.get(key);
      if (m) this.cache.delete(key);
      else {
        const extra = n > (base.get(code) ?? 1);
        const iterations = extra ? this.options.detailIterations : fitted ? 0 : this.options.iterations;
        const topIterations = extra ? this.options.iterations : iterations;
        m = buildCountryMosaic(chosen, this.regions.get(code)!, { ...this.options, iterations, topIterations }, this.memory);
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
