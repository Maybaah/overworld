export interface Pov {
  lat: number;
  lng: number;
  altitude: number;
}

export interface PovTarget {
  pointOfView(): Pov;
  pointOfView(pov: Pov, ms: number): unknown;
}

export const MIN_ALTITUDE = 0.035;
export const MAX_ALTITUDE = 2.4;
const MAX_LAT = 85;
const ZOOM_PER_PIXEL = 0.0016;
const ZOOM_TAU = 0.12;
const SPIN_TAU = 0.32;
const HOLD_TAU = 0.05;
const AUTO_DEG_PER_S = 2.2;
const MAX_DEG_PER_PX = 0.45;
const KEY_PAN_PX = 140;
const KEY_ZOOM = 0.45;

export type NavCommand = { kind: 'zoom'; amount: number } | { kind: 'home' };
export const navBus = new EventTarget();
export function sendNav(cmd: NavCommand): void {
  navBus.dispatchEvent(new CustomEvent<NavCommand>('nav', { detail: cmd }));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function degreesPerPixel(altitude: number, fovDeg: number, heightPx: number): number {
  const rad = (2 * altitude * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, heightPx);
  return Math.min(MAX_DEG_PER_PX, (rad * 180) / Math.PI);
}

export interface Step {
  panX: number;
  panY: number;
  zoom: number;
  dragging: boolean;
}

export interface Motion {
  spinLat: number;
  spinLng: number;
  zoomTarget: number | null;
}

export function advance(pov: Pov, input: Step, motion: Motion, dt: number, fovDeg: number, heightPx: number): Pov | null {
  let { lat, lng, altitude } = pov;
  let moved = false;
  const k = degreesPerPixel(altitude, fovDeg, heightPx);
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  if (input.panX !== 0 || input.panY !== 0) {
    const dLat = input.panY * k;
    const dLng = (-input.panX * k) / cosLat;
    lat += dLat;
    lng += dLng;
    const w = Math.min(1, dt / HOLD_TAU);
    const step = Math.max(dt, 1 / 240);
    motion.spinLat = motion.spinLat * (1 - w) + (dLat / step) * w;
    motion.spinLng = motion.spinLng * (1 - w) + (dLng / step) * w;
    moved = true;
  } else if (!input.dragging && Math.hypot(motion.spinLat, motion.spinLng) > 0.01) {
    lat += motion.spinLat * dt;
    lng += motion.spinLng * dt;
    const decay = Math.exp(-dt / SPIN_TAU);
    motion.spinLat *= decay;
    motion.spinLng *= decay;
    moved = true;
  } else if (input.dragging) {
    const decay = Math.exp(-dt / HOLD_TAU);
    motion.spinLat *= decay;
    motion.spinLng *= decay;
  }
  if (input.zoom !== 0) {
    const base = motion.zoomTarget ?? Math.log(altitude);
    motion.zoomTarget = clamp(base + input.zoom, Math.log(MIN_ALTITUDE), Math.log(MAX_ALTITUDE));
  }
  if (motion.zoomTarget !== null) {
    const cur = Math.log(altitude);
    const next = cur + (motion.zoomTarget - cur) * (1 - Math.exp(-dt / ZOOM_TAU));
    altitude = Math.exp(next);
    if (Math.abs(motion.zoomTarget - next) < 1e-4) {
      altitude = Math.exp(motion.zoomTarget);
      motion.zoomTarget = null;
    }
    moved = true;
  }
  if (!moved) return null;
  lat = clamp(lat, -MAX_LAT, MAX_LAT);
  if (Math.abs(lat) >= MAX_LAT) motion.spinLat = 0;
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat, lng, altitude: clamp(altitude, MIN_ALTITUDE, MAX_ALTITUDE) };
}

export class GlobeControls {
  private readonly input: Step = { panX: 0, panY: 0, zoom: 0, dragging: false };
  private readonly motion: Motion = { spinLat: 0, spinLng: 0, zoomTarget: null };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private auto: boolean;
  private fov = 50;
  private height = 800;
  private readonly detach: () => void;

  constructor(
    private readonly el: HTMLElement,
    private readonly target: PovTarget,
    autoRotate: boolean,
    private readonly onInput: () => void = () => {},
  ) {
    this.auto = autoRotate;
    el.style.cursor = 'grab';
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch = this.spread();
      this.input.dragging = true;
      this.touched();
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size >= 2) {
        const d = this.spread();
        if (this.pinch > 0 && d > 0) this.input.zoom += Math.log(this.pinch / d);
        this.pinch = d;
        this.input.panX += dx / 2;
        this.input.panY += dy / 2;
      } else {
        this.input.panX += dx;
        this.input.panY += dy;
      }
    };
    const up = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size < 2) this.pinch = 0;
      if (this.pointers.size === 0) {
        this.input.dragging = false;
        el.style.cursor = 'grab';
      }
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
      const step: Record<string, () => void> = {
        ArrowLeft: () => this.panBy(KEY_PAN_PX, 0),
        ArrowRight: () => this.panBy(-KEY_PAN_PX, 0),
        ArrowUp: () => this.panBy(0, KEY_PAN_PX),
        ArrowDown: () => this.panBy(0, -KEY_PAN_PX),
        '+': () => this.zoomBy(-KEY_ZOOM),
        '=': () => this.zoomBy(-KEY_ZOOM),
        '-': () => this.zoomBy(KEY_ZOOM),
        _: () => this.zoomBy(KEY_ZOOM),
      };
      const fn = step[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      this.input.zoom += clamp(e.deltaY * unit, -240, 240) * ZOOM_PER_PIXEL;
      this.touched();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    this.detach = () => {
      window.removeEventListener('keydown', key);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }

  stop(): void {
    this.auto = false;
    this.motion.spinLat = 0;
    this.motion.spinLng = 0;
    this.motion.zoomTarget = null;
    this.input.panX = 0;
    this.input.panY = 0;
    this.input.zoom = 0;
  }

  zoomBy(amount: number): void {
    this.input.zoom += amount;
    this.touched();
  }

  panBy(dxPx: number, dyPx: number): void {
    const pov = this.target.pointOfView();
    const k = degreesPerPixel(pov.altitude, this.fov, this.height);
    const cosLat = Math.max(0.2, Math.cos((pov.lat * Math.PI) / 180));
    this.motion.spinLat += (dyPx * k) / SPIN_TAU;
    this.motion.spinLng += (-dxPx * k) / cosLat / SPIN_TAU;
    this.touched();
  }

  update(dt: number, fovDeg: number, heightPx: number): boolean {
    this.fov = fovDeg;
    this.height = heightPx;
    const pov = this.target.pointOfView();
    let next = advance(pov, this.input, this.motion, dt, fovDeg, heightPx);
    this.input.panX = 0;
    this.input.panY = 0;
    this.input.zoom = 0;
    if (!next && this.auto) next = { ...pov, lng: pov.lng + AUTO_DEG_PER_S * dt };
    if (!next) return false;
    this.target.pointOfView(next, 0);
    return true;
  }

  dispose(): void {
    this.detach();
  }

  private touched(): void {
    this.auto = false;
    this.onInput();
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

export function screenToGeo(
  camera: { position: { x: number; y: number; z: number }; projectionMatrixInverse: ArrayLike<number> | { elements: ArrayLike<number> }; matrixWorld: { elements: ArrayLike<number> } },
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): { lat: number; lng: number } | null {
  const pi = 'elements' in camera.projectionMatrixInverse ? camera.projectionMatrixInverse.elements : camera.projectionMatrixInverse;
  const nx = (x / width) * 2 - 1;
  const ny = 1 - (y / height) * 2;
  const vx = pi[0]! * nx + pi[4]! * ny + pi[8]! * 0.5 + pi[12]!;
  const vy = pi[1]! * nx + pi[5]! * ny + pi[9]! * 0.5 + pi[13]!;
  const vz = pi[2]! * nx + pi[6]! * ny + pi[10]! * 0.5 + pi[14]!;
  const vw = pi[3]! * nx + pi[7]! * ny + pi[11]! * 0.5 + pi[15]!;
  const m = camera.matrixWorld.elements;
  const px = vx / vw;
  const py = vy / vw;
  const pz = vz / vw;
  const wx = m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!;
  const wy = m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!;
  const wz = m[2]! * px + m[6]! * py + m[10]! * pz + m[14]!;
  const o = camera.position;
  let dx = wx - o.x;
  let dy = wy - o.y;
  let dz = wz - o.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  const b = o.x * dx + o.y * dy + o.z * dz;
  const c = o.x * o.x + o.y * o.y + o.z * o.z - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  const hx = o.x + dx * t;
  const hy = o.y + dy * t;
  const hz = o.z + dz * t;
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, hy / radius))) * 180) / Math.PI;
  let lng = 90 - (Math.atan2(hz, hx) * 180) / Math.PI;
  if (lng > 180) lng -= 360;
  return { lat, lng };
}
