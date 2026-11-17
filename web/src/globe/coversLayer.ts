import * as THREE from 'three';
import type { GameSummary } from '@shared';
import type { Indexes } from '../data/indexes';
import { CoverAtlas } from './coverAtlas';
import { buildChangePoints, topGameAt, type ChangePoints } from './coverChoice';
import { coverHeight, coverRect, coverWidth, hitCover, pillRect, pillText, selectCovers, type CoverCandidate } from './coverSelect';
import type { LabelFrame } from './labels';
import type { Level } from './levels';
import { makeProjected, projectPoints, type ProjectedPoints } from './picking';
import type { PillItem } from './mapLabels';
import type { Rect } from './rectGrid';

export const HOVER_SCALE = 1.25;
export const SELECTED_H = 84;
const SELECTED_LIFT = 15 + 6;
const FADE_S = 0.25;
const HOVER_MS = 120;
const MARGIN_PX = 8;
const MIN_FACING = 0.08;
const CAPACITY = 160;

export interface CoverEntry {
  level: Level;
  index: number;
  x: number;
  y: number;
  z: number;
  h: number;
  count: number;
  game: number;
  wantKey: string | null;
  shownKey: string | null;
  appearAt: number;
  lift: number;
  kind: number;
  rect: Rect;
  pill?: Rect | null;
}

export interface CoverHit {
  entry: CoverEntry;
  game: GameSummary | null;
}

const VERTEX = `
attribute vec3 iPos;
attribute vec2 iSize;
attribute vec4 iUv;
attribute vec4 iMeta;
uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uTime;
uniform float uFade;
uniform float uHover;
uniform float uHoverScale;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec4 vUv;
varying float vReady;
varying float vAlpha;
varying float vKind;
varying float vLod;
void main() {
  vec3 toCam = cameraPosition - iPos;
  float facing = dot(normalize(iPos), normalize(toCam));
  if (iSize.y <= 0.0 || facing <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float s = abs(float(gl_InstanceID) - uHover) < 0.5 ? uHoverScale : 1.0;
  vec2 size = iSize * s;
  vec2 local = position.xy * (size + 2.0 * ${MARGIN_PX.toFixed(1)});
  vec4 clip = projectionMatrix * viewMatrix * vec4(iPos, 1.0);
  clip.xy += (local + vec2(0.0, iMeta.w)) / uViewport * 2.0 * clip.w;
  gl_Position = clip;
  vLocal = local;
  vHalf = size * 0.5;
  vUv = iUv;
  vKind = iMeta.z;
  float appear = uFade > 0.0 ? clamp((uTime - iMeta.y) / uFade, 0.0, 1.0) : 1.0;
  vAlpha = appear * smoothstep(0.0, 0.18, facing);
  vReady = iMeta.x < 0.0 ? 0.0 : (uFade > 0.0 ? clamp((uTime - iMeta.x) / uFade, 0.0, 1.0) : 1.0);
  vLod = clamp(log2(128.0 / max(1.0, size.y * uPixelRatio)), 0.0, 2.0);
}
`;

const FRAGMENT = `
uniform sampler2D uAtlas;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec4 vUv;
varying float vReady;
varying float vAlpha;
varying float vKind;
varying float vLod;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  bool lead = vKind > 0.5;
  float r = lead ? 5.0 : 4.0;
  float d = box(vLocal, vHalf, r);
  float inside = 1.0 - smoothstep(-0.5, 0.5, d);
  float sd = box(vLocal - vec2(0.0, -2.0), vHalf, r);
  float shadow = (1.0 - smoothstep(-2.0, 7.0, sd)) * 0.55;
  vec2 cu = (vLocal + vHalf) / (2.0 * vHalf);
  cu.y = 1.0 - cu.y;
  vec3 ph = mix(vec3(0.20, 0.23, 0.28), vec3(0.11, 0.13, 0.17), cu.y);
  ph *= 1.0 - 0.25 * smoothstep(0.25, 0.75, length(cu - 0.5));
  vec3 img = vReady > 0.0 ? textureLod(uAtlas, mix(vUv.xy, vUv.zw, clamp(cu, 0.0, 1.0)), vLod).rgb : ph;
  vec3 col = mix(ph, img, vReady);
  float bw = lead ? 2.5 : 1.0;
  vec3 bc = lead ? vec3(0.941, 0.894, 0.259) : vec3(0.90, 0.92, 0.95);
  float ba = lead ? 1.0 : 0.75;
  col = mix(col, bc, smoothstep(-bw - 0.6, -bw + 0.4, d) * ba);
  float a = inside + (1.0 - inside) * shadow;
  if (a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(col * inside / max(a, 0.0001), a * vAlpha);
}
`;

export interface CoversOptions {
  scene: THREE.Object3D;
  renderer: THREE.WebGLRenderer;
  indexes: Indexes;
  positions: Record<Level, Float32Array>;
  hidden: Record<Level, Uint8Array | null>;
  animate: boolean;
}

export class CoversLayer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aSize: THREE.InstancedBufferAttribute;
  private readonly aUv: THREE.InstancedBufferAttribute;
  private readonly aMeta: THREE.InstancedBufferAttribute;
  private readonly atlas: CoverAtlas;
  private readonly placeOf: Record<Level, Map<number, number>>;
  private readonly projected: Record<Level, ProjectedPoints>;
  private changes: Record<Level, ChangePoints> | null = null;
  private entries: CoverEntry[] = [];
  private selected: CoverEntry | null = null;
  private hover: CoverEntry | null = null;
  private hoverStart = 0;
  private year = 0;
  private dirty = true;
  private shown = true;
  private readonly t0 = performance.now();
  private readonly tmp = { x: 0, y: 0 };

  constructor(private readonly opts: CoversOptions) {
    const { indexes } = opts;
    this.atlas = new CoverAtlas(opts.renderer, () => this.now());
    const country = new Map<number, number>();
    indexes.countries.forEach((c, i) => c.companyIds.forEach((id) => country.set(id, i)));
    const city = new Map<number, number>();
    indexes.cities.forEach((c, i) => c.companyIds.forEach((id) => city.set(id, i)));
    const company = new Map<number, number>();
    indexes.companies.forEach((c, i) => company.set(c.id, i));
    this.placeOf = { country, city, company };
    this.projected = {
      country: makeProjected(indexes.countries.length),
      city: makeProjected(indexes.cities.length),
      company: makeProjected(indexes.companies.length),
    };

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = inst(3);
    this.aSize = inst(2);
    this.aUv = inst(4);
    this.aMeta = inst(4);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iSize', this.aSize);
    g.setAttribute('iUv', this.aUv);
    g.setAttribute('iMeta', this.aMeta);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uAtlas: { value: this.atlas.texture },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: opts.renderer.getPixelRatio() },
        uTime: { value: 0 },
        uFade: { value: opts.animate ? FADE_S : 0 },
        uHover: { value: -1 },
        uHoverScale: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5.5;
    opts.scene.add(this.mesh);
  }

  private now(): number {
    return (performance.now() - this.t0) / 1000;
  }

  setTimeline(timeline: { minYear: number; maxYear: number }, filter: ReadonlySet<number> | null): void {
    const { indexes } = this.opts;
    const build = (level: Level, n: number) =>
      buildChangePoints(indexes.games, (id) => this.placeOf[level].get(id) ?? -1, n, timeline.minYear, timeline.maxYear, filter);
    this.changes = {
      country: build('country', indexes.countries.length),
      city: build('city', indexes.cities.length),
      company: build('company', indexes.companies.length),
    };
    this.refreshGames();
  }

  setYear(year: number): void {
    this.year = year;
    this.refreshGames();
  }

  private gameAt(level: Level, index: number): number {
    return this.changes ? topGameAt(this.changes[level], index, this.year) : -1;
  }

  private refreshGames(): void {
    for (const e of this.entries) this.assignGame(e, this.gameAt(e.level, e.index));
    this.syncAtlas();
    this.dirty = true;
  }

  private assignGame(e: CoverEntry, gi: number): void {
    e.game = gi;
    e.wantKey = gi >= 0 ? (this.opts.indexes.games[gi]!.cover ?? null) : null;
  }

  private syncAtlas(): void {
    const keys: string[] = [];
    const seen = new Set<string>();
    const add = (k: string | null) => {
      if (k && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    };
    add(this.selected?.wantKey ?? null);
    for (const e of this.entries) add(e.wantKey);
    for (const e of this.entries) add(e.shownKey);
    this.atlas.want(keys);
  }

  select(input: {
    frame: LabelFrame;
    level: Level;
    counts: ArrayLike<number>;
    sticky: boolean;
    obstacles?: readonly Rect[];
  }): CoverEntry[] {
    const { frame, level, counts } = input;
    if (!this.shown) {
      this.entries = [];
      this.hover = null;
      this.syncAtlas();
      this.dirty = true;
      return [];
    }
    const positions = this.opts.positions[level];
    const proj = this.projected[level];
    const hidden = this.opts.hidden[level];
    projectPoints(positions, frame.viewProjection, frame.camera, frame.width, frame.height, proj, MIN_FACING);
    const previous = new Map<number, CoverEntry>();
    for (const e of this.entries) if (e.level === level) previous.set(e.index, e);
    const cands: CoverCandidate[] = [];
    const n = proj.visible.length;
    for (let i = 0; i < n; i++) {
      if (!proj.visible[i] || (hidden && hidden[i])) continue;
      const c = counts[i] ?? 0;
      if (c <= 0) continue;
      cands.push({ index: i, x: proj.x[i]!, y: proj.y[i]!, h: coverHeight(level, c), importance: c, preferred: input.sticky && previous.has(i) });
    }
    const obstacles: Rect[] = [...(input.obstacles ?? [])];
    if (this.selected && this.shown) {
      const sr = this.selectedRect(frame);
      if (sr) obstacles.push(sr);
    }
    const chosen = selectCovers(cands, { w: frame.width, h: frame.height }, obstacles, undefined, level === 'country');
    const now = this.now();
    const next: CoverEntry[] = chosen.map((c) => {
      const old = previous.get(c.index);
      const e: CoverEntry = {
        level,
        index: c.index,
        x: positions[c.index * 3]!,
        y: positions[c.index * 3 + 1]!,
        z: positions[c.index * 3 + 2]!,
        h: c.h,
        count: c.importance,
        game: -1,
        wantKey: null,
        shownKey: old?.shownKey ?? null,
        appearAt: old ? old.appearAt : now,
        lift: 0,
        kind: 0,
        rect: coverRect(c.x, c.y, c.h),
        pill: level === 'country' ? pillRect(c.x, c.y, c.h, c.importance) : null,
      };
      this.assignGame(e, this.gameAt(level, c.index));
      return e;
    });
    if (this.hover && !next.some((e) => e.level === this.hover!.level && e.index === this.hover!.index)) this.hover = null;
    else if (this.hover) this.hover = next.find((e) => e.level === this.hover!.level && e.index === this.hover!.index)!;
    this.entries = next;
    this.syncAtlas();
    this.dirty = true;
    return next;
  }

  coveredMask(level: Level, out: Uint8Array): void {
    out.fill(0);
    for (const e of this.entries) if (e.level === level) out[e.index] = 1;
  }

  rects(): Rect[] {
    const out: Rect[] = [];
    for (const e of this.entries) {
      out.push(e.rect);
      if (e.pill) out.push(e.pill);
    }
    if (this.selected && this.shown && this.selected.rect.w > 0) out.push(this.selected.rect);
    return out;
  }

  pills(level: Level): PillItem[] {
    if (level !== 'country' || !this.shown) return [];
    return this.entries.map((e) => ({
      x: e.x,
      y: e.y,
      z: e.z,
      dx: coverWidth(e.h) / 2 - 2,
      dy: -e.h / 2 + 2,
      text: pillText(e.count),
    }));
  }

  setSelectedGame(game: GameSummary | null, pos: { x: number; y: number; z: number } | null): void {
    if (!game || !pos) {
      this.selected = null;
    } else {
      this.selected = {
        level: 'company',
        index: -1,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        h: SELECTED_H,
        count: 0,
        game: this.opts.indexes.gamePosition.get(game.id) ?? -1,
        wantKey: game.cover ?? null,
        shownKey: null,
        appearAt: this.now(),
        lift: SELECTED_LIFT + SELECTED_H / 2,
        kind: 1,
        rect: { x: 0, y: 0, w: 0, h: 0 },
      };
    }
    this.syncAtlas();
    this.dirty = true;
  }

  private selectedRect(frame: LabelFrame): Rect | null {
    const s = this.selected;
    if (!s || !this.project(s, frame)) return null;
    const r = coverRect(this.tmp.x, this.tmp.y - s.lift, s.h);
    s.rect = r;
    return r;
  }

  updateSelectedRect(frame: LabelFrame): void {
    if (this.selected && !this.selectedRect(frame)) this.selected.rect = { x: 0, y: 0, w: 0, h: 0 };
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    this.mesh.visible = visible;
    if (!visible) this.hover = null;
    this.dirty = true;
  }

  private project(e: { x: number; y: number; z: number }, frame: LabelFrame): boolean {
    const m = frame.viewProjection;
    const c = frame.camera;
    const { x, y, z } = e;
    if (x * c.x + y * c.y + z * c.z <= x * x + y * y + z * z) return false;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (w <= 0) return false;
    this.tmp.x = ((m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w * 0.5 + 0.5) * frame.width;
    this.tmp.y = (1 - ((m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w * 0.5 + 0.5)) * frame.height;
    return true;
  }

  pick(px: number, py: number, frame: LabelFrame): CoverHit | null {
    if (!this.shown) return null;
    const order = this.drawOrder();
    for (let k = order.length - 1; k >= 0; k--) {
      const e = order[k]!;
      if (e.kind !== 0 || !this.project(e, frame)) continue;
      const scale = e === this.hover ? HOVER_SCALE : 1;
      if (hitCover(px, py, this.tmp.x, this.tmp.y, e.h, scale)) {
        return { entry: e, game: e.game >= 0 ? this.opts.indexes.games[e.game]! : null };
      }
    }
    return null;
  }

  setHover(entry: CoverEntry | null): void {
    if (entry === this.hover) return;
    this.hover = entry;
    this.hoverStart = performance.now();
    this.dirty = true;
  }

  private drawOrder(): CoverEntry[] {
    const list = this.entries.filter((e) => e !== this.hover);
    if (this.hover) list.push(this.hover);
    if (this.selected) list.push(this.selected);
    return list;
  }

  frame(viewW: number, viewH: number): void {
    const u = this.material.uniforms;
    u.uTime!.value = this.now();
    (u.uViewport!.value as THREE.Vector2).set(viewW, viewH);
    const t = this.opts.animate ? Math.min(1, (performance.now() - this.hoverStart) / HOVER_MS) : 1;
    u.uHoverScale!.value = 1 + (HOVER_SCALE - 1) * t;
    if (this.atlas.frame()) {
      this.dirty = true;
      u.uAtlas!.value = this.atlas.texture;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.write();
  }

  private write(): void {
    const order = this.drawOrder();
    const pos = this.aPos.array as Float32Array;
    const size = this.aSize.array as Float32Array;
    const uv = this.aUv.array as Float32Array;
    const meta = this.aMeta.array as Float32Array;
    let n = 0;
    for (const e of order) {
      if (n >= CAPACITY) break;
      if (e.wantKey !== e.shownKey && e.wantKey && this.atlas.uv(e.wantKey)) e.shownKey = e.wantKey;
      if (e.wantKey !== e.shownKey && (!e.shownKey || !this.atlas.uv(e.shownKey))) e.shownKey = e.wantKey;
      const key = e.shownKey;
      const rect = key ? this.atlas.uv(key) : null;
      pos[n * 3] = e.x;
      pos[n * 3 + 1] = e.y;
      pos[n * 3 + 2] = e.z;
      size[n * 2] = coverWidth(e.h);
      size[n * 2 + 1] = e.h;
      uv.set(rect ?? [0, 0, 0, 0], n * 4);
      const ready = key && rect ? this.atlas.readyTime(key)! : -1;
      meta[n * 4] = ready >= 0 && ready < e.appearAt ? e.appearAt - 1 : ready;
      meta[n * 4 + 1] = e.appearAt;
      meta[n * 4 + 2] = e.kind;
      meta[n * 4 + 3] = e.lift;
      n++;
    }
    this.geometry.instanceCount = n;
    for (const a of [this.aPos, this.aSize, this.aUv, this.aMeta]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.material.uniforms.uHover!.value = this.hover ? order.indexOf(this.hover) : -1;
  }

  visibleGames(): string[] {
    return this.entries.map((e) => `${e.level}:${e.index}:${e.game >= 0 ? this.opts.indexes.games[e.game]!.id : -1}`);
  }

  loadedCovers(): number {
    let n = 0;
    for (const e of this.entries) if (e.shownKey && this.atlas.uv(e.shownKey)) n++;
    return n;
  }

  coverCount(): number {
    return this.entries.length;
  }

  imagesLoaded(): number {
    return this.atlas.loadedCount();
  }

  dispose(): void {
    this.opts.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
  }
}
