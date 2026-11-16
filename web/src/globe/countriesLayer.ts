import * as THREE from 'three';
import { alpha2OfNumeric, shadeBucket, shadeColor, SHADE_BUCKETS, type CountryShape } from './countries';
import { triangulateShape } from './fill';
import { buildOutline } from './outline';

export class CountriesLayer {
  private readonly fillMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly lineMaterial: THREE.LineBasicMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private fillGeometry = new THREE.BufferGeometry();
  private lineGeometry = new THREE.BufferGeometry();
  private readonly fillCache = new WeakMap<CountryShape, Float32Array>();
  private readonly lineCache = new WeakMap<CountryShape, Float32Array>();
  private readonly bucketColors: THREE.Color[];
  private ranges: { start: number; end: number; code: string }[] = [];
  private shade: Record<string, number> | null = null;

  constructor(
    private readonly scene: THREE.Object3D,
    fill: string,
    stroke: string,
    shadeTop: string,
  ) {
    this.lineMaterial = new THREE.LineBasicMaterial({ color: stroke });
    this.mesh = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.mesh.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.lines.renderOrder = 1;
    this.bucketColors = Array.from({ length: SHADE_BUCKETS }, (_, b) => new THREE.Color(shadeColor(b, fill, shadeTop)));
    scene.add(this.mesh, this.lines);
  }

  set(shapes: readonly CountryShape[]): void {
    const fills: Float32Array[] = [];
    const lines: Float32Array[] = [];
    this.ranges = [];
    let fillLen = 0;
    let lineLen = 0;
    for (const s of shapes) {
      let f = this.fillCache.get(s);
      if (!f) this.fillCache.set(s, (f = triangulateShape(s)));
      let l = this.lineCache.get(s);
      if (!l) this.lineCache.set(s, (l = buildOutline([s])));
      this.ranges.push({ start: fillLen / 3, end: (fillLen + f.length) / 3, code: alpha2OfNumeric(s.id) ?? '' });
      fills.push(f);
      lines.push(l);
      fillLen += f.length;
      lineLen += l.length;
    }
    const position = new Float32Array(fillLen);
    let o = 0;
    for (const f of fills) {
      position.set(f, o);
      o += f.length;
    }
    const linePos = new Float32Array(lineLen);
    o = 0;
    for (const l of lines) {
      linePos.set(l, o);
      o += l.length;
    }
    this.fillGeometry.dispose();
    this.fillGeometry = new THREE.BufferGeometry();
    this.fillGeometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    this.fillGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fillLen), 3));
    this.mesh.geometry = this.fillGeometry;
    this.lineGeometry.dispose();
    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    this.lines.geometry = this.lineGeometry;
    this.applyShade();
  }

  setShade(shade: Record<string, number> | null): void {
    this.shade = shade;
    this.applyShade();
  }

  private applyShade(): void {
    const attr = this.fillGeometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (const r of this.ranges) {
      const c = this.bucketColors[shadeBucket(this.shade?.[r.code])]!;
      for (let i = r.start; i < r.end; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
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
