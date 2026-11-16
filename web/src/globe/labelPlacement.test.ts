import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelCandidate } from './labelPlacement';

function cand(id: string, x: number, y: number, over: Partial<LabelCandidate> = {}): LabelCandidate {
  return { id, x, y, w: 80, h: 14, radius: 8, mode: 'auto', priority: 1, visible: true, ...over };
}

const view = { w: 1000, h: 800 };

describe('placeLabels', () => {
  it('always shows the lead label beside its marker, not on top of it', () => {
    const lead = cand('lead', 500, 400, { mode: 'always', radius: 15, priority: 0 });
    const p = placeLabels([lead], view).get('lead')!;
    expect(p.x).toBeGreaterThanOrEqual(500 + 15);
    expect(p.y).toBeLessThan(400);
    expect(p.y + 14).toBeGreaterThan(400);
  });

  it('gives the most important label its preferred side and keeps the next one clear of it', () => {
    const a = cand('a', 300, 300, { priority: 1 });
    const b = cand('b', 300, 304, { priority: 2 });
    const placed = placeLabels([b, a], view);
    expect(placed.get('a')).toEqual({ x: 312, y: 293 });
    const pb = placed.get('b');
    if (pb) expect(pb.x + 80 <= 312 || pb.x >= 392 || pb.y + 14 <= 293 || pb.y >= 307).toBe(true);
  });

  it('does not place a label over another marker', () => {
    const a = cand('a', 300, 300, { priority: 1 });
    const blocker = cand('m', 352, 300, { mode: 'hover', radius: 10 });
    const p = placeLabels([a, blocker], view).get('a')!;
    const nx = Math.max(p.x, Math.min(352, p.x + 80));
    const ny = Math.max(p.y, Math.min(300, p.y + 14));
    expect(Math.hypot(nx - 352, ny - 300)).toBeGreaterThanOrEqual(10);
  });

  it('falls back to another side when the right side is taken', () => {
    const a = cand('a', 300, 300, { priority: 1, mode: 'always' });
    const b = cand('b', 400, 300, { priority: 2 });
    const placed = placeLabels([a, b], view);
    expect(placed.has('b')).toBe(true);
    const pa = placed.get('a')!;
    const pb = placed.get('b')!;
    const overlap = pa.x < pb.x + 80 && pb.x < pa.x + 80 && pa.y < pb.y + 14 && pb.y < pa.y + 14;
    expect(overlap).toBe(false);
  });

  it('never shows hidden (far side) candidates', () => {
    const a = cand('a', 300, 300, { visible: false });
    expect(placeLabels([a], view).size).toBe(0);
  });

  it('shows a hover-only label only while hovered', () => {
    const h = cand('h', 300, 300, { mode: 'hover' });
    expect(placeLabels([h], view).has('h')).toBe(false);
    expect(placeLabels([h], view, 'h').has('h')).toBe(true);
  });

  it('keeps labels inside the viewport', () => {
    const edge = cand('e', 990, 400, { mode: 'always' });
    const p = placeLabels([edge], view).get('e')!;
    expect(p.x + 80).toBeLessThanOrEqual(1000);
  });

  it('shows a non-overlapping pile of 20 without collisions', () => {
    const items = Array.from({ length: 20 }, (_, i) => cand(`c${i}`, 500 + (i % 4), 400 + (i % 5), { priority: i }));
    const placed = placeLabels(items, view);
    const rects = [...placed.values()];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        expect(a.x < b.x + 80 && b.x < a.x + 80 && a.y < b.y + 14 && b.y < a.y + 14).toBe(false);
      }
    }
    expect(placed.size).toBeLessThan(20);
  });
});
