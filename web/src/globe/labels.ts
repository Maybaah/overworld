import { placeLabels, type LabelCandidate, type LabelMode } from './labelPlacement';
import { makeProjected, projectPoints, type ProjectedPoints } from './picking';

export interface LabelItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  mode: LabelMode;
  priority: number;
  radius: number;
}

interface Entry {
  item: LabelItem;
  el: HTMLElement;
  w: number;
  h: number;
}

export interface LabelFrame {
  viewProjection: ArrayLike<number>;
  camera: { x: number; y: number; z: number };
  width: number;
  height: number;
}

export interface LabelSource {
  getCoords(lat: number, lng: number, altitude?: number): { x: number; y: number; z: number };
}

const LABEL_ALTITUDE = 0.012;
const SETTLE_MS = 140;

export class LabelManager {
  private entries: Entry[] = [];
  private positions = new Float32Array(0);
  private projected: ProjectedPoints = makeProjected(0);
  private offsets = new Map<string, { dx: number; dy: number }>();
  private hoverId: string | null = null;
  private dirty = true;
  private lastMove = 0;
  private width = 0;
  private height = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly source: LabelSource,
  ) {}

  setItems(items: readonly LabelItem[]): void {
    for (const e of this.entries) e.el.remove();
    this.entries = items.map((item) => {
      const el = document.createElement('div');
      el.textContent = item.name;
      el.style.cssText = [
        'position:absolute',
        'left:0',
        'top:0',
        `color:${item.color}`,
        'font:600 11px/14px system-ui,sans-serif',
        'white-space:nowrap',
        'pointer-events:none',
        'text-shadow:0 0 3px #07090d,0 0 6px #07090d',
        'opacity:0',
        'transition:opacity 120ms',
        'will-change:transform',
      ].join(';');
      this.root.appendChild(el);
      return { item, el, w: el.offsetWidth, h: el.offsetHeight };
    });
    this.positions = new Float32Array(items.length * 3);
    items.forEach((item, i) => {
      const p = this.source.getCoords(item.lat, item.lng, LABEL_ALTITUDE);
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
    });
    this.projected = makeProjected(items.length);
    this.offsets = new Map();
    this.hoverId = null;
    this.dirty = true;
    this.lastMove = 0;
  }

  setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.dirty = true;
    this.lastMove = 0;
  }

  nearest(x: number, y: number, maxDist: number): string | null {
    let best: string | null = null;
    let bestD2 = maxDist * maxDist;
    this.entries.forEach((e, i) => {
      if (!this.projected.visible[i]) return;
      const dx = this.projected.x[i]! - x;
      const dy = this.projected.y[i]! - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = e.item.id;
      }
    });
    return best;
  }

  tick(frame: LabelFrame, moved: boolean, now: number): void {
    if (this.entries.length === 0) return;
    if (frame.width !== this.width || frame.height !== this.height) {
      this.width = frame.width;
      this.height = frame.height;
      this.dirty = true;
      this.lastMove = 0;
    }
    if (moved) {
      this.lastMove = now;
      this.dirty = true;
    }
    if (!moved && !this.dirty) return;

    projectPoints(this.positions, frame.viewProjection, frame.camera, frame.width, frame.height, this.projected);
    const settled = now - this.lastMove >= SETTLE_MS;
    if (settled && this.dirty) {
      const candidates: LabelCandidate[] = this.entries.map((e, i) => ({
        id: e.item.id,
        x: this.projected.x[i]!,
        y: this.projected.y[i]!,
        w: e.w,
        h: e.h,
        radius: e.item.radius,
        mode: e.item.mode,
        priority: e.item.priority,
        visible: this.projected.visible[i] === 1,
      }));
      const placed = placeLabels(candidates, { w: frame.width, h: frame.height }, this.hoverId);
      this.offsets = new Map();
      this.entries.forEach((e, i) => {
        const p = placed.get(e.item.id);
        if (p) this.offsets.set(e.item.id, { dx: p.x - this.projected.x[i]!, dy: p.y - this.projected.y[i]! });
      });
      this.dirty = false;
    }
    this.apply();
  }

  private apply(): void {
    this.entries.forEach((e, i) => {
      const off = this.offsets.get(e.item.id);
      if (!off || !this.projected.visible[i]) {
        e.el.style.opacity = '0';
        return;
      }
      e.el.style.opacity = '1';
      e.el.style.transform = `translate(${this.projected.x[i]! + off.dx}px, ${this.projected.y[i]! + off.dy}px)`;
    });
  }

  obstacles(): { x: number; y: number; w: number; h: number }[] {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    this.entries.forEach((e, i) => {
      if (!this.projected.visible[i]) return;
      const x = this.projected.x[i]!;
      const y = this.projected.y[i]!;
      const r = e.item.radius;
      out.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
      const off = this.offsets.get(e.item.id);
      if (off) out.push({ x: x + off.dx, y: y + off.dy, w: e.w, h: e.h });
    });
    return out;
  }

  dispose(): void {
    for (const e of this.entries) e.el.remove();
    this.entries = [];
  }
}
