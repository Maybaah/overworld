import * as THREE from 'three';
import type { AtlasLayout } from './atlasSlots';
import { CoverAtlas, coverUrl } from './coverAtlas';
import type { MosaicCell, MosaicFocus, MosaicMesh } from './mosaic/build';
import type { MosaicRequest, MosaicResponse, WorkerGame } from './mosaic/protocol';
import { GLOBE_RADIUS } from './outline';
import { SpriteSheets, SPRITE_LAYOUT } from './mosaic/sprites';
import { dataBase } from '../data/loader';

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
const STRIDE = TIERS.length + 2;
const SPRITE = TIERS.length;
const READY = TIERS.length + 1;
const KEEP_PX = SPRITE_LAYOUT.imageH;
const SHARP_FADE_S = 0.3;
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
flat varying vec4 vR;
flat varying float vCell;
ivec2 at(int k) { return ivec2(k % ${TABLE_W}, k / ${TABLE_W}); }
void main() {
  int c = ${STRIDE} * int(aCell + 0.5);
  vT0 = texelFetch(uTable, at(c), 0);
  vT1 = texelFetch(uTable, at(c + 1), 0);
  vT2 = texelFetch(uTable, at(c + 2), 0);
  vT3 = texelFetch(uTable, at(c + 3), 0);
  vS = texelFetch(uTable, at(c + ${SPRITE}), 0);
  vR = texelFetch(uTable, at(c + ${READY}), 0);
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
uniform float uNow;
uniform vec2 uT0Size;
varying vec2 vUv;
flat varying vec4 vT0;
flat varying vec4 vT1;
flat varying vec4 vT2;
flat varying vec4 vT3;
flat varying vec4 vS;
flat varying vec4 vR;
flat varying float vCell;
float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
vec2 inRect(vec4 r, vec2 uv) { return vec2(mix(r.x, r.z, uv.x), mix(r.y, r.w, 1.0 - uv.y)); }
float fadeIn(float t) { return t < 0.0 ? 1.0 : clamp((uNow - t) / ${SHARP_FADE_S.toFixed(2)}, 0.0, 1.0); }
// The sharp atlases have no mipmaps, so a cover drawn smaller than its slot averages a grid of taps
// across the pixel's footprint instead of shimmering while the globe turns.
vec3 sharpTap(sampler2D tex, vec4 r, vec2 uv, vec2 du, vec2 dv) {
  vec2 st = inRect(r, uv);
  vec2 span = vec2(r.z - r.x, r.y - r.w);
  vec2 size = vec2(textureSize(tex, 0));
  vec2 dx = span * du;
  vec2 dy = span * dv;
  float texels = max(length(dx * size), length(dy * size));
  int n = int(clamp(ceil(texels * 0.5), 1.0, 4.0));
  if (n == 1) return textureLod(tex, st, 0.0).rgb;
  vec2 lo = min(r.xy, r.zw);
  vec2 hi = max(r.xy, r.zw);
  float inv = 1.0 / float(n);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    for (int j = 0; j < 4; j++) {
      if (j >= n) break;
      vec2 o = (vec2(float(i), float(j)) + 0.5) * inv - 0.5;
      c += textureLod(tex, clamp(st + o.x * dx + o.y * dy, lo, hi), 0.0).rgb;
    }
  }
  return c * inv * inv;
}
vec3 lowColor(vec2 uv) {
  if (vS.x >= 0.0) {
    float layer = floor(vS.x);
    vec2 st = inRect(vec4(vS.x - layer, vS.y, vS.z - layer, vS.w), uv);
    vec2 px = st * uSpriteSize;
    float lod = clamp(log2(max(length(dFdx(px)), length(dFdy(px)))), 0.0, 3.0);
    return textureLod(uSprite, vec3(st, layer), lod).rgb;
  }
  if (vT0.x >= 0.0) {
    // Small covers are minified when zoomed out, so they sample their mip chain to stay calm instead of sparkling.
    vec2 st = inRect(vT0, uv);
    vec2 px = st * uT0Size;
    float lod = clamp(log2(max(length(dFdx(px)), length(dFdy(px)))), 0.0, 3.0);
    return textureLod(uT0, st, lod).rgb;
  }
  return uBase * (0.75 + 0.5 * hash(vCell + 1.0));
}
void main() {
  vec2 du = dFdx(vUv);
  vec2 dv = dFdy(vUv);
  vec2 uv = clamp(vUv, 0.0, 1.0);
  float a1 = vT1.x >= 0.0 ? fadeIn(vR.y) : 0.0;
  float a2 = vT2.x >= 0.0 ? fadeIn(vR.z) : 0.0;
  float a3 = vT3.x >= 0.0 ? fadeIn(vR.w) : 0.0;
  vec3 col;
  if (a3 >= 1.0) col = sharpTap(uT3, vT3, uv, du, dv);
  else {
    if (a2 >= 1.0) col = sharpTap(uT2, vT2, uv, du, dv);
    else {
      if (a1 >= 1.0) col = sharpTap(uT1, vT1, uv, du, dv);
      else {
        col = lowColor(uv);
        if (a1 > 0.0) col = mix(col, sharpTap(uT1, vT1, uv, du, dv), a1);
      }
      if (a2 > 0.0) col = mix(col, sharpTap(uT2, vT2, uv, du, dv), a2);
    }
    if (a3 > 0.0) col = mix(col, sharpTap(uT3, vT3, uv, du, dv), a3);
  }
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
  showing: number;
  downgrades: number;
  evictedOnScreen: number;
}

const COVER_WAIT_MS = 1500;
const FADE_MS = 380;
const TABLE_EVERY_MS = 90;
const READY_SHARE = 0.92;
const EMPTY = new Float32Array(0);

class View {
  readonly mesh: THREE.Mesh;
  readonly lines: THREE.LineSegments;
  readonly material: THREE.ShaderMaterial;
  readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#05070b', transparent: true, opacity: 0.85, depthWrite: false });
  readonly table: THREE.DataTexture;
  readonly cellByGame: Map<number, number>;
  readonly spriteUv: (Float32Array | null)[];
  readonly level: Int8Array;
  readonly shownAt: Float32Array;
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
    this.level = new Int8Array(cells.length).fill(-1);
    this.shownAt = new Float32Array(cells.length * TIERS.length).fill(NaN);
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
  private lastBuild = 0;
  private answered = 0;
  private answeredLast = true;
  private firstMesh!: () => void;
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
  private onScreen = new Set<string>();
  private downgrades = 0;
  private evictedOnScreen = 0;
  private filledAt = -Infinity;

  constructor(
    private readonly scene: THREE.Object3D,
    renderer: THREE.WebGLRenderer,
    private readonly clock: () => number,
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
        uNow: { value: 0 },
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

  request(year: number, maxYear: number, filter: ReadonlySet<number> | null, focus: MosaicFocus | null): void {
    this.lastBuild = ++this.seq;
    this.post({ type: 'build', seq: this.lastBuild, year, maxYear, filter: filter ? [...filter] : null, focus });
  }

  get busy(): boolean {
    return this.answered < this.lastBuild || !this.answeredLast;
  }

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
    const v = this.incoming ?? this.current;
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
      downgrades: this.downgrades,
      evictedOnScreen: this.evictedOnScreen,
    };
  }

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
      this.onScreen = new Set(visible);
      if (target === this.incoming) this.incomingVisible = visible;
      this.wantLow();
      sharp.forEach((keys, k) => this.atlases[k + 1]!.want(keys));
    }
    let changed = false;
    let evicted = false;
    for (const a of this.atlases) {
      changed = a.frame() || changed;
      for (const key of a.takeEvicted()) {
        evicted = true;
        if (this.onScreen.has(key)) this.evictedOnScreen++;
      }
    }
    if (changed) this.syncAtlasTextures();
    if (changed) this.tableDirty = true;
    // A reused slot already holds the new cover, so the old cell must stop pointing at it this frame.
    if (evicted) this.fillTables(true);
    else if (this.tableDirty && now - this.tableAt >= TABLE_EVERY_MS) this.fillTables(false);
    const t = this.clock();
    for (const v of this.views()) v.material.uniforms.uNow!.value = t;
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
    this.answered = msg.seq;
    this.answeredLast = msg.last;
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

  private wantLow(): void {
    const order = this.visibleLow ?? this.lowOrder;
    this.atlases[0]!.want(order.filter((c) => !this.sprites.has(c)).slice(0, TIERS[0]!.capacity));
  }

  private fillTables(force: boolean): void {
    if (!force && !this.tableDirty) return;
    this.tableDirty = false;
    this.tableAt = performance.now();
    const shownBefore = this.filledAt;
    this.filledAt = this.clock();
    for (const v of this.views()) this.fillTable(v, shownBefore);
  }

  private fillTable(v: View, shownBefore: number): void {
    const data = v.table.image.data as Float32Array;
    data.fill(-1);
    let showing = 0;
    const cells = v.cells;
    for (let i = 0; i < cells.length; i++) {
      const cover = cells[i]!.cover;
      if (!cover) continue;
      let any = false;
      let level = -1;
      for (let k = 0; k < this.atlases.length; k++) {
        const r = this.atlases[k]!.uv(cover);
        const s = TIERS.length * i + k;
        if (r) {
          data.set(r, 4 * (STRIDE * i + k));
          if (Number.isNaN(v.shownAt[s])) v.shownAt[s] = (this.atlases[k]!.readyTime(cover) ?? -1) > shownBefore ? this.filledAt : -1;
          data[4 * (STRIDE * i + READY) + k] = v.shownAt[s]!;
          any = true;
          level = Math.max(level, k);
        } else v.shownAt[s] = NaN;
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
      if (level < v.level[i]! && this.onScreen.has(cover)) this.downgrades++;
      v.level[i] = level;
    }
    v.showing = showing;
    v.table.needsUpdate = true;
  }

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
    // A sharp cover keeps its slot while it is on screen and not tiny, and only gives it up once it
    // leaves the view, so a turning globe never drops a visible tile back to a blurrier version.
    const sharpestLoaded = (key: string): number => {
      for (let k = this.atlases.length - 1; k > 0; k--) if (this.atlases[k]!.uv(key)) return k;
      return 0;
    };
    const sharp = TIERS.slice(1).map((t, k) => {
      const tier = k + 1;
      const kept = onScreen.filter(([px, key]) => px >= KEEP_PX && sharpestLoaded(key) === tier).map(([, key]) => key);
      const keptSet = new Set(kept);
      const fresh = scored
        .filter(([px, key]) => px > TIERS[k]!.layout.imageH && !keptSet.has(key) && sharpestLoaded(key) < tier)
        .map(([, key]) => key);
      return [...kept, ...fresh].slice(0, t.capacity);
    });
    return { low, sharp, visible };
  }
}
