export type Pt = [number, number];
export type Ring = Pt[];

const DEG = Math.PI / 180;

// Lambert azimuthal equal-area around (lat0, lng0), in degrees of arc on the unit sphere.
export interface Projection {
  forward(lat: number, lng: number): Pt;
  inverse(x: number, y: number): { lat: number; lng: number };
}

export function azimuthalEqualArea(lat0: number, lng0: number): Projection {
  const p0 = lat0 * DEG;
  const l0 = lng0 * DEG;
  const sin0 = Math.sin(p0);
  const cos0 = Math.cos(p0);
  return {
    forward(lat, lng) {
      const p = lat * DEG;
      const dl = lng * DEG - l0;
      const cosc = sin0 * Math.sin(p) + cos0 * Math.cos(p) * Math.cos(dl);
      const k = Math.sqrt(2 / Math.max(1e-12, 1 + cosc)) / DEG;
      return [k * Math.cos(p) * Math.sin(dl), k * (cos0 * Math.sin(p) - sin0 * Math.cos(p) * Math.cos(dl))];
    },
    inverse(x, y) {
      const xr = x * DEG;
      const yr = y * DEG;
      const rho = Math.hypot(xr, yr);
      if (rho < 1e-12) return { lat: lat0, lng: lng0 };
      const c = 2 * Math.asin(Math.min(1, rho / 2));
      const sinc = Math.sin(c);
      const cosc = Math.cos(c);
      const lat = Math.asin(cosc * sin0 + (yr * sinc * cos0) / rho);
      const lng = l0 + Math.atan2(xr * sinc, rho * cos0 * cosc - yr * sin0 * sinc);
      let lngDeg = lng / DEG;
      if (lngDeg > 180) lngDeg -= 360;
      if (lngDeg < -180) lngDeg += 360;
      return { lat: lat / DEG, lng: lngDeg };
    },
  };
}

export function ringArea(ring: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  return a / 2;
}

export function ringCentroid(ring: readonly Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    a += f;
    cx += (ring[j]![0] + ring[i]![0]) * f;
    cy += (ring[j]![1] + ring[i]![1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / Math.max(1, ring.length), sy / Math.max(1, ring.length)];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// Keeps the part of a convex or concave polygon where a*x + b*y <= c.
export function clipHalfPlane(poly: readonly Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// Sutherland–Hodgman: clips any polygon by a convex counter-clockwise polygon.
export function clipByConvex(subject: readonly Pt[], convex: readonly Pt[]): Pt[] {
  let out: Pt[] = subject.slice();
  const n = convex.length;
  for (let i = 0; i < n && out.length > 0; i++) {
    const p = convex[i]!;
    const q = convex[(i + 1) % n]!;
    // inside is to the left of p->q: (q-p) x (x-p) >= 0  <=>  a*x + b*y <= c
    const a = q[1] - p[1];
    const b = -(q[0] - p[0]);
    const c = a * p[0] + b * p[1];
    out = clipHalfPlane(out, a, b, c);
  }
  return out;
}

export interface Site {
  x: number;
  y: number;
  weight: number;
  want?: number; // the area the site was fitted for; a warm start scales its weight to the new area
}

export function powerCell(sites: readonly Site[], i: number, bounds: readonly Pt[]): Pt[] {
  const s = sites[i]!;
  let cell: Pt[] = bounds.slice();
  for (let j = 0; j < sites.length && cell.length > 0; j++) {
    if (j === i) continue;
    const t = sites[j]!;
    const a = 2 * (t.x - s.x);
    const b = 2 * (t.y - s.y);
    const c = t.x * t.x + t.y * t.y - t.weight - (s.x * s.x + s.y * s.y - s.weight);
    cell = clipHalfPlane(cell, a, b, c);
  }
  return cell;
}

export interface Region {
  outers: Ring[]; // counter-clockwise
  holes: Ring[];
}

export function orient(ring: Ring, ccw: boolean): Ring {
  const isCcw = ringArea(ring) > 0;
  return isCcw === ccw ? ring : ring.slice().reverse();
}

export function regionArea(r: Region): number {
  let a = 0;
  for (const o of r.outers) a += Math.abs(ringArea(o));
  for (const h of r.holes) a -= Math.abs(ringArea(h));
  return Math.max(0, a);
}

export function bbox(points: Iterable<Pt>): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return [x0, y0, x1, y1];
}

export interface ClippedCell {
  convex: Pt[];
  pieces: { outer: Ring; holes: Ring[] }[];
  area: number;
}

export function clipCellToRegion(convex: Pt[], region: Region, regionBoxes: [number, number, number, number][]): ClippedCell {
  const pieces: ClippedCell['pieces'] = [];
  let area = 0;
  if (convex.length < 3) return { convex, pieces, area };
  const cb = bbox(convex);
  region.outers.forEach((outer, k) => {
    const b = regionBoxes[k]!;
    if (b[0] > cb[2] || b[2] < cb[0] || b[1] > cb[3] || b[3] < cb[1]) return;
    const piece = clipByConvex(outer, convex);
    if (piece.length < 3) return;
    const a = Math.abs(ringArea(piece));
    if (a <= 0) return;
    pieces.push({ outer: piece, holes: [] });
    area += a;
  });
  for (const hole of region.holes) {
    const h = clipByConvex(hole, convex);
    if (h.length < 3) continue;
    const a = Math.abs(ringArea(h));
    if (a <= 0) continue;
    const owner = pieces.find((p) => pointInRing(ringCentroid(h), p.outer));
    if (owner) {
      owner.holes.push(h);
      area -= a;
    }
  }
  return { convex, pieces, area: Math.max(0, area) };
}

export function pointInRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function pointInRegion(p: Pt, region: Region): boolean {
  if (!region.outers.some((o) => pointInRing(p, o))) return false;
  return !region.holes.some((h) => pointInRing(p, h));
}

// Parts of segment a-b that lie inside the region.
export function segmentInside(a: Pt, b: Pt, region: Region): [Pt, Pt][] {
  const ts = [0, 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const ring of [...region.outers, ...region.holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[j]!;
      const q = ring[i]!;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
      const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out: [Pt, Pt][] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k]!;
    const t1 = ts[k + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (!pointInRegion([a[0] + dx * tm, a[1] + dy * tm], region)) continue;
    const last = out[out.length - 1];
    const start: Pt = [a[0] + dx * t0, a[1] + dy * t0];
    const end: Pt = [a[0] + dx * t1, a[1] + dy * t1];
    if (last && last[1][0] === start[0] && last[1][1] === start[1]) last[1] = end;
    else out.push([start, end]);
  }
  return out;
}

export function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length <= 8 || tol <= 0) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const p = ring[a]!;
    const q = ring[b]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tol2;
    for (let i = a + 1; i < b; i++) {
      const r = ring[i]!;
      let d: number;
      if (len2 === 0) d = (r[0] - p[0]) ** 2 + (r[1] - p[1]) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / len2));
        d = (p[0] + t * dx - r[0]) ** 2 + (p[1] + t * dy - r[1]) ** 2;
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : ring;
}

export function simplifyRegion(region: Region, tol: number): Region {
  const ok = (r: Ring) => r.length >= 3 && Math.abs(ringArea(r)) > tol * tol;
  const outers = region.outers.map((r) => simplifyRing(r, tol)).filter(ok);
  const holes = region.holes.map((r) => simplifyRing(r, tol)).filter(ok);
  return { outers: outers.length ? outers : region.outers, holes };
}

const GRID = 48;

// Answers "is this convex cell entirely inside the region" without clipping, using a coarse grid.
export class RegionIndex {
  readonly boxes: [number, number, number, number][];
  private readonly box: [number, number, number, number];
  private readonly inside = new Uint8Array(GRID * GRID);
  private readonly sx: number;
  private readonly sy: number;

  constructor(readonly region: Region) {
    this.boxes = region.outers.map((o) => bbox(o));
    this.box = bbox(region.outers.flat());
    this.sx = (this.box[2] - this.box[0]) / GRID || 1;
    this.sy = (this.box[3] - this.box[1]) / GRID || 1;
    const edge = new Uint8Array(GRID * GRID);
    const step = Math.min(this.sx, this.sy) / 3;
    for (const ring of [...region.outers, ...region.holes]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[j]!;
        const q = ring[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
        for (let k = 0; k <= n; k++) {
          const gx = this.gx(p[0] + ((q[0] - p[0]) * k) / n);
          const gy = this.gy(p[1] + ((q[1] - p[1]) * k) / n);
          for (let ox = -1; ox <= 1; ox++)
            for (let oy = -1; oy <= 1; oy++) {
              const x = gx + ox;
              const y = gy + oy;
              if (x >= 0 && y >= 0 && x < GRID && y < GRID) edge[y * GRID + x] = 1;
            }
        }
      }
    }
    // Scanlines through the cell centres: even-odd crossings over all rings give the inside spans.
    const rings = [...region.outers, ...region.holes];
    const xs: number[] = [];
    for (let y = 0; y < GRID; y++) {
      const cy = this.box[1] + (y + 0.5) * this.sy;
      xs.length = 0;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i]!;
          const b = ring[j]!;
          if (a[1] > cy !== b[1] > cy) xs.push(((b[0] - a[0]) * (cy - a[1])) / (b[1] - a[1]) + a[0]);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil((xs[k]! - this.box[0]) / this.sx - 0.5));
        const x1 = Math.min(GRID - 1, Math.floor((xs[k + 1]! - this.box[0]) / this.sx - 0.5));
        for (let x = x0; x <= x1; x++) if (!edge[y * GRID + x]) this.inside[y * GRID + x] = 1;
      }
    }
  }

  private gx(x: number): number {
    return Math.floor((x - this.box[0]) / this.sx);
  }

  private gy(y: number): number {
    return Math.floor((y - this.box[1]) / this.sy);
  }

  containsBox(b: [number, number, number, number]): boolean {
    const x0 = this.gx(b[0]);
    const y0 = this.gy(b[1]);
    const x1 = this.gx(b[2]);
    const y1 = this.gy(b[3]);
    if (x0 < 0 || y0 < 0 || x1 >= GRID || y1 >= GRID) return false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!this.inside[y * GRID + x]) return false;
    return true;
  }

  clip(convex: Pt[]): ClippedCell {
    if (convex.length >= 3 && this.containsBox(bbox(convex))) {
      return { convex, pieces: [{ outer: convex, holes: [] }], area: Math.abs(ringArea(convex)) };
    }
    return clipCellToRegion(convex, this.region, this.boxes);
  }
}

class SiteGrid {
  private readonly cellSize: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly cols: number;
  private readonly rows: number;
  private buckets: number[][] = [];

  constructor(box: [number, number, number, number], n: number) {
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    this.cellSize = Math.max(1e-6, Math.sqrt((w * h) / Math.max(1, n)) * 1.5);
    this.x0 = box[0];
    this.y0 = box[1];
    this.cols = Math.max(1, Math.ceil(w / this.cellSize));
    this.rows = Math.max(1, Math.ceil(h / this.cellSize));
  }

  private cx(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cellSize)));
  }

  private cy(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cellSize)));
  }

  fill(sites: readonly Site[]): void {
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    sites.forEach((s, i) => this.buckets[this.cy(s.y) * this.cols + this.cx(s.x)]!.push(i));
  }

  // Visits sites ring by ring around (x, y); stop() gets a lower bound on the distance of everything not yet visited.
  visit(x: number, y: number, fn: (j: number) => void, stop: (minDist: number) => boolean): void {
    const gx = this.cx(x);
    const gy = this.cy(y);
    const maxRing = Math.max(this.cols, this.rows);
    for (let r = 0; r <= maxRing; r++) {
      if (r > 0 && stop((r - 1) * this.cellSize)) return;
      for (let yy = gy - r; yy <= gy + r; yy++) {
        if (yy < 0 || yy >= this.rows) continue;
        const edgeRow = yy === gy - r || yy === gy + r;
        for (let xx = gx - r; xx <= gx + r; xx += edgeRow ? 1 : 2 * r || 1) {
          if (xx < 0 || xx >= this.cols) continue;
          for (const j of this.buckets[yy * this.cols + xx]!) fn(j);
        }
      }
    }
  }
}

function maxDist(cell: readonly Pt[], x: number, y: number): number {
  let m = 0;
  for (const p of cell) m = Math.max(m, (p[0] - x) ** 2 + (p[1] - y) ** 2);
  return Math.sqrt(m);
}

function powerCellGrid(sites: readonly Site[], i: number, bounds: readonly Pt[], grid: SiteGrid, wMax: number): Pt[] {
  const s = sites[i]!;
  let cell: Pt[] = bounds.slice();
  let reach = maxDist(cell, s.x, s.y);
  grid.visit(
    s.x,
    s.y,
    (j) => {
      if (j === i || cell.length === 0) return;
      const t = sites[j]!;
      const a = 2 * (t.x - s.x);
      const b = 2 * (t.y - s.y);
      if (a === 0 && b === 0) return;
      const c = t.x * t.x + t.y * t.y - t.weight - (s.x * s.x + s.y * s.y - s.weight);
      cell = clipHalfPlane(cell, a, b, c);
      reach = maxDist(cell, s.x, s.y);
    },
    (d) => cell.length === 0 || (d > 0 && (d * d + s.weight - wMax) / (2 * d) > reach),
  );
  return cell;
}

function cellCentroid(c: ClippedCell): Pt | null {
  let a = 0;
  let x = 0;
  let y = 0;
  for (const p of c.pieces) {
    const pa = Math.abs(ringArea(p.outer));
    const pc = ringCentroid(p.outer);
    a += pa;
    x += pc[0] * pa;
    y += pc[1] * pa;
  }
  return a > 0 ? [x / a, y / a] : null;
}

export interface FitResult {
  cells: ClippedCell[];
  sites: Pt[];
  fitted: Site[];
  index: RegionIndex; // of the full outline
  error: number; // share of the area given to the wrong cells
}

export interface FitOptions {
  iterations: number;
  tether: number; // 0 = sites move freely to their cell centre, 1 = sites stay at home
  start: readonly (Site | null | undefined)[]; // where a site ended in an earlier fit, to start from there
}

// Voronoi treemap: a power diagram whose sites start at their home points, drift towards their cell centres
// while a tether pulls them back home, and whose weights are tuned until each cell's area approaches its target.
// The fit runs on a simplified outline; the returned cells are clipped by the full one.
export function fitPowerDiagram(
  points: readonly Pt[],
  targets: readonly number[],
  region: Region,
  options: Partial<FitOptions> = {},
): FitResult {
  const { iterations = 40, tether = 0.25, start } = options;
  const n = points.length;
  const rb = bbox(region.outers.flat());
  const span = Math.max(rb[2] - rb[0], rb[3] - rb[1]);
  const pad = span + 1;
  const bounds: Pt[] = [
    [rb[0] - pad, rb[1] - pad],
    [rb[2] + pad, rb[1] - pad],
    [rb[2] + pad, rb[3] + pad],
    [rb[0] - pad, rb[3] + pad],
  ];
  const full = new RegionIndex(region);
  const coarse = n > 1 && iterations > 0 ? new RegionIndex(simplifyRegion(region, span * 0.002)) : full;
  const total = regionArea(coarse.region);
  const sumT = targets.reduce((a, b) => a + b, 0) || 1;
  const want = targets.map((t) => (t / sumT) * total);
  const sites: Site[] = points.map((p, i) => {
    const s = start?.[i];
    if (!s) return { x: p[0], y: p[1], weight: (want[i]! / Math.PI) * 0.25 };
    return { x: s.x, y: s.y, weight: s.want ? s.weight * (want[i]! / s.want) : s.weight };
  });
  const siteBox: [number, number, number, number] = [rb[0] - span, rb[1] - span, rb[2] + span, rb[3] + span];
  const grid = new SiteGrid(siteBox, n);
  const cellsOf = (index: RegionIndex) => {
    grid.fill(sites);
    let wMax = -Infinity;
    for (const s of sites) wMax = Math.max(wMax, s.weight);
    return sites.map((_, i) => index.clip(powerCellGrid(sites, i, bounds, grid, wMax)));
  };

  // A site whose neighbour's weight exceeds its own by more than their squared distance falls outside its own cell.
  const keepSitesInOwnCells = () => {
    grid.fill(sites);
    const order = sites.map((_, i) => i).sort((a, b) => sites[a]!.weight - sites[b]!.weight);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const i of order) {
        const si = sites[i]!;
        grid.visit(
          si.x,
          si.y,
          (j) => {
            if (j === i) return;
            const sj = sites[j]!;
            const limit = ((si.x - sj.x) ** 2 + (si.y - sj.y) ** 2) * 0.9;
            if (si.weight - sj.weight > limit) {
              si.weight = sj.weight + limit;
              changed = true;
            }
          },
          (d) => d * d * 0.9 > si.weight,
        );
      }
      if (!changed) break;
    }
  };
  keepSitesInOwnCells();

  let best: { sites: Site[]; error: number } | null = iterations === 0 ? { sites: sites.map((s) => ({ ...s })), error: 0 } : null;
  for (let it = 0; it <= iterations && iterations > 0; it++) {
    const cells = cellsOf(coarse);
    let error = 0;
    for (let i = 0; i < n; i++) error += Math.abs(cells[i]!.area - want[i]!);
    error /= 2 * total;
    if (!best || error < best.error) best = { sites: sites.map((s) => ({ ...s })), error };
    if (it === iterations || error < 0.02) break;
    for (let i = 0; i < n; i++) {
      const s = sites[i]!;
      const c = cellCentroid(cells[i]!);
      if (c) {
        const next: Pt = [c[0] * (1 - tether) + points[i]![0] * tether, c[1] * (1 - tether) + points[i]![1] * tether];
        if (pointInRegion(next, coarse.region)) {
          s.x = next[0];
          s.y = next[1];
        } else if (pointInRegion(c, coarse.region)) {
          s.x = c[0];
          s.y = c[1];
        }
      }
      const a = cells[i]!.area;
      const ratio = a > 0 ? want[i]! / a : 2;
      const r = Math.sqrt(Math.max(1e-12, s.weight));
      s.weight = (r * Math.min(1.5, Math.max(0.6, Math.sqrt(ratio)))) ** 2;
    }
    keepSitesInOwnCells();
  }
  best!.sites.forEach((s, i) => Object.assign(sites[i]!, s));
  return { cells: cellsOf(full), sites: sites.map((s) => [s.x, s.y] as Pt), fitted: sites.map((s, i) => ({ x: s.x, y: s.y, weight: s.weight, want: want[i]! })), index: full, error: best!.error };
}
