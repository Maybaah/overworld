export const PICK_RADIUS_PX = 12;

export interface ProjectedPoints {
  x: Float32Array;
  y: Float32Array;
  visible: Uint8Array;
}

export function makeProjected(n: number): ProjectedPoints {
  return { x: new Float32Array(n), y: new Float32Array(n), visible: new Uint8Array(n) };
}

export function projectPoints(
  positions: Float32Array,
  viewProjection: ArrayLike<number>,
  camera: { x: number; y: number; z: number },
  width: number,
  height: number,
  out: ProjectedPoints,
): void {
  const m = viewProjection;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const px = positions[i * 3]!;
    const py = positions[i * 3 + 1]!;
    const pz = positions[i * 3 + 2]!;
    const w = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]!;
    const facing = px * camera.x + py * camera.y + pz * camera.z > px * px + py * py + pz * pz;
    if (w <= 0 || !facing) {
      out.visible[i] = 0;
      continue;
    }
    const cx = m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!;
    const cy = m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!;
    out.x[i] = (cx / w * 0.5 + 0.5) * width;
    out.y[i] = (1 - (cy / w * 0.5 + 0.5)) * height;
    out.visible[i] = 1;
  }
}

export function nearestPoint(
  px: number,
  py: number,
  projected: ProjectedPoints,
  sizes: Float32Array,
  maxDist = PICK_RADIUS_PX,
): number {
  let best = -1;
  let bestD2 = Infinity;
  const n = sizes.length;
  for (let i = 0; i < n; i++) {
    if (!projected.visible[i] || sizes[i]! <= 0) continue;
    const dx = projected.x[i]! - px;
    const dy = projected.y[i]! - py;
    const d2 = dx * dx + dy * dy;
    const reach = Math.max(maxDist, sizes[i]! / 2);
    if (d2 <= reach * reach && d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
