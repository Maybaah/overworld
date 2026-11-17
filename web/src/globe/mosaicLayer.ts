import * as THREE from 'three';
import type { AtlasLayout } from './atlasSlots';
import { CoverAtlas, coverUrl } from './coverAtlas';
import type { MosaicCell, MosaicFocus, MosaicMesh } from './mosaic/build';
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
  { layout: { size: 4096, slotW: 64, slotH: 88, imageW: 60, imageH: 85 }, size: 'cover_small', capacity: 2944, inFlight: 12 },
  { layout: { size: 4096, slotW: 268, slotH: 378, imageW: 264, imageH: 374 }, size: 'cover_big', capacity: 150, inFlight: 6 },
  { layout: { size: 4096, slotW: 532, slotH: 752, imageW: 528, imageH: 748 }, size: 'cover_big_2x', capacity: 35, inFlight: 4 },
  { layout: { size: 3072, height: 2176, slotW: 768, slotH: 1088, imageW: 762, imageH: 1080 }, size: '1080p', capacity: 8, inFlight: 2 },
];
const TABLE_W = 2048;
const STICKY = 2.5;
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
uniform float uAlpha;
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
  gl_FragColor = vec4(col, uAlpha);
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

// Before a new mosaic fades in, its covers on screen get this long to arrive.
const COVER_WAIT_MS = 1500;
const FADE_MS = 380;
const TABLE_EVERY_MS = 90;
const READY_SHARE = 0.92;
const EMPTY = new Float32Array(0);

// One mosaic on the globe: its mesh, seams and cell table. A new mosaic fades in over the old one.
class View {
  readonly mesh: THREE.Mesh;
  readonly lines: THREE.LineSegments;
  readonly material: THREE.ShaderMaterial;
  readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#05070b', transparent: true, opacity: 0.85, depthWrite: false });
  readonly table: THREE.DataTexture;
  readonly cellByGame: Map<number, number>;
  readonly spriteUv: (Float32Array | null)[];
  showing = 0;

  constructor(
    base: THREE.ShaderMaterial,
    readonly cells: MosaicCell[],
    m: MosaicMesh,
    readonly year: number,
  ) {
    this.material = base.clone();
    for (const k of ['uT0', 'uT1', 'uT2', 'uT3', 'uSprite'] as const) this.material.uniforms[k]!.value = base.uniforms[k]!.value;
    this.cellByGame = new Map(cells.map((c, i) => [c.gameId, i]));
    this.spriteUv = new Array<Float32Array | null>(cells.length).fill(null);
    const rows = Math.max(1, Math.ceil((STRIDE * cells.length) / TABLE_W));
    this.table = new THREE.DataTexture(new Float32Array(TABLE_W * rows * 4).fill(-1), TABLE_W, rows, THREE.RGBAFormat, THREE.FloatType);
    this.table.minFilter = THREE.NearestFilter;
    this.table.magFilter = THREE.NearestFilter;
    this.table.needsUpdate = true;
    this.material.uniforms.uTable!.value = this.table;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    g.setAttribute('aCell', new THREE.BufferAttribute(m.cell, 1));
    this.mesh = new THREE.Mesh(g, this.material);
    const l = new THREE.BufferGeometry();
    l.setAttribute('position', new THREE.BufferAttribute(m.lines, 3));
    this.lines = new THREE.LineSegments(l, this.lineMaterial);
    this.mesh.frustumCulled = false;
    this.lines.frustumCulled = false;
    this.setAlpha(1, false);
  }

  // An incoming view draws above the current one, blended, until it is fully in.
  setAlpha(a: number, front: boolean): void {
    const fading = a < 1;
    this.material.uniforms.uAlpha!.value = a;
    if (this.material.transparent !== fading) {
      this.material.transparent = fading;
      this.material.depthWrite = !fading;
      this.material.needsUpdate = true;
    }
    this.material.polygonOffsetFactor = front ? -4 : -2;
    this.material.polygonOffsetUnits = front ? -4 : -2;
    this.mesh.renderOrder = front ? 0.55 : 0.5;
    this.lines.renderOrder = front ? 0.65 : 0.6;
    this.lineMaterial.opacity = 0.85 * a;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
    this.lines.visible = v;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.lines.removeFromParent();
    this.mesh.geometry.dispose();
    this.lines.geometry.dispose();
    this.material.dispose();
    this.lineMaterial.dispose();
    this.table.dispose();
  }
}

export class MosaicLayer {
  private readonly worker: Worker;
  private readonly atlases: CoverAtlas[];
  private readonly sprites: SpriteSheets;
  private readonly base: THREE.ShaderMaterial;
  private current: View | null = null;
  private incoming: View | null = null;
  private incomingAt = 0;
  private fadeFrom: number | null = null;
  private visibleFlag = true;
  private hoverGame: number | null = null;
  private selectedGame: number | null = null;
  private lowOrder: string[] = [];
  private pixelRatio = 1;
  private seq = 0;
  private firstMesh!: () => void;
  // Resolves once the first mosaic is on the globe and the cover sprite sheets are in.
  readonly ready: Promise<void>;
  private visibleLow: string[] | null = null;
  private incomingVisible: string[] | null = null;
  private readonly picks = new Map<number, (id: number | null) => void>();
  private buildMs = 0;
  private applyMs = 0;
  private frameMs = 0;
  private needHigh = true;
  private tableDirty = false;
  private tableAt = 0;
  private onChange: () => void = () => {};

  constructor(
    private readonly scene: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    clock: () => number,
  ) {
    this.atlases = TIERS.map((t, k) => new CoverAtlas(renderer, clock, t.layout, (id) => coverUrl(id, t.size), t.inFlight, k === 0));
    this.pixelRatio = renderer.getPixelRatio();
    this.base = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTable: { value: null },
        uT0: { value: this.atlases[0]!.texture },
        uT1: { value: this.atlases[1]!.texture },
        uT2: { value: this.atlases[2]!.texture },
        uT3: { value: this.atlases[3]!.texture },
        uBase: { value: BASE_COLOR },
        uHover: { value: -1 },
        uSelected: { value: -1 },
        uDim: { value: 0.55 },
        uAlpha: { value: 1 },
        uSprite: { value: null },
        uSpriteSize: { value: SPRITE_LAYOUT.size },
        uT0Size: { value: new THREE.Vector2(TIERS[0]!.layout.size, TIERS[0]!.layout.height ?? TIERS[0]!.layout.size) },
      },
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.sprites = new SpriteSheets(renderer, `${dataBase()}/`, () => {
      this.base.uniforms.uSprite!.value = this.sprites.texture;
      for (const v of this.views()) {
        v.material.uniforms.uSprite!.value = this.sprites.texture;
        v.spriteUv.fill(null);
      }
      this.wantLow();
      this.fillTables(true);
    });
    const meshIn = new Promise<void>((resolve) => (this.firstMesh = resolve));
    this.ready = Promise.all([meshIn, this.sprites.done]).then(() => undefined);
    this.worker = new Worker(new URL('./mosaic/mosaic.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<MosaicResponse>) => this.receive(ev.data);
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  init(games: WorkerGame[]): void {
    this.post({ type: 'init', games, layoutsUrl: `${dataBase()}/mosaic-layouts.bin` });
  }

  // The worker keeps only the latest request, so requests can come as fast as the slider moves.
  request(year: number, maxYear: number, filter: ReadonlySet<number> | null, focus: MosaicFocus | null): void {
    this.post({ type: 'build', seq: ++this.seq, year, maxYear, filter: filter ? [...filter] : null, focus });
  }

  // The year of the mosaic on the globe now.
  get year(): number | null {
    return this.current?.year ?? null;
  }

  pick(lat: number, lng: number): Promise<number | null> {
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.picks.set(seq, resolve);
      this.post({ type: 'pick', seq, lat, lng });
    });
  }

  setVisible(v: boolean): void {
    this.visibleFlag = v;
    for (const view of this.views()) view.setVisible(v);
  }

  get visible(): boolean {
    return this.visibleFlag;
  }

  setHover(gameId: number | null): void {
    this.hoverGame = gameId;
    for (const v of this.views()) v.material.uniforms.uHover!.value = gameId === null ? -1 : (v.cellByGame.get(gameId) ?? -1);
  }

  setSelected(gameId: number | null): void {
    this.selectedGame = gameId;
    for (const v of this.views()) v.material.uniforms.uSelected!.value = gameId === null ? -1 : (v.cellByGame.get(gameId) ?? -1);
  }

  cellOf(gameId: number): MosaicCell | null {
    const v = this.current;
    const i = v?.cellByGame.get(gameId);
    return v && i !== undefined ? v.cells[i]! : null;
  }

  stats(): MosaicStats {
    const v = this.incoming ?? this.current;
    const pos = v?.mesh.geometry.getAttribute('position');
    return {
      cells: v?.cells.length ?? 0,
      triangles: pos ? pos.count / 3 : 0,
      buildMs: this.buildMs,
      applyMs: this.applyMs,
      frameMs: this.frameMs,
      lowLoaded: this.atlases[0]!.loadedCount(),
      highLoaded: this.atlases.slice(1).reduce((a, t) => a + t.loadedCount(), 0),
      showing: v?.showing ?? 0,
    };
  }

  // Covers are re-picked once the camera has settled, not while it moves.
  cameraMoved(): void {
    this.needHigh = true;
  }

  frame(camera: THREE.PerspectiveCamera, heightPx: number): boolean {
    const t0 = performance.now();
    try {
      return this.frameInner(camera, heightPx, t0);
    } finally {
      this.frameMs = Math.max(this.frameMs, performance.now() - t0);
    }
  }

  private frameInner(camera: THREE.PerspectiveCamera, heightPx: number, now: number): boolean {
    const target = this.incoming ?? this.current;
    if (this.needHigh && target) {
      this.needHigh = false;
      const { low, sharp, visible } = this.pickSharp(target, camera, heightPx);
      this.visibleLow = low;
      if (target === this.incoming) this.incomingVisible = visible;
      this.wantLow();
      sharp.forEach((keys, k) => this.atlases[k + 1]!.want(keys));
    }
    let changed = false;
    for (const a of this.atlases) changed = a.frame() || changed;
    if (changed) this.syncAtlasTextures();
    if (changed) this.tableDirty = true;
    if (this.tableDirty && now - this.tableAt >= TABLE_EVERY_MS) this.fillTables(false);
    this.stepFade(now);
    return changed;
  }

  dispose(): void {
    this.worker.terminate();
    for (const a of this.atlases) a.dispose();
    this.sprites.dispose();
    for (const v of this.views()) v.dispose();
    this.base.dispose();
  }

  private syncAtlasTextures(): void {
    const keys = ['uT0', 'uT1', 'uT2', 'uT3'] as const;
    keys.forEach((k, i) => {
      const t = this.atlases[i]!.texture;
      if (this.base.uniforms[k]!.value === t) return;
      this.base.uniforms[k]!.value = t;
      for (const v of this.views()) v.material.uniforms[k]!.value = t;
    });
  }

  private views(): View[] {
    return [this.current, this.incoming].filter((v): v is View => v !== null);
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
    this.buildMs = msg.ms;
    const t0 = performance.now();
    this.apply(msg.mesh, msg.year);
    this.firstMesh();
    this.applyMs = Math.max(this.applyMs, performance.now() - t0);
  }

  private apply(m: MosaicMesh, year: number): void {
    if (this.incoming) {
      if (this.fadeFrom !== null) this.promote();
      else {
        this.incoming.dispose();
        this.incoming = null;
      }
    }
    const view = new View(this.base, m.cells, m, year);
    view.setVisible(this.visibleFlag);
    this.scene.add(view.mesh, view.lines);
    this.lowOrder = m.cells
      .map((c, i) => [c.area, i] as const)
      .sort((a, b) => b[0] - a[0])
      .map(([, i]) => m.cells[i]!.cover)
      .filter((c): c is string => !!c);
    if (!this.current) this.current = view;
    else {
      this.incoming = view;
      this.incomingAt = performance.now();
      this.fadeFrom = null;
      this.incomingVisible = null;
      view.setAlpha(0, true);
    }
    this.setHover(this.hoverGame);
    this.setSelected(this.selectedGame);
    this.needHigh = true;
    this.fillTables(true);
    this.onChange();
  }

  private promote(): void {
    if (!this.incoming) return;
    this.current?.dispose();
    this.current = this.incoming;
    this.current.setAlpha(1, false);
    this.incoming = null;
    this.fadeFrom = null;
  }

  // The new view waits until most of its covers on screen are in (or a short timeout), then fades in.
  private stepFade(now: number): void {
    const v = this.incoming;
    if (!v) return;
    if (this.fadeFrom === null) {
      if (now - this.incomingAt < COVER_WAIT_MS && !this.coversReady()) return;
      this.fadeFrom = now;
    }
    const t = Math.min(1, (now - this.fadeFrom) / FADE_MS);
    v.setAlpha(t * t * (3 - 2 * t), true);
    if (t >= 1) this.promote();
  }

  private coversReady(): boolean {
    if (!this.visibleFlag) return true;
    const keys = this.incomingVisible;
    if (keys === null) return false;
    let have = 0;
    for (const k of keys) if (this.sprites.uv(k) || this.atlases.some((a) => a.uv(k))) have++;
    return have >= keys.length * READY_SHARE;
  }

  // Covers in the prebuilt sprite sheets never need the small on-demand atlas.
  // Covers on screen come first, so zoomed-in detail cells get theirs before off-screen ones.
  private wantLow(): void {
    const order = this.visibleLow ?? this.lowOrder;
    this.atlases[0]!.want(order.filter((c) => !this.sprites.has(c)).slice(0, TIERS[0]!.capacity));
  }

  private fillTables(force: boolean): void {
    if (!force && !this.tableDirty) return;
    this.tableDirty = false;
    this.tableAt = performance.now();
    for (const v of this.views()) this.fillTable(v);
  }

  private fillTable(v: View): void {
    const data = v.table.image.data as Float32Array;
    data.fill(-1);
    let showing = 0;
    const cells = v.cells;
    for (let i = 0; i < cells.length; i++) {
      const cover = cells[i]!.cover;
      if (!cover) continue;
      let any = false;
      for (let k = 0; k < this.atlases.length; k++) {
        const r = this.atlases[k]!.uv(cover);
        if (r) {
          data.set(r, 4 * (STRIDE * i + k));
          any = true;
        }
      }
      let sp = v.spriteUv[i];
      if (sp === null || sp === undefined) {
        const r = this.sprites.uv(cover);
        sp = v.spriteUv[i] = r ? Float32Array.from(r) : EMPTY;
      }
      if (sp.length > 0) {
        data.set(sp, 4 * (STRIDE * i + SPRITE));
        any = true;
      }
      if (any) showing++;
    }
    v.showing = showing;
    v.table.needsUpdate = true;
  }

  // Pixels the cover spans on screen, from its laid-out height, the distance and how much the cell faces the camera.
  // Returns the covers on screen (biggest first) and, for each tier above the first, the covers that need it.
  private pickSharp(v: View, camera: THREE.PerspectiveCamera, heightPx: number): { low: string[]; sharp: string[][]; visible: string[] } {
    const focal = (heightPx * this.pixelRatio) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cam = camera.position;
    const camLen = cam.length();
    const scored: [number, string][] = [];
    const onScreen: [number, string][] = [];
    const p = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    for (const c of v.cells) {
      if (!c.cover) continue;
      const phi = ((90 - c.lat) * Math.PI) / 180;
      const theta = ((90 - c.lng) * Math.PI) / 180;
      p.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(GLOBE_RADIUS);
      const facing = p.dot(cam) / (GLOBE_RADIUS * camLen);
      if (facing < 0.1) continue;
      const size = c.imageH * (Math.PI / 180) * GLOBE_RADIUS;
      const px = (size / Math.max(1, p.distanceTo(cam))) * focal * Math.sqrt(facing);
      ndc.copy(p).project(camera);
      const reach = 1 + (2 * px) / (heightPx * this.pixelRatio);
      if (Math.abs(ndc.x) > reach + 0.5 || Math.abs(ndc.y) > reach) continue;
      onScreen.push([px, c.cover]);
      if (px > TIERS[0]!.layout.imageH) scored.push([px, c.cover]);
    }
    onScreen.sort((x, y) => y[0] - x[0]);
    const visible = onScreen.map(([, k]) => k);
    const seen = new Set(visible);
    const low = [...visible, ...this.lowOrder.filter((k) => !seen.has(k))];
    scored.sort((x, y) => y[0] - x[0]);
    // A cover already loaded in a tier keeps its place against bigger newcomers, so tiles do not
    // drop back to a blurrier version and pop again.
    const sharp = TIERS.slice(1).map((t, k) => {
      const atlas = this.atlases[k + 1]!;
      return scored
        .filter(([px]) => px > TIERS[k]!.layout.imageH)
        .map(([px, key]) => [atlas.uv(key) ? px * STICKY : px, key] as [number, string])
        .sort((x, y) => y[0] - x[0])
        .slice(0, t.capacity)
        .map(([, key]) => key);
    });
    return { low, sharp, visible };
  }
}
