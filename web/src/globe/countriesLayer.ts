import * as THREE from 'three';
import { alpha2OfNumeric, shadeBucket, shadeColor, SHADE_BUCKETS, type CountryShape } from './countries';
import { triangulateShape } from './fill';
import { buildOutline } from './outline';

const TINT_BASE = '#3b6f8a';
const IMAGERY_STROKE = '#e3e9f0';
const IMAGERY_STROKE_OPACITY = 0.42;

export function tintAlpha(bucket: number): number {
  if (bucket <= 0) return 0;
  return 0.22 + 0.43 * Math.min(1, bucket / (SHADE_BUCKETS - 1));
}

export class CountriesLayer {
  private readonly fillMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly lineMaterial: THREE.LineBasicMaterial;
  private readonly stroke: THREE.Color;
  private readonly mesh: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private fillGeometry = new THREE.BufferGeometry();
  private lineGeometry = new THREE.BufferGeometry();
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
    this.lineMaterial = new THREE.LineBasicMaterial({ color: stroke, transparent: true });
    this.mesh = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.mesh.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.lines.renderOrder = 1;
    this.bucketColors = Array.from({ length: SHADE_BUCKETS }, (_, b) => new THREE.Color(shadeColor(b, fill, shadeTop)));
    this.tintColors = Array.from({ length: SHADE_BUCKETS }, (_, b) => new THREE.Color(shadeColor(b, TINT_BASE, shadeTop)));
    scene.add(this.mesh, this.lines);
  }

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
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    this.lines.geometry = this.lineGeometry;
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
    this.lineMaterial.opacity = tinted ? IMAGERY_STROKE_OPACITY : 0.9;
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
    this.scene.remove(this.mesh, this.lines);
    this.fillGeometry.dispose();
    this.lineGeometry.dispose();
    this.fillMaterial.dispose();
    this.lineMaterial.dispose();
  }
}
