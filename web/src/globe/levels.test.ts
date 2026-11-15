import { describe, expect, it } from 'vitest';
import { levelForAltitude } from './levels';

describe('levelForAltitude', () => {
  it('uses country above 1.1', () => {
    expect(levelForAltitude(2.5)).toBe('country');
    expect(levelForAltitude(1.1001)).toBe('country');
  });
  it('uses city from 0.3 to 1.1 inclusive', () => {
    expect(levelForAltitude(1.1)).toBe('city');
    expect(levelForAltitude(0.7)).toBe('city');
    expect(levelForAltitude(0.3)).toBe('city');
  });
  it('uses company below 0.3', () => {
    expect(levelForAltitude(0.2999)).toBe('company');
    expect(levelForAltitude(0.01)).toBe('company');
  });
});
