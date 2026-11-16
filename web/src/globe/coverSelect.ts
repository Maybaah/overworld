import type { Level } from './levels';
import { RectGrid, type Rect } from './rectGrid';

export const COVER_MIN_H = 28;
export const COVER_MAX_H = 64;
export const COVER_ASPECT = 90 / 128;
export const MAX_COVERS = 150;
export const COVER_GAP = 3;

const REF: Record<Level, number> = { country: 2000, city: 400, company: 60 };

export function coverHeight(level: Level, count: number): number {
  if (!(count > 0)) return 0;
  const t = Math.min(1, Math.sqrt(count / REF[level]));
  return COVER_MIN_H + (COVER_MAX_H - COVER_MIN_H) * t;
}

export function coverWidth(height: number): number {
  return height * COVER_ASPECT;
}

export function coverRect(x: number, y: number, h: number, scale = 1): Rect {
  const hh = h * scale;
  const w = coverWidth(hh);
  return { x: x - w / 2, y: y - hh / 2, w, h: hh };
}

export const PILL_H = 17;
const PILL_CHAR = 6.7;
const PILL_PAD = 12;

export function pillText(count: number): string {
  return count.toLocaleString('en-US');
}

export function pillRect(x: number, y: number, h: number, count: number): Rect {
  const w = pillText(count).length * PILL_CHAR + PILL_PAD;
  const cx = x + coverWidth(h) / 2 - 2;
  const cy = y - h / 2 + 2;
  return { x: cx - w / 2, y: cy - PILL_H / 2, w, h: PILL_H };
}

export interface CoverCandidate {
  index: number;
  x: number;
  y: number;
  h: number;
  importance: number;
  preferred?: boolean;
}

export function selectCovers(
  candidates: readonly CoverCandidate[],
  view: { w: number; h: number },
  obstacles: readonly Rect[] = [],
  max = MAX_COVERS,
  withPills = false,
): CoverCandidate[] {
  const order = candidates
    .filter((c) => c.h > 0 && c.x >= 0 && c.y >= 0 && c.x <= view.w && c.y <= view.h)
    .sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred) || b.importance - a.importance || a.index - b.index);
  const grid = new RectGrid(64, COVER_GAP);
  for (const o of obstacles) grid.add(o);
  const out: CoverCandidate[] = [];
  for (const c of order) {
    if (out.length >= max) break;
    const r = coverRect(c.x, c.y, c.h);
    if (grid.hits(r)) continue;
    const p = withPills ? pillRect(c.x, c.y, c.h, c.importance) : null;
    if (p && grid.hits(p)) continue;
    grid.add(r);
    if (p) grid.add(p);
    out.push(c);
  }
  return out;
}

export function hitCover(px: number, py: number, x: number, y: number, h: number, scale = 1): boolean {
  const r = coverRect(x, y, h, scale);
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
