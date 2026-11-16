import * as THREE from 'three';
import type { AtlasLayout } from './atlasSlots';
import { CoverAtlas, coverUrl } from './coverAtlas';
import type { MosaicCell, MosaicMesh } from './mosaic/build';
import type { MosaicRequest, MosaicResponse, WorkerGame } from './mosaic/protocol';
import { GLOBE_RADIUS } from './outline';
import { SpriteSheets, SPRITE_LAYOUT } from './mosaic/sprites';
import { dataBase } from '../data/loader';

// Sharpness tiers: a cell moves to the next tier once its cover spans more screen pixels than the current tier has.
interface Tier {
  layout: AtlasLayout;
  size: 'cover_small' | 'cover_big' | 'cover_big_2x' | '1080p';
  capacity: number;
  inFlight: number;
}
const TIERS: Tier[] = [
  { layout: { size: 3072, slotW: 64, slotH: 88, imageW: 60, imageH: 85 }, size: 'cover_small', capacity: 1632, inFlight: 8 },
  { layout: { size: 4096, height: 2048, slotW: 268, slotH: 378, imageW: 264, imageH: 374 }, size: 'cover_big', capacity: 75, inFlight: 4 },
  { layout: { size: 4096, slotW: 532, slotH: 752, imageW: 528, imageH: 748 }, size: 'cover_big_2x', capacity: 35, inFlight: 4 },
  { layout: { size: 3072, height: 2176, slotW: 768, slotH: 1088, imageW: 762, imageH: 1080 }, size: '1080p', capacity: 8, inFlight: 2 },
];
const TABLE_W = 2048;
const STICKY = 1.5;
// One texel per tier, plus one for the prebuilt sprite sheets.
const STRIDE = TIERS.length + 1;
const SPRITE = TIERS.length;
const BASE_COLOR = new THREE.Color('#52525b');

const VERTEX = `
attribute float aCell;
uniform sampler2D uTable;
varying vec2 vUv;
flat varying vec4 vT0;
flat varying vec4 vT1;
flat varying vec4 vT2;
flat varying vec4 vT3;
flat varying vec4 vS;
flat varying float vCell;
ivec2 at(int k) { return ivec2(k % ${TABLE_W}, k / ${TABLE_W}); }
void main() {
  int c = ${STRIDE} * int(aCell + 0.5);
  vT0 = texelFetch(uTable, at(c), 0);
  vT1 = texelFetch(uTable, at(c + 1), 0);
  vT2 = texelFetch(uTable, at(c + 2), 0);
  vT3 = texelFetch(uTable, at(c + 3), 0);
  vS = texelFetch(uTable, at(c + ${SPRITE}), 0);
  vCell = aCell;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = `
uniform sampler2D uT0;
uniform sampler2D uT1;
uniform sampler2D uT2;
uniform sampler2D uT3;
uniform highp sampler2DArray uSprite;
uniform float uSpriteSize;
uniform vec3 uBase;
uniform float uHover;
uniform float uSelected;
uniform float uDim;
uniform vec2 uT0Size;
varying vec2 vUv;
flat varying vec4 vT0;
flat varying vec4 vT1;
flat varying vec4 vT2;
flat varying vec4 vT3;
flat varying vec4 vS;
flat varying float vCell;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec2 inRect(vec4 r, vec2 uv) { return vec2(mix(r.x, r.z, uv.x), mix(r.y, r.w, 1.0 - uv.y)); }
void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 col;
  if (vT3.x >= 0.0) col = textureLod(uT3, inRect(vT3, uv), 0.0).rgb;
  else if (vT2.x >= 0.0) col = textureLod(uT2, inRect(vT2, uv), 0.0).rgb;
  else if (vT1.x >= 0.0) col = textureLod(uT1, inRect(vT1, uv), 0.0).rgb;
  else if (vS.x >= 0.0) {
    float layer = floor(vS.x);
    vec2 st = inRect(vec4(vS.x - layer, vS.y, vS.z - layer, vS.w), uv);
    vec2 px = st * uSpriteSize;
    float lod = clamp(log2(max(length(dFdx(px)), length(dFdy(px)))), 0.0, 3.0);
    col = textureLod(uSprite, vec3(st, layer), lod).rgb;
  }
  else if (vT0.x >= 0.0) {
    // Small covers are minified when zoomed out, so they sample their mip chain to stay calm instead of sparkling.
    vec2 st = inRect(vT0, uv);
    vec2 px = st * uT0Size;
    float lod = clamp(log2(max(length(dFdx(px)), length(dFdy(px)))), 0.0, 3.0);
    col = textureLod(uT0, st, lod).rgb;
  }
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
  showing: number; // cells that show a cover, from any source
}

export class MosaicLayer {
  private readonly worker: Worker;
  private readonly atlases: CoverAtlas[];
  private readonly sprites: SpriteSheets;
  private lowOrder: string[] = [];
  private pixelRatio = 1;
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
  private showing = 0;
  private applyMs = 0;
  private frameMs = 0;
  private needHigh = true;
  private onChange: () => void = () => {};

  constructor(
    scene: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    clock: () => number,
  ) {
    this.atlases = TIERS.map((t, k) => new CoverAtlas(renderer, clock, t.layout, (id) => coverUrl(id, t.size), t.inFlight, k === 0));
    this.pixelRatio = renderer.getPixelRatio();
    this.sprites = new SpriteSheets(renderer, `${dataBase()}/`, () => {
      this.material.uniforms.uSprite!.value = this.sprites.texture;
      this.wantLow();
      this.fillTable();
    });
    this.table = this.makeTable(1);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTable: { value: this.table },
        uT0: { value: this.atlases[0]!.texture },
        uT1: { value: this.atlases[1]!.texture },
        uT2: { value: this.atlases[2]!.texture },
        uT3: { value: this.atlases[3]!.texture },
        uBase: { value: BASE_COLOR },
        uHover: { value: -1 },
        uSelected: { value: -1 },
        uDim: { value: 0.55 },
        uSprite: { value: null },
        uSpriteSize: { value: SPRITE_LAYOUT.size },
        uT0Size: { value: new THREE.Vector2(TIERS[0]!.layout.size, TIERS[0]!.layout.height ?? TIERS[0]!.layout.size) },
      },
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
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
      lowLoaded: this.atlases[0]!.loadedCount(),
      highLoaded: this.atlases.slice(1).reduce((a, t) => a + t.loadedCount(), 0),
      showing: this.showing,
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
      this.pickSharp(camera, heightPx).forEach((keys, k) => this.atlases[k + 1]!.want(keys));
    }
    let changed = false;
    for (const a of this.atlases) changed = a.frame() || changed;
    if (changed) this.fillTable();
    return changed;
  }

  dispose(): void {
    this.worker.terminate();
    for (const a of this.atlases) a.dispose();
    this.sprites.dispose();
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
    const rows = Math.max(1, Math.ceil((STRIDE * m.cells.length) / TABLE_W));
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
    this.lowOrder = order;
    this.wantLow();
    this.needHigh = true;
    this.fillTable();
    this.onChange();
  }

  // Covers in the prebuilt sprite sheets never need the small on-demand atlas.
  private wantLow(): void {
    this.atlases[0]!.want(this.lowOrder.filter((c) => !this.sprites.has(c)).slice(0, TIERS[0]!.capacity));
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
    let showing = 0;
    this.cells.forEach((c, i) => {
      if (!c.cover) return;
      const before = showing;
      this.atlases.forEach((a, k) => {
        const r = a.uv(c.cover!);
        if (r) data.set(r, 4 * (STRIDE * i + k));
      });
      const sp = this.sprites.uv(c.cover);
      if (sp) data.set(sp, 4 * (STRIDE * i + SPRITE));
      for (let k = 0; k < STRIDE && showing === before; k++) if (data[4 * (STRIDE * i + k)]! >= 0) showing++;
    });
    this.showing = showing;
    this.table.needsUpdate = true;
  }

  // Pixels the cover spans on screen, from its laid-out height, the distance and how much the cell faces the camera.
  // Returns, for each tier above the first, the covers that need it, biggest first; cells off screen are skipped.
  private pickSharp(camera: THREE.PerspectiveCamera, heightPx: number): string[][] {
    const focal = (heightPx * this.pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cam = camera.position;
    const camLen = cam.length();
    const scored: [number, string][] = [];
    const p = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    for (const c of this.cells) {
      if (!c.cover) continue;
      const phi = ((90 - c.lat) * Math.PI) / 180;
      const theta = ((90 - c.lng) * Math.PI) / 180;
      p.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(GLOBE_RADIUS);
      const facing = p.dot(cam) / (GLOBE_RADIUS * camLen);
      if (facing < 0.1) continue;
      const size = c.imageH * (Math.PI / 180) * GLOBE_RADIUS;
      const px = (size / Math.max(1, p.distanceTo(cam))) * focal * Math.sqrt(facing);
      if (px <= TIERS[0]!.layout.imageH) continue;
      ndc.copy(p).project(camera);
      const reach = 1 + (2 * px) / (heightPx * this.pixelRatio);
      if (Math.abs(ndc.x) > reach + 0.5 || Math.abs(ndc.y) > reach) continue;
      scored.push([px, c.cover]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    // A cover already loaded in a tier keeps its place against slightly bigger newcomers, so tiles do not
    // drop back to a blurrier version and pop again while the globe turns.
    return TIERS.slice(1).map((t, k) => {
      const atlas = this.atlases[k + 1]!;
      return scored
        .filter(([px]) => px > TIERS[k]!.layout.imageH)
        .map(([px, key]) => [atlas.uv(key) ? px * STICKY : px, key] as [number, string])
        .sort((x, y) => y[0] - x[0])
        .slice(0, t.capacity)
        .map(([, key]) => key);
    });
  }
}
