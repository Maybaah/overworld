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
  minFacing = 0,
): void {
  const m = viewProjection;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const px = positions[i * 3]!;
    const py = positions[i * 3 + 1]!;
    const pz = positions[i * 3 + 2]!;
    const w = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]!;
    const lift = px * camera.x + py * camera.y + pz * camera.z - (px * px + py * py + pz * pz);
    let facing = lift > 0;
    if (facing && minFacing > 0) {
      const dx = camera.x - px;
      const dy = camera.y - py;
      const dz = camera.z - pz;
      facing = lift > minFacing * Math.sqrt((px * px + py * py + pz * pz) * (dx * dx + dy * dy + dz * dz));
    }
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
  let bestInside = -1;
  let bestInsideScore = Infinity;
  let bestNear = -1;
  let bestNearD2 = Infinity;
  const n = sizes.length;
  for (let i = 0; i < n; i++) {
    const size = sizes[i]!;
    if (!projected.visible[i] || size <= 0) continue;
    const dx = projected.x[i]! - px;
    const dy = projected.y[i]! - py;
    const d2 = dx * dx + dy * dy;
    const radius = size / 2;
    if (d2 <= radius * radius) {
      const score = d2 / (radius * radius);
      if (score < bestInsideScore) {
        bestInsideScore = score;
        bestInside = i;
      }
    } else if (d2 <= maxDist * maxDist && d2 < bestNearD2) {
      bestNearD2 = d2;
      bestNear = i;
    }
  }
  return bestInside >= 0 ? bestInside : bestNear;
}
