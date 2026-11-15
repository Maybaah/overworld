import { describe, expect, it } from 'vitest';
import { FrameStats } from './frameStats';

describe('FrameStats', () => {
  it('counts frames in the last second', () => {
    const s = new FrameStats();
    for (let t = 0; t <= 2000; t += 20) s.push(t, 20);
    expect(s.fps(2000)).toBe(50);
  });

  it('keeps the last 300 frame times', () => {
    const s = new FrameStats();
    for (let i = 0; i < 500; i++) s.push(i * 16, i);
    const times = s.frameTimes();
    expect(times).toHaveLength(300);
    expect(times[299]).toBe(499);
  });
});
