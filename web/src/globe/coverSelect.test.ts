import { describe, expect, it } from 'vitest';
import { COVER_ASPECT, COVER_MAX_H, COVER_MIN_H, coverHeight, coverRect, hitCover, pillRect, selectCovers, type CoverCandidate } from './coverSelect';
import { overlaps } from './rectGrid';

describe('coverHeight', () => {
  it('is zero without games and clamped to 28..64 px otherwise', () => {
    expect(coverHeight('country', 0)).toBe(0);
    expect(coverHeight('country', 1)).toBeGreaterThanOrEqual(COVER_MIN_H);
    expect(coverHeight('country', 1e7)).toBe(COVER_MAX_H);
    expect(coverHeight('company', 1e4)).toBe(COVER_MAX_H);
  });

  it('grows with the square root of games led', () => {
    const a = coverHeight('city', 25) - COVER_MIN_H;
    const b = coverHeight('city', 100) - COVER_MIN_H;
    expect(b / a).toBeCloseTo(2, 5);
  });

  it('keeps the 90:128 cover aspect', () => {
    const r = coverRect(100, 100, 64);
    expect(r.w / r.h).toBeCloseTo(COVER_ASPECT);
    expect(r.x + r.w / 2).toBe(100);
  });
});

const c = (index: number, x: number, y: number, importance: number, h = 40, preferred = false): CoverCandidate => ({ index, x, y, h, importance, preferred });
const view = { w: 1000, h: 800 };

describe('selectCovers', () => {
  it('gives the most important place the cover and drops overlapping ones', () => {
    const out = selectCovers([c(1, 100, 100, 5), c(2, 110, 110, 50), c(3, 400, 100, 1)], view);
    expect(out.map((o) => o.index)).toEqual([2, 3]);
  });

  it('never returns overlapping covers, even with many candidates', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const cands = Array.from({ length: 3000 }, (_, i) => c(i, rnd() * 1000, rnd() * 800, rnd() * 1000, 28 + rnd() * 36));
    const out = selectCovers(cands, view);
    expect(out.length).toBeGreaterThan(20);
    expect(out.length).toBeLessThanOrEqual(150);
    const rects = out.map((o) => coverRect(o.x, o.y, o.h));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
  });

  it('caps the number of covers', () => {
    const grid = Array.from({ length: 400 }, (_, i) => c(i, 20 + (i % 20) * 48, 20 + Math.floor(i / 20) * 40, i, 30));
    expect(selectCovers(grid, view, [], 150)).toHaveLength(150);
  });

  it('keeps previously shown covers first while the camera moves', () => {
    const out = selectCovers([c(1, 100, 100, 5, 40, true), c(2, 110, 110, 50)], view);
    expect(out.map((o) => o.index)).toEqual([1]);
  });

  it('skips places off screen and keeps clear of obstacles', () => {
    const out = selectCovers([c(1, -10, 100, 9), c(2, 300, 300, 1)], view, [{ x: 290, y: 290, w: 20, h: 20 }]);
    expect(out).toHaveLength(0);
  });
});

describe('count pills', () => {
  it('sit on the top-right corner and widen with the number', () => {
    const cover = coverRect(200, 200, 40);
    const p = pillRect(200, 200, 40, 7);
    expect(p.x + p.w / 2).toBeCloseTo(cover.x + cover.w - 2);
    expect(p.y + p.h / 2).toBeCloseTo(cover.y + 2);
    expect(pillRect(200, 200, 40, 2586).w).toBeGreaterThan(p.w);
  });

  it('keep a neighbour cover off the pill when asked', () => {
    const a = c(1, 200, 200, 2586, 40);
    const b = c(2, 236, 182, 1, 28);
    expect(selectCovers([a, b], view).map((o) => o.index)).toEqual([1, 2]);
    expect(selectCovers([a, b], view, [], 150, true).map((o) => o.index)).toEqual([1]);
  });
});

describe('hitCover', () => {
  it('picks by the cover rectangle, including hover growth', () => {
    expect(hitCover(100 + 13, 100, 100, 100, 40)).toBe(true);
    expect(hitCover(100 + 15, 100, 100, 100, 40)).toBe(false);
    expect(hitCover(100 + 15, 100, 100, 100, 40, 1.25)).toBe(true);
    expect(hitCover(100, 100 + 21, 100, 100, 40)).toBe(false);
  });
});
