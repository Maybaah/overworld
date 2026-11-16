export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

export class RectGrid {
  private readonly cells = new Map<number, Rect[]>();

  constructor(
    private readonly cell = 64,
    private readonly pad = 0,
  ) {}

  private range(r: Rect, fn: (key: number) => boolean | void): boolean {
    const c = this.cell;
    const x0 = Math.floor((r.x - this.pad) / c);
    const x1 = Math.floor((r.x + r.w + this.pad) / c);
    const y0 = Math.floor((r.y - this.pad) / c);
    const y1 = Math.floor((r.y + r.h + this.pad) / c);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) if (fn(gx * 65536 + gy) === true) return true;
    }
    return false;
  }

  hits(r: Rect): boolean {
    return this.range(r, (k) => {
      const list = this.cells.get(k);
      if (!list) return false;
      for (const o of list) if (overlaps(r, o, this.pad)) return true;
      return false;
    });
  }

  add(r: Rect): void {
    this.range(r, (k) => {
      const list = this.cells.get(k);
      if (list) list.push(r);
      else this.cells.set(k, [r]);
    });
  }
}

export function insideView(r: Rect, view: { w: number; h: number }, margin = 0): boolean {
  return r.x >= margin && r.y >= margin && r.x + r.w <= view.w - margin && r.y + r.h <= view.h - margin;
}
