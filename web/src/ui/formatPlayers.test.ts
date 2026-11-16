import { describe, expect, it } from 'vitest';
import { formatPlayers } from './format';

describe('formatPlayers', () => {
  it('shortens counts to one decimal below ten of a unit', () => {
    expect(formatPlayers(6343)).toBe('6.3K');
    expect(formatPlayers(18_400)).toBe('18K');
    expect(formatPlayers(1_240_000)).toBe('1.2M');
    expect(formatPlayers(399_663_320)).toBe('400M');
    expect(formatPlayers(950)).toBe('950');
  });
});
