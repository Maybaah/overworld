import { describe, expect, it } from 'vitest';
import { ATLAS, slotCount, slotOrigin, slotUv, SlotCache } from './atlasSlots';

describe('atlas layout', () => {
  it('fits 192 padded 90x128 slots in a 2048 atlas', () => {
    expect(slotCount()).toBe(192);
    const last = slotOrigin(191);
    expect(last.x + ATLAS.imageW).toBeLessThanOrEqual(ATLAS.size);
    expect(last.y + ATLAS.imageH).toBeLessThanOrEqual(ATLAS.size);
  });

  it('leaves padding between images so mip levels do not bleed', () => {
    const a = slotOrigin(0);
    const b = slotOrigin(1);
    const below = slotOrigin(16);
    expect(b.x - (a.x + ATLAS.imageW)).toBeGreaterThanOrEqual(16);
    expect(below.y - (a.y + ATLAS.imageH)).toBeGreaterThanOrEqual(16);
  });

  it('maps a slot to texel-centre UVs inside its image', () => {
    const [u0, v0, u1, v1] = slotUv(17);
    const o = slotOrigin(17);
    expect(u0 * ATLAS.size).toBeCloseTo(o.x + 0.5);
    expect(v1 * ATLAS.size).toBeCloseTo(o.y + ATLAS.imageH - 0.5);
    expect(u1).toBeGreaterThan(u0);
    expect(v1).toBeGreaterThan(v0);
  });
});

describe('SlotCache', () => {
  it('hands out free slots first and reuses a key slot', () => {
    const c = new SlotCache<string>(3);
    const a = c.acquire('a', () => false)!;
    expect(c.acquire('b', () => false)!.slot).not.toBe(a.slot);
    expect(c.acquire('a', () => false)).toEqual({ slot: a.slot, evicted: null });
    expect(c.size).toBe(2);
  });

  it('evicts the least recently used key that is not pinned', () => {
    const c = new SlotCache<string>(3);
    const sa = c.acquire('a', () => false)!.slot;
    c.acquire('b', () => false);
    c.acquire('c', () => false);
    c.touch('a');
    const r = c.acquire('d', (k) => k === 'b')!;
    expect(r.evicted).toBe('c');
    expect(c.peek('c')).toBeUndefined();
    const r2 = c.acquire('e', (k) => k === 'b')!;
    expect(r2.evicted).toBe('a');
    expect(r2.slot).toBe(sa);
  });

  it('refuses when every slot is pinned, and frees on delete', () => {
    const c = new SlotCache<string>(2);
    c.acquire('a', () => true);
    c.acquire('b', () => true);
    expect(c.acquire('c', () => true)).toBeNull();
    c.delete('a');
    expect(c.acquire('c', () => true)!.evicted).toBeNull();
  });
});
