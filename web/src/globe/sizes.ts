import type { Level } from './levels';

export const NO_YEAR = 32767;
export const ZERO_DOT_PX = 3.5;

const SIZE_PX: Record<Level, { min: number; max: number; ref: number }> = {
  country: { min: 6, max: 10, ref: 2000 },
  city: { min: 5, max: 9, ref: 400 },
  company: { min: 4.5, max: 8, ref: 60 },
};

export function sizeFor(level: Level, count: number): number {
  if (!(count > 0)) return 0;
  const p = SIZE_PX[level];
  const t = Math.min(1, Math.sqrt(count / p.ref));
  return p.min + (p.max - p.min) * t;
}

export interface LevelBuffers {
  level: Level;
  size: Float32Array;
  lead: Float32Array;
  firstYear?: Int16Array;
  hidden?: Uint8Array;
  showIdle?: boolean;
}

export function applyYear(buf: LevelBuffers, counts: ArrayLike<number>, year: number): number {
  const { level, size, lead, firstYear, hidden } = buf;
  const showIdle = buf.showIdle !== false;
  const n = size.length;
  let visible = 0;
  if (level !== 'company' || !firstYear || !hidden) {
    for (let i = 0; i < n; i++) {
      const s = sizeFor(level, counts[i]!);
      size[i] = s;
      lead[i] = 1;
      if (s > 0) visible++;
    }
    return visible;
  }
  for (let i = 0; i < n; i++) {
    if (hidden[i]) {
      size[i] = 0;
      continue;
    }
    const c = counts[i]!;
    if (c > 0) {
      size[i] = sizeFor('company', c);
      lead[i] = 1;
      visible++;
    } else if (showIdle && firstYear[i]! <= year) {
      size[i] = ZERO_DOT_PX;
      lead[i] = 0;
      visible++;
    } else {
      size[i] = 0;
    }
  }
  return visible;
}
