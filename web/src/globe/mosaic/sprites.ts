import * as THREE from 'three';

export const SPRITE_LAYOUT = { size: 2048, slotW: 44, slotH: 60, imageW: 40, imageH: 56 } as const;

export interface SpriteIndex {
  version: 1;
  pages: number;
  slots: Record<string, [page: number, slot: number]>;
}

export function spriteRect(page: number, slot: number): [number, number, number, number] {
  const { size, slotW, slotH, imageW, imageH } = SPRITE_LAYOUT;
  const cols = Math.floor(size / slotW);
  const x = (slot % cols) * slotW + (slotW - imageW) / 2;
  const y = Math.floor(slot / cols) * slotH + (slotH - imageH) / 2;
  return [page + (x + 0.5) / size, (y + 0.5) / size, page + (x + imageW - 0.5) / size, (y + imageH - 0.5) / size];
}

export class SpriteSheets {
  // A 1x1 placeholder until the index says how many pages there are; texture storage cannot grow later.
  texture: THREE.DataArrayTexture = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
  private index: SpriteIndex | null = null;
  private readonly loaded = new Set<number>();
  private readonly abort = new AbortController();
  readonly done: Promise<void>;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    baseUrl: string,
    private readonly onPage: () => void,
  ) {
    this.texture.needsUpdate = true;
    this.done = this.load(baseUrl);
  }

  uv(cover: string): [number, number, number, number] | null {
    const hit = this.index?.slots[cover];
    if (!hit || !this.loaded.has(hit[0])) return null;
    return spriteRect(hit[0], hit[1]);
  }

  has(cover: string): boolean {
    return !!this.index?.slots[cover];
  }

  dispose(): void {
    this.abort.abort();
    this.texture.dispose();
  }

  private async load(baseUrl: string): Promise<void> {
    let index: SpriteIndex;
    try {
      const res = await fetch(`${baseUrl}covers/index.json`, { signal: this.abort.signal });
      if (!res.ok) return;
      index = (await res.json()) as SpriteIndex;
    } catch {
      return;
    }
    const { size } = SPRITE_LAYOUT;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (index.pages <= 0) return;
    const t = new THREE.DataArrayTexture(null, size, size, index.pages);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace;
    t.source.dataReady = false;
    t.needsUpdate = true;
    this.renderer.initTexture(t);
    this.texture.dispose();
    this.texture = t;
    this.index = index;
    for (let p = 0; p < index.pages; p++) {
      try {
        const res = await fetch(`${baseUrl}covers/sprite-${p}.webp`, { signal: this.abort.signal });
        if (!res.ok) continue;
        const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const props = this.renderer.properties.get(this.texture) as { __webglTexture?: WebGLTexture };
        const state = this.renderer.state;
        state.activeTexture(gl.TEXTURE0);
        state.bindTexture(gl.TEXTURE_2D_ARRAY, props.__webglTexture!);
        state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, p, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        bitmap.close();
        this.loaded.add(p);
        this.onPage();
      } catch {
        if (this.abort.signal.aborted) return;
      }
    }
  }
}
