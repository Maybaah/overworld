export type LabelMode = 'always' | 'auto' | 'hover';

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  mode: LabelMode;
  priority: number;
  visible: boolean;
}

export interface Placement {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 4;
const PAD = 2;

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;
}

function rectHitsDisc(r: Rect, cx: number, cy: number, radius: number): boolean {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < radius * radius;
}

function sides(c: LabelCandidate): Rect[] {
  const { x, y, w, h, radius } = c;
  return [
    { x: x + radius + GAP, y: y - h / 2, w, h },
    { x: x - radius - GAP - w, y: y - h / 2, w, h },
    { x: x - w / 2, y: y - radius - GAP - h, w, h },
    { x: x - w / 2, y: y + radius + GAP, w, h },
  ];
}

export function placeLabels(
  candidates: readonly LabelCandidate[],
  viewport: { w: number; h: number },
  hoverId: string | null = null,
): Map<string, Placement> {
  const placed = new Map<string, Placement>();
  const rects: Rect[] = [];
  const visible = candidates.filter((c) => c.visible);

  const free = (c: LabelCandidate, r: Rect) => {
    if (r.x < GAP || r.y < GAP || r.x + r.w > viewport.w - GAP || r.y + r.h > viewport.h - GAP) return false;
    for (const o of rects) if (rectsOverlap(r, o)) return false;
    for (const d of visible) if (d.id !== c.id && rectHitsDisc(r, d.x, d.y, d.radius)) return false;
    return true;
  };

  const place = (c: LabelCandidate, force: boolean) => {
    const options = sides(c);
    const chosen = options.find((r) => free(c, r)) ?? (force ? options[0] : undefined);
    if (!chosen) return;
    rects.push(chosen);
    placed.set(c.id, { x: chosen.x, y: chosen.y });
  };

  const byPriority = (a: LabelCandidate, b: LabelCandidate) => a.priority - b.priority;
  for (const c of visible.filter((v) => v.mode === 'always').sort(byPriority)) place(c, true);
  const hovered = hoverId === null ? undefined : visible.find((v) => v.id === hoverId);
  if (hovered && !placed.has(hovered.id)) place(hovered, true);
  for (const c of visible.filter((v) => v.mode === 'auto').sort(byPriority)) {
    if (!placed.has(c.id)) place(c, false);
  }
  return placed;
}
