import { describe, expect, it } from 'vitest';
import { SPRITE_LAYOUT, spriteRect } from './sprites';

describe('spriteRect', () => {
  it('puts the page in the integer part and keeps the image inside its padded slot', () => {
    const { size, slotW, slotH, imageW } = SPRITE_LAYOUT;
    const cols = Math.floor(size / slotW);
    const [x0, y0, x1, y1] = spriteRect(2, cols + 1);
    expect(Math.floor(x0)).toBe(2);
    expect(Math.floor(x1)).toBe(2);
    expect((x0 - 2) * size).toBeCloseTo(slotW + 2 + 0.5, 6);
    expect(y0 * size).toBeCloseTo(slotH + 2 + 0.5, 6);
    expect((x1 - x0) * size).toBeCloseTo(imageW - 1, 6);
    expect(y1).toBeGreaterThan(y0);
  });
});
