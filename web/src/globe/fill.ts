import * as THREE from 'three';
import type { CountryShape } from './countries';
import { toCartesian } from './outline';

export const CAP_ALTITUDE = 0.004;
const MAX_EDGE_DEG = 3;

type Tri = [number, number, number, number, number, number];

function edgeLen(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
}

function splitTriangle(t: Tri, maxDeg: number, out: number[]): void {
  const stack: Tri[] = [t];
  while (stack.length) {
    const [ax, ay, bx, by, cx, cy] = stack.pop()!;
    const ab = edgeLen(ax, ay, bx, by);
    const bc = edgeLen(bx, by, cx, cy);
    const ca = edgeLen(cx, cy, ax, ay);
    const longest = Math.max(ab, bc, ca);
    if (longest <= maxDeg) {
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

function polygonTriangles(rings: number[][][], maxDeg: number, out: number[]): void {
  const outer = rings[0];
  if (!outer || outer.length < 4) return;
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const verts = [...contour, ...holes.flat()];
  for (const f of faces) {
    const a = verts[f[0]!]!;
    const b = verts[f[1]!]!;
    const c = verts[f[2]!]!;
    splitTriangle([a.x, a.y, b.x, b.y, c.x, c.y], maxDeg, out);
  }
}

export function triangulatePlanar(shape: CountryShape, maxDeg = MAX_EDGE_DEG): number[] {
  const out: number[] = [];
  const g = shape.geometry;
  const coords = g.coordinates as unknown as number[][][] | number[][][][];
  if (g.type === 'Polygon') polygonTriangles(coords as number[][][], maxDeg, out);
  else if (g.type === 'MultiPolygon') for (const poly of coords as number[][][][]) polygonTriangles(poly, maxDeg, out);
  return out;
}

export function triangulateShape(shape: CountryShape): Float32Array {
  const planar = triangulatePlanar(shape);
  const out: number[] = [];
  for (let i = 0; i < planar.length; i += 2) toCartesian(planar[i + 1]!, planar[i]!, CAP_ALTITUDE, out);
  return Float32Array.from(out);
}
