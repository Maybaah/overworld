import * as THREE from 'three';
import type { CountryShape } from './countries';

export const GLOBE_RADIUS = 100;
export const OUTLINE_ALTITUDE = 0.0042;
const MAX_STEP_DEG = 2.5;

export function toCartesian(lat: number, lng: number, altitude: number, out: number[]): void {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const r = GLOBE_RADIUS * (1 + altitude);
  out.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function ringSegments(ring: number[][], out: number[]): void {
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const dLng = b[0]! - a[0]!;
    if (Math.abs(dLng) > 180) continue;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(b[1]! - a[1]!)) / MAX_STEP_DEG));
    let prevLat = a[1]!;
    let prevLng = a[0]!;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const lat = a[1]! + (b[1]! - a[1]!) * t;
      const lng = a[0]! + dLng * t;
      toCartesian(prevLat, prevLng, OUTLINE_ALTITUDE, out);
      toCartesian(lat, lng, OUTLINE_ALTITUDE, out);
      prevLat = lat;
      prevLng = lng;
    }
  }
}

export function buildOutline(shapes: readonly CountryShape[]): Float32Array {
  const out: number[] = [];
  for (const shape of shapes) {
    const g = shape.geometry;
    const coords = g.coordinates as unknown as number[][][] | number[][][][];
    if (g.type === 'Polygon') for (const ring of coords as number[][][]) ringSegments(ring, out);
    else if (g.type === 'MultiPolygon') {
      for (const poly of coords as number[][][][]) for (const ring of poly) ringSegments(ring, out);
    }
  }
  return Float32Array.from(out);
}

export class OutlineLayer {
  private readonly material: THREE.LineBasicMaterial;
  private readonly lines: THREE.LineSegments;
  private geometry = new THREE.BufferGeometry();

  constructor(
    private readonly scene: THREE.Object3D,
    color: string,
  ) {
    this.material = new THREE.LineBasicMaterial({ color });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
    scene.add(this.lines);
  }

  set(shapes: readonly CountryShape[]): void {
    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(buildOutline(shapes), 3));
    this.lines.geometry = this.geometry;
  }

  dispose(): void {
    this.scene.remove(this.lines);
    this.geometry.dispose();
    this.material.dispose();
  }
}
