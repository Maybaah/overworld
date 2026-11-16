import type { CountryAnchor } from './placeNames';
import { placeNames, type NameCandidate } from './placeNames';
import { makeProjected, projectPoints, type ProjectedPoints } from './picking';
import type { Rect } from './rectGrid';
import type { LabelFrame, LabelSource } from './labels';

export const COUNTRY_NAMES_ABOVE = 0.8;
export const MAX_NAMES = 45;
const NAME_ALTITUDE = 0.008;
const COUNTRY_PX = 13;
const CITY_PX = 12;
const LINE_PX = 16;
const MIN_FACING = 0.18;
const FONT_FAMILY = 'var(--font-text, system-ui), system-ui, sans-serif';
const HALO = '0 0 2px rgba(5,7,10,0.9)';
const PAD_X = 6;

export interface CityName {
  name: string;
  lat: number;
  lng: number;
}

export interface PillItem {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  text: string;
}

export interface NamesInput {
  frame: LabelFrame;
  altitude: number;
  showCities: boolean;
  cityCounts: ArrayLike<number>;
  obstacles: readonly Rect[];
  cityAround(index: number, x: number, y: number): Rect | null;
  sticky: boolean;
}

interface Follower {
  el: HTMLElement;
  pos: Float32Array;
  dx: number;
  dy: number;
  center: boolean;
}

function toWorld(source: LabelSource, items: readonly { lat: number; lng: number }[]): Float32Array {
  const out = new Float32Array(items.length * 3);
  items.forEach((it, i) => {
    const p = source.getCoords(it.lat, it.lng, NAME_ALTITUDE);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  });
  return out;
}

function projectOne(pos: Float32Array, frame: LabelFrame, out: { x: number; y: number }): boolean {
  const m = frame.viewProjection;
  const px = pos[0]!;
  const py = pos[1]!;
  const pz = pos[2]!;
  const c = frame.camera;
  if (px * c.x + py * c.y + pz * c.z <= px * px + py * py + pz * pz) return false;
  const w = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]!;
  if (w <= 0) return false;
  out.x = ((m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!) / w * 0.5 + 0.5) * frame.width;
  out.y = (1 - ((m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!) / w * 0.5 + 0.5)) * frame.height;
  return true;
}

export class MapLabels {
  private readonly countryPos: Float32Array;
  private readonly cityPos: Float32Array;
  private readonly countryProj: ProjectedPoints;
  private readonly cityProj: ProjectedPoints;
  private readonly widths = new Map<string, number>();
  private readonly ctx: CanvasRenderingContext2D | null;
  private family = 'system-ui, sans-serif';
  private readonly namePool: HTMLElement[] = [];
  private readonly pillPool: HTMLElement[] = [];
  private names: Follower[] = [];
  private pills: Follower[] = [];
  private placedIds = new Set<string>();
  private readonly tmp = { x: 0, y: 0 };
  private pillsVisible = true;

  constructor(
    private readonly root: HTMLElement,
    source: LabelSource,
    private readonly countries: readonly CountryAnchor[],
    private readonly cities: readonly CityName[],
    private readonly animate: boolean,
  ) {
    this.countryPos = toWorld(source, countries);
    this.cityPos = toWorld(source, cities);
    this.countryProj = makeProjected(countries.length);
    this.cityProj = makeProjected(cities.length);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
    const probe = this.makeName();
    this.family = getComputedStyle(probe).fontFamily || this.family;
    this.namePool.push(probe);
  }

  private makeName(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      `font-family:${FONT_FAMILY}`,
      'font-weight:500',
      `line-height:${LINE_PX}px`,
      'color:#f2f5f9',
      `text-shadow:${HALO}`,
      `padding:0 ${PAD_X}px`,
      'border-radius:4px',
      'background:rgba(9,9,11,0.74)',
      'white-space:nowrap',
      'pointer-events:none',
      'opacity:0',
      this.animate ? 'transition:opacity 160ms' : '',
      'will-change:transform',
    ].join(';');
    this.root.appendChild(el);
    return el;
  }

  private makePill(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'font:500 11px/15px var(--font-mono, ui-monospace), ui-monospace, monospace',
      'color:#eef1f5',
      'background:rgba(7,9,13,0.88)',
      'border:1px solid rgba(230,233,239,0.35)',
      'border-radius:8px',
      'padding:0 5px',
      'white-space:nowrap',
      'pointer-events:none',
      'opacity:0',
      'will-change:transform',
    ].join(';');
    this.root.appendChild(el);
    return el;
  }

  private width(text: string, px: number): number {
    const key = `${px}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      if (this.ctx) {
        this.ctx.font = `500 ${px}px ${this.family}`;
        w = Math.ceil(this.ctx.measureText(text).width) + 2 + 2 * PAD_X;
      } else w = Math.ceil(text.length * px * 0.55) + 2 * PAD_X;
      this.widths.set(key, w);
    }
    return w;
  }

  layout(input: NamesInput): void {
    const { frame } = input;
    const cands: (NameCandidate & { text: string; px: number; pos: Float32Array })[] = [];
    const prefer = input.sticky ? this.placedIds : null;
    const boost = (id: string) => (prefer?.has(id) ? -1e7 : 0);
    if (input.altitude > COUNTRY_NAMES_ABOVE) {
      projectPoints(this.countryPos, frame.viewProjection, frame.camera, frame.width, frame.height, this.countryProj, MIN_FACING);
      this.countries.forEach((c, i) => {
        if (!this.countryProj.visible[i]) return;
        const id = `k:${c.id}`;
        cands.push({
          id,
          x: this.countryProj.x[i]!,
          y: this.countryProj.y[i]!,
          w: this.width(c.name, COUNTRY_PX),
          h: LINE_PX,
          priority: i + boost(id),
          text: c.name,
          px: COUNTRY_PX,
          pos: this.countryPos.subarray(i * 3, i * 3 + 3),
        });
      });
    }
    if (input.showCities) {
      projectPoints(this.cityPos, frame.viewProjection, frame.camera, frame.width, frame.height, this.cityProj, MIN_FACING / 2);
      const counts = input.cityCounts;
      const order: number[] = [];
      for (let i = 0; i < this.cities.length; i++) {
        if (this.cityProj.visible[i] && (counts[i] ?? 0) > 0) order.push(i);
      }
      order.sort((a, b) => counts[b]! - counts[a]!);
      order.forEach((i, rank) => {
        const c = this.cities[i]!;
        const id = `y:${i}`;
        const x = this.cityProj.x[i]!;
        const y = this.cityProj.y[i]!;
        cands.push({
          id,
          x,
          y,
          w: this.width(c.name, CITY_PX),
          h: LINE_PX,
          priority: 10000 + rank + boost(id),
          around: input.cityAround(i, x, y) ?? undefined,
          text: c.name,
          px: CITY_PX,
          pos: this.cityPos.subarray(i * 3, i * 3 + 3),
        });
      });
    }
    const placed = placeNames(cands, input.obstacles, { w: frame.width, h: frame.height }, MAX_NAMES);
    const byId = new Map(cands.map((c) => [c.id, c]));
    const next: Follower[] = [];
    let k = 0;
    for (const [id, r] of placed) {
      const c = byId.get(id)!;
      let el = this.namePool[k];
      if (!el) this.namePool.push((el = this.makeName()));
      k++;
      if (el.textContent !== c.text) el.textContent = c.text;
      const size = `${c.px}px`;
      if (el.style.fontSize !== size) el.style.fontSize = size;
      el.style.transform = `translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
      el.style.opacity = '1';
      next.push({ el, pos: c.pos, dx: r.x - c.x, dy: r.y - c.y, center: false });
    }
    for (let i = k; i < this.namePool.length; i++) this.namePool[i]!.style.opacity = '0';
    this.names = next;
    this.placedIds = new Set(placed.keys());
  }

  setPills(items: readonly PillItem[], frame: LabelFrame): void {
    const next: Follower[] = [];
    items.forEach((it, i) => {
      let el = this.pillPool[i];
      if (!el) this.pillPool.push((el = this.makePill()));
      if (el.textContent !== it.text) el.textContent = it.text;
      next.push({ el, pos: Float32Array.of(it.x, it.y, it.z), dx: it.dx, dy: it.dy, center: true });
    });
    for (let i = items.length; i < this.pillPool.length; i++) this.pillPool[i]!.style.opacity = '0';
    this.pills = next;
    this.move(this.pills, frame, this.pillsVisible);
  }

  follow(frame: LabelFrame): void {
    this.move(this.names, frame, true);
    this.move(this.pills, frame, this.pillsVisible);
  }

  setPillsVisible(visible: boolean): void {
    this.pillsVisible = visible;
    if (!visible) for (const p of this.pills) p.el.style.opacity = '0';
  }

  placedCount(): number {
    return this.names.length;
  }

  private move(list: readonly Follower[], frame: LabelFrame, show: boolean): void {
    const t = this.tmp;
    for (const f of list) {
      if (!show || !projectOne(f.pos, frame, t)) {
        f.el.style.opacity = '0';
        continue;
      }
      const x = t.x + f.dx;
      const y = t.y + f.dy;
      f.el.style.transform = f.center
        ? `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`
        : `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      f.el.style.opacity = '1';
    }
  }

  dispose(): void {
    for (const el of this.namePool) el.remove();
    for (const el of this.pillPool) el.remove();
    this.namePool.length = 0;
    this.pillPool.length = 0;
    this.names = [];
    this.pills = [];
  }
}
