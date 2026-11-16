import * as THREE from 'three';
import type { AtlasLayout } from './atlasSlots';
import { CoverAtlas, coverUrl } from './coverAtlas';
import type { MosaicCell, MosaicMesh } from './mosaic/build';
import type { MosaicRequest, MosaicResponse, WorkerGame } from './mosaic/protocol';
import { GLOBE_RADIUS } from './outline';

const LOW: AtlasLayout = { size: 3072, slotW: 64, slotH: 88, imageW: 60, imageH: 85 };
const HIGH: AtlasLayout = { size: 2048, slotW: 136, slotH: 192, imageW: 132, imageH: 187 };
const HIGH_CAPACITY = 150;
const HIGH_MIN_PX = 45;
const TABLE_W = 2048;
const BASE_COLOR = new THREE.Color('#4a5466');

const VERTEX = `
attribute float aCell;
uniform sampler2D uTable;
varying vec2 vUv;
flat varying vec4 vLow;
flat varying vec4 vHigh;
flat varying float vCell;
ivec2 at(int k) { return ivec2(k % ${TABLE_W}, k / ${TABLE_W}); }
void main() {
  int c = int(aCell + 0.5);
  vLow = texelFetch(uTable, at(2 * c), 0);
  vHigh = texelFetch(uTable, at(2 * c + 1), 0);
  vCell = aCell;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
uniform sampler2D uLow;
uniform sampler2D uHigh;
uniform vec3 uBase;
uniform float uHover;
uniform float uSelected;
uniform float uDim;
varying vec2 vUv;
flat varying vec4 vLow;
flat varying vec4 vHigh;
flat varying float vCell;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec2 inRect(vec4 r, vec2 uv) { return vec2(mix(r.x, r.z, uv.x), mix(r.y, r.w, 1.0 - uv.y)); }
void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 col;
  if (vHigh.x >= 0.0) col = textureLod(uHigh, inRect(vHigh, uv), 0.0).rgb;
  else if (vLow.x >= 0.0) col = textureLod(uLow, inRect(vLow, uv), 0.0).rgb;
  else col = uBase * (0.75 + 0.5 * hash(vCell + 1.0));
  float hover = 1.0 - step(0.5, abs(vCell - uHover));
  float selected = 1.0 - step(0.5, abs(vCell - uSelected));
  float dim = uSelected >= 0.0 ? mix(uDim, 1.0, selected) : 0.9;
  col = col * dim + hover * 0.12;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface MosaicStats {
  cells: number;
  triangles: number;
  buildMs: number;
  applyMs: number;
  frameMs: number;
  lowLoaded: number;
  highLoaded: number;
}

export class MosaicLayer {
  private readonly worker: Worker;
  private readonly low: CoverAtlas;
  private readonly high: CoverAtlas;
  private readonly material: THREE.ShaderMaterial;
  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#05070b', transparent: true, opacity: 0.85 });
  private readonly mesh: THREE.Mesh;
  private readonly lines: THREE.LineSegments;
  private table: THREE.DataTexture;
  private cells: MosaicCell[] = [];
  private cellByGame = new Map<number, number>();
  private seq = 0;
  private busy = false;
  private pending: Extract<MosaicRequest, { type: 'build' }> | null = null;
  private readonly picks = new Map<number, (id: number | null) => void>();
  private buildMs = 0;
  private applyMs = 0;
  private frameMs = 0;
  private needHigh = true;
  private onChange: () => void = () => {};

  constructor(
    scene: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    clock: () => number,
  ) {
    this.low = new CoverAtlas(renderer, clock, LOW, (id) => coverUrl(id), 8, false);
    this.high = new CoverAtlas(renderer, clock, HIGH, (id) => coverUrl(id, 'cover_big'), 4, false);
    this.table = this.makeTable(1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTable: { value: this.table },
        uLow: { value: this.low.texture },
        uHigh: { value: this.high.texture },
        uBase: { value: BASE_COLOR },
        uHover: { value: -1 },
        uSelected: { value: -1 },
        uDim: { value: 0.55 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMaterial);
    this.mesh.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.mesh.renderOrder = 0.5;
    this.lines.renderOrder = 0.6;
    scene.add(this.mesh, this.lines);
    this.worker = new Worker(new URL('./mosaic/mosaic.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<MosaicResponse>) => this.receive(ev.data);
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  init(games: WorkerGame[]): void {
    this.post({ type: 'init', games });
  }

  request(year: number, maxYear: number, filter: ReadonlySet<number> | null): void {
    const msg: MosaicRequest = { type: 'build', seq: ++this.seq, year, maxYear, filter: filter ? [...filter] : null };
    if (this.busy) this.pending = msg;
    else {
      this.busy = true;
      this.post(msg);
    }
  }

  pick(lat: number, lng: number): Promise<number | null> {
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.picks.set(seq, resolve);
      this.post({ type: 'pick', seq, lat, lng });
    });
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
    this.lines.visible = v;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  setHover(gameId: number | null): void {
    this.material.uniforms.uHover!.value = gameId === null ? -1 : (this.cellByGame.get(gameId) ?? -1);
  }

  setSelected(gameId: number | null): void {
    this.material.uniforms.uSelected!.value = gameId === null ? -1 : (this.cellByGame.get(gameId) ?? -1);
  }

  cellOf(gameId: number): MosaicCell | null {
    const i = this.cellByGame.get(gameId);
    return i === undefined ? null : this.cells[i]!;
  }

  stats(): MosaicStats {
    const pos = this.mesh.geometry.getAttribute('position');
    return {
      cells: this.cells.length,
      triangles: pos ? pos.count / 3 : 0,
      buildMs: this.buildMs,
      applyMs: this.applyMs,
      frameMs: this.frameMs,
      lowLoaded: this.low.loadedCount(),
      highLoaded: this.high.loadedCount(),
    };
  }

  cameraMoved(): void {
    this.needHigh = true;
  }

  frame(camera: THREE.PerspectiveCamera, heightPx: number): boolean {
    const t0 = performance.now();
    try {
      return this.frameInner(camera, heightPx);
    } finally {
      this.frameMs = Math.max(this.frameMs, performance.now() - t0);
    }
  }

  private frameInner(camera: THREE.PerspectiveCamera, heightPx: number): boolean {
    if (this.needHigh && this.cells.length > 0) {
      this.needHigh = false;
      this.high.want(this.pickHigh(camera, heightPx));
    }
    const lowChanged = this.low.frame();
    const changed = this.high.frame() || lowChanged;
    if (changed) this.fillTable();
    return changed;
  }

  dispose(): void {
    this.worker.terminate();
    this.low.dispose();
    this.high.dispose();
    this.table.dispose();
    this.mesh.geometry.dispose();
    this.lines.geometry.dispose();
    this.material.dispose();
    this.lineMaterial.dispose();
    this.mesh.removeFromParent();
    this.lines.removeFromParent();
  }

  private post(msg: MosaicRequest): void {
    this.worker.postMessage(msg);
  }

  private receive(msg: MosaicResponse): void {
    if (msg.type === 'pick') {
      this.picks.get(msg.seq)?.(msg.gameId);
      this.picks.delete(msg.seq);
      return;
    }
    this.busy = false;
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.busy = true;
      this.post(next);
    }
    this.buildMs = msg.ms;
    const t0 = performance.now();
    this.apply(msg.mesh);
    this.applyMs = Math.max(this.applyMs, performance.now() - t0);
  }

  private apply(m: MosaicMesh): void {
    const hoverGame = this.gameAt(this.material.uniforms.uHover!.value as number);
    const selectedGame = this.gameAt(this.material.uniforms.uSelected!.value as number);
    this.cells = m.cells;
    this.cellByGame = new Map(m.cells.map((c, i) => [c.gameId, i]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    g.setAttribute('aCell', new THREE.BufferAttribute(m.cell, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    const l = new THREE.BufferGeometry();
    l.setAttribute('position', new THREE.BufferAttribute(m.lines, 3));
    this.lines.geometry.dispose();
    this.lines.geometry = l;
    const rows = Math.max(1, Math.ceil((2 * m.cells.length) / TABLE_W));
    if (this.table.image.height !== rows) {
      this.table.dispose();
      this.table = this.makeTable(rows);
      this.material.uniforms.uTable!.value = this.table;
    }
    this.setHover(hoverGame);
    this.setSelected(selectedGame);
    const order = m.cells
      .map((c, i) => [c.area, i] as const)
      .sort((a, b) => b[0] - a[0])
      .map(([, i]) => m.cells[i]!.cover)
      .filter((c): c is string => !!c);
    this.low.want(order.slice(0, Math.floor(LOW.size / LOW.slotW) * Math.floor(LOW.size / LOW.slotH)));
    this.needHigh = true;
    this.fillTable();
    this.onChange();
  }

  private gameAt(cell: number): number | null {
    return cell >= 0 ? (this.cells[cell]?.gameId ?? null) : null;
  }

  private makeTable(rows: number): THREE.DataTexture {
    const t = new THREE.DataTexture(new Float32Array(TABLE_W * rows * 4).fill(-1), TABLE_W, rows, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  private fillTable(): void {
    const data = this.table.image.data as Float32Array;
    data.fill(-1);
    this.cells.forEach((c, i) => {
      if (!c.cover) return;
      const lo = this.low.uv(c.cover);
      if (lo) data.set(lo, 8 * i);
      const hi = this.high.uv(c.cover);
      if (hi) data.set(hi, 8 * i + 4);
    });
    this.table.needsUpdate = true;
  }

  private pickHigh(camera: THREE.PerspectiveCamera, heightPx: number): string[] {
    const focal = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cam = camera.position;
    const camLen = cam.length();
    const scored: [number, string][] = [];
    const p = new THREE.Vector3();
    for (const c of this.cells) {
      if (!c.cover) continue;
      const phi = ((90 - c.lat) * Math.PI) / 180;
      const theta = ((90 - c.lng) * Math.PI) / 180;
      p.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(GLOBE_RADIUS);
      const facing = p.dot(cam) / (GLOBE_RADIUS * camLen);
      if (facing < 0.15) continue;
      const size = Math.sqrt(c.area) * (Math.PI / 180) * GLOBE_RADIUS;
      const px = (size / p.distanceTo(cam)) * focal * Math.sqrt(facing);
      if (px >= HIGH_MIN_PX) scored.push([px, c.cover]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, HIGH_CAPACITY).map(([, k]) => k);
  }
}
