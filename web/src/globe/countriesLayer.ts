import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { alpha2OfNumeric, shadeBucket, shadeColor, SHADE_BUCKETS, type CountryShape } from './countries';
import { triangulateShape } from './fill';
import { buildOutline } from './outline';

const TINT_BASE = '#3b6f8a';
const IMAGERY_STROKE = '#e3e9f0';
const IMAGERY_STROKE_OPACITY = 0.42;
const BORDER_WIDTH = 2;
const HALO_WIDTH = 5;
const HALO_COLOR = '#050507';
const HALO_OPACITY = 0.75;

export function tintAlpha(bucket: number): number {
  if (bucket <= 0) return 0;
  return 0.22 + 0.43 * Math.min(1, bucket / (SHADE_BUCKETS - 1));
}

export class CountriesLayer {
  private readonly fillMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly lineMaterial: LineMaterial;
  private readonly haloMaterial: LineMaterial;
  private readonly stroke: THREE.Color;
  private readonly mesh: THREE.Mesh;
  private readonly lines: LineSegments2;
  private readonly halo: LineSegments2;
  private fillGeometry = new THREE.BufferGeometry();
  private lineGeometry = new LineSegmentsGeometry();
  private borderShapes: readonly CountryShape[] | null = null;
  private readonly fillCache = new WeakMap<CountryShape, Float32Array>();
  private readonly lineCache = new WeakMap<CountryShape, Float32Array>();
  private readonly bucketColors: THREE.Color[];
  private ranges: { start: number; end: number; code: string }[] = [];
  private readonly tintColors: THREE.Color[];
  private shade: Record<string, number> | null = null;
  private imagery = false;

  constructor(
    private readonly scene: THREE.Object3D,
    fill: string,
    stroke: string,
    shadeTop: string,
  ) {
    this.stroke = new THREE.Color(stroke);
    this.lineMaterial = new LineMaterial({ color: stroke, linewidth: BORDER_WIDTH, transparent: true });
    this.haloMaterial = new LineMaterial({ color: HALO_COLOR, linewidth: HALO_WIDTH, transparent: true, opacity: HALO_OPACITY, depthWrite: false });
    this.mesh = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    this.lines = new LineSegments2(this.lineGeometry, this.lineMaterial);
    this.halo = new LineSegments2(this.lineGeometry, this.haloMaterial);
    this.mesh.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.halo.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.halo.renderOrder = 0.7;
    this.lines.renderOrder = 1;
    this.bucketColors = Array.from({ length: SHADE_BUCKETS }, (_, b) => new THREE.Color(shadeColor(b, fill, shadeTop)));
    this.tintColors = Array.from({ length: SHADE_BUCKETS }, (_, b) => new THREE.Color(shadeColor(b, TINT_BASE, shadeTop)));
    scene.add(this.mesh, this.halo, this.lines);
  }

  setResolution(width: number, height: number): void {
    const r = this.lineMaterial.resolution;
    if (r.x === width && r.y === height) return;
    r.set(width, height);
    this.haloMaterial.resolution.set(width, height);
  }

  // Borders can come from a more detailed map than the fill, so they line up with the mosaic's edges.
  setBorders(shapes: readonly CountryShape[]): void {
    this.borderShapes = shapes;
    this.setLines(shapes);
  }

  private setLines(shapes: readonly CountryShape[]): void {
    const lines: Float32Array[] = [];
    let lineLen = 0;
    for (const s of shapes) {
      let l = this.lineCache.get(s);
      if (!l) this.lineCache.set(s, (l = buildOutline([s])));
      lines.push(l);
      lineLen += l.length;
    }
    const linePos = new Float32Array(lineLen);
    let o = 0;
    for (const l of lines) {
      linePos.set(l, o);
      o += l.length;
    }
    this.lineGeometry.dispose();
    this.lineGeometry = new LineSegmentsGeometry();
    this.lineGeometry.setPositions(linePos);
    this.lines.geometry = this.lineGeometry;
    this.halo.geometry = this.lineGeometry;
  }

  set(shapes: readonly CountryShape[]): void {
    const fills: Float32Array[] = [];
    this.ranges = [];
    let fillLen = 0;
    for (const s of shapes) {
      let f = this.fillCache.get(s);
      if (!f) this.fillCache.set(s, (f = triangulateShape(s)));
      this.ranges.push({ start: fillLen / 3, end: (fillLen + f.length) / 3, code: alpha2OfNumeric(s.id) ?? '' });
      fills.push(f);
      fillLen += f.length;
    }
    const position = new Float32Array(fillLen);
    let o = 0;
    for (const f of fills) {
      position.set(f, o);
      o += f.length;
    }
    this.fillGeometry.dispose();
    this.fillGeometry = new THREE.BufferGeometry();
    this.fillGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.fillGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array((fillLen / 3) * 4), 4));
    this.mesh.geometry = this.fillGeometry;
    if (!this.borderShapes) this.setLines(shapes);
    this.applyShade();
  }

  setShade(shade: Record<string, number> | null): void {
    this.shade = shade;
    this.applyShade();
  }

  setImagery(on: boolean): void {
    if (on === this.imagery) return;
    this.imagery = on;
    this.applyShade();
  }

  private applyShade(): void {
    const tinted = this.imagery;
    this.fillMaterial.transparent = tinted;
    this.fillMaterial.depthWrite = !tinted;
    this.fillMaterial.needsUpdate = true;
    this.mesh.visible = !tinted || this.shade !== null;
    if (tinted) this.lineMaterial.color.set(IMAGERY_STROKE);
    else this.lineMaterial.color.copy(this.stroke);
    this.lineMaterial.opacity = tinted ? IMAGERY_STROKE_OPACITY : 0.95;
    this.lineMaterial.needsUpdate = true;
    const attr = this.fillGeometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (const r of this.ranges) {
      const b = shadeBucket(this.shade?.[r.code]);
      const c = (tinted ? this.tintColors : this.bucketColors)[b]!;
      const a = tinted ? tintAlpha(b) : 1;
      for (let i = r.start; i < r.end; i++) {
        arr[i * 4] = c.r;
        arr[i * 4 + 1] = c.g;
        arr[i * 4 + 2] = c.b;
        arr[i * 4 + 3] = a;
      }
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.mesh, this.halo, this.lines);
    this.fillGeometry.dispose();
    this.lineGeometry.dispose();
    this.fillMaterial.dispose();
    this.lineMaterial.dispose();
    this.haloMaterial.dispose();
  }
}
