import * as THREE from 'three';
import { ATLAS, atlasHeight, slotCount, slotOrigin, slotUv, SlotCache, type AtlasLayout } from './atlasSlots';

export const MAX_IN_FLIGHT = 4;
const UPLOADS_PER_FRAME = 2;

export function coverUrl(id: string, size: 'cover_small' | 'cover_big' | '1080p' = 'cover_small'): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;
}

interface Ready {
  key: string;
  bitmap: ImageBitmap;
}

export class CoverAtlas {
  readonly texture: THREE.DataTexture;
  private readonly slots: SlotCache<string>;
  private readonly readyAt = new Map<string, number>();
  private readonly failed = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly uploads: Ready[] = [];
  private wanted: string[] = [];
  private pinned = new Set<string>();
  private readonly abort = new AbortController();
  private disposed = false;
  private loadedTotal = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly clock: () => number,
    private readonly layout: AtlasLayout = ATLAS,
    private readonly url: (id: string) => string = (id) => coverUrl(id),
    private readonly maxInFlight = MAX_IN_FLIGHT,
    private readonly mipmaps = true,
  ) {
    this.slots = new SlotCache<string>(slotCount(layout));
    const t = new THREE.DataTexture(null, layout.size, atlasHeight(layout), THREE.RGBAFormat, THREE.UnsignedByteType);
    t.source.dataReady = false;
    t.generateMipmaps = this.mipmaps;
    t.minFilter = this.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    renderer.initTexture(t);
    this.texture = t;
  }

  want(keys: readonly string[]): void {
    this.wanted = keys.slice();
    this.pinned = new Set(keys);
    for (const k of keys) this.slots.touch(k);
    this.pump();
  }

  uv(key: string): [number, number, number, number] | null {
    const slot = this.readyAt.has(key) ? this.slots.peek(key) : undefined;
    return slot === undefined ? null : slotUv(slot, this.layout);
  }

  readyTime(key: string): number | undefined {
    return this.readyAt.get(key);
  }

  isFailed(key: string): boolean {
    return this.failed.has(key);
  }

  loadedCount(): number {
    return this.loadedTotal;
  }

  private pump(): void {
    if (this.disposed) return;
    for (const key of this.wanted) {
      if (this.inFlight.size >= this.maxInFlight) return;
      if (this.readyAt.has(key) || this.failed.has(key) || this.inFlight.has(key)) continue;
      if (this.uploads.some((u) => u.key === key)) continue;
      this.load(key);
    }
  }

  private load(key: string): void {
    this.inFlight.add(key);
    fetch(this.url(key), { mode: 'cors', signal: this.abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => createImageBitmap(blob, { resizeWidth: this.layout.imageW, resizeHeight: this.layout.imageH, resizeQuality: 'high' }))
      .then((bitmap) => {
        if (this.disposed) bitmap.close();
        else this.uploads.push({ key, bitmap });
      })
      .catch(() => {
        if (!this.disposed) this.failed.add(key);
      })
      .finally(() => {
        this.inFlight.delete(key);
        this.pump();
      });
  }

  frame(): boolean {
    let changed = false;
    for (let n = 0; n < UPLOADS_PER_FRAME && this.uploads.length > 0; n++) {
      const { key, bitmap } = this.uploads.shift()!;
      const got = this.slots.acquire(key, (k) => this.pinned.has(k));
      if (!got) {
        bitmap.close();
        continue;
      }
      if (got.evicted !== null) this.readyAt.delete(got.evicted);
      const o = slotOrigin(got.slot, this.layout);
      this.upload(bitmap, o.x, o.y);
      bitmap.close();
      this.readyAt.set(key, this.clock());
      this.loadedTotal++;
      changed = true;
    }
    if (changed && this.mipmaps) this.renderer.getContext().generateMipmap(this.renderer.getContext().TEXTURE_2D);
    return changed;
  }

  // Straight texSubImage2D: three's copyTextureToTexture reads pixel-store state back from the GPU on every copy,
  // which stalls the main thread while the GPU is busy.
  private upload(bitmap: ImageBitmap, x: number, y: number): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const state = this.renderer.state;
    let props = this.renderer.properties.get(this.texture) as { __webglTexture?: WebGLTexture };
    if (!props.__webglTexture) {
      this.renderer.initTexture(this.texture);
      props = this.renderer.properties.get(this.texture) as { __webglTexture?: WebGLTexture };
    }
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_2D, props.__webglTexture!);
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    state.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    for (const u of this.uploads) u.bitmap.close();
    this.uploads.length = 0;
    this.texture.dispose();
  }
}
