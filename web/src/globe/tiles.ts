export const TILE_HOST = 'tiles.maps.eox.at';
export const TILE_LAYER = 's2cloudless_3857';
export const TILE_MATRIX_SET = 'GoogleMapsCompatible';
export const TILE_MAX_LEVEL = 13;
export const IMAGERY_TIMEOUT_MS = 10000;
export const IMAGERY_LIGHT = 0.52;
export const IMAGERY_TINT = 0xd2dcec;

export function tileUrl(x: number, y: number, level: number): string {
  return `https://${TILE_HOST}/wmts/1.0.0/${TILE_LAYER}/default/${TILE_MATRIX_SET}/${level}/${y}/${x}.jpg`;
}

export type ImageryState = 'pending' | 'on' | 'off';

export function imageryVerdict(loadedTiles: number, elapsedMs: number, timeoutMs = IMAGERY_TIMEOUT_MS): ImageryState {
  if (loadedTiles > 0) return 'on';
  return elapsedMs >= timeoutMs ? 'off' : 'pending';
}

interface TileEngineLike {
  children: { material?: unknown }[];
  clearTiles(): void;
  updatePov(camera: unknown): void;
}

export function findTileEngine(root: { traverse(fn: (o: unknown) => void): void }): TileEngineLike | null {
  let found: TileEngineLike | null = null;
  root.traverse((o) => {
    const c = o as Partial<TileEngineLike>;
    if (!found && typeof c.clearTiles === 'function' && typeof c.updatePov === 'function') found = c as TileEngineLike;
  });
  return found;
}

export function loadedTileCount(engine: TileEngineLike): number {
  let n = 0;
  for (const c of engine.children) {
    const m = c.material as { map?: unknown } | undefined;
    if (m && m.map) n++;
  }
  return n;
}

export interface TileMap {
  image: unknown;
  needsUpdate: boolean;
}

export interface TileChecks {
  decodes(map: TileMap): Promise<boolean>;
  refetch(map: TileMap): Promise<boolean>;
}

// A tile whose bytes arrive truncated still fires `load`, but the GPU upload rejects it and the tile renders black.
// Each new tile is decoded once; a broken one is fetched again, once.
export class TileRepair {
  private readonly seen = new WeakSet<TileMap>();
  private pending = 0;
  repaired = 0;

  constructor(
    private readonly checks: TileChecks,
    private readonly maxPending = 4,
  ) {}

  tick(engine: TileEngineLike): void {
    for (const c of engine.children) {
      if (this.pending >= this.maxPending) return;
      const map = (c.material as { map?: TileMap | null } | undefined)?.map;
      if (!map || this.seen.has(map)) continue;
      this.seen.add(map);
      this.pending++;
      this.checks
        .decodes(map)
        .then((ok) => (ok ? false : this.checks.refetch(map)))
        .then((fixed) => {
          if (fixed) this.repaired++;
        })
        .catch(() => {})
        .finally(() => {
          this.pending--;
        });
    }
  }
}

export const browserTileChecks: TileChecks = {
  async decodes(map) {
    try {
      const bitmap = await createImageBitmap(map.image as ImageBitmapSource);
      bitmap.close();
      return true;
    } catch {
      return false;
    }
  },
  async refetch(map) {
    const src = (map.image as { src?: string }).src;
    if (!src) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
      const res = await fetch(src, { mode: 'cors', cache: 'reload' });
      if (!res.ok) return false;
      const blob = await res.blob();
      try {
        (await createImageBitmap(blob)).close();
      } catch {
        continue;
      }
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        map.image = img;
        map.needsUpdate = true;
        return true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return false;
  },
};
