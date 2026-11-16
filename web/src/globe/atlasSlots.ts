export interface AtlasLayout {
  size: number; // width
  height?: number; // defaults to size
  slotW: number;
  slotH: number;
  imageW: number;
  imageH: number;
}

export const ATLAS: AtlasLayout = { size: 2048, slotW: 128, slotH: 160, imageW: 90, imageH: 128 };

export function atlasHeight(a: AtlasLayout): number {
  return a.height ?? a.size;
}

export function slotCount(a: AtlasLayout = ATLAS): number {
  return Math.floor(a.size / a.slotW) * Math.floor(atlasHeight(a) / a.slotH);
}

export function slotOrigin(slot: number, a: AtlasLayout = ATLAS): { x: number; y: number } {
  const cols = Math.floor(a.size / a.slotW);
  const x = (slot % cols) * a.slotW + Math.floor((a.slotW - a.imageW) / 2);
  const y = Math.floor(slot / cols) * a.slotH + Math.floor((a.slotH - a.imageH) / 2);
  return { x, y };
}

export function slotUv(slot: number, a: AtlasLayout = ATLAS): [number, number, number, number] {
  const o = slotOrigin(slot, a);
  const w = a.size;
  const h = atlasHeight(a);
  return [(o.x + 0.5) / w, (o.y + 0.5) / h, (o.x + a.imageW - 0.5) / w, (o.y + a.imageH - 0.5) / h];
}

export class SlotCache<K> {
  private readonly order = new Map<K, number>();
  private readonly free: number[] = [];

  constructor(readonly capacity: number) {
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
  }

  get size(): number {
    return this.order.size;
  }

  peek(key: K): number | undefined {
    return this.order.get(key);
  }

  touch(key: K): number | undefined {
    const slot = this.order.get(key);
    if (slot === undefined) return undefined;
    this.order.delete(key);
    this.order.set(key, slot);
    return slot;
  }

  acquire(key: K, pinned: (k: K) => boolean): { slot: number; evicted: K | null } | null {
    const have = this.touch(key);
    if (have !== undefined) return { slot: have, evicted: null };
    const slot = this.free.pop();
    if (slot !== undefined) {
      this.order.set(key, slot);
      return { slot, evicted: null };
    }
    for (const [k, s] of this.order) {
      if (pinned(k)) continue;
      this.order.delete(k);
      this.order.set(key, s);
      return { slot: s, evicted: k };
    }
    return null;
  }

  delete(key: K): void {
    const slot = this.order.get(key);
    if (slot === undefined) return;
    this.order.delete(key);
    this.free.push(slot);
  }
}
