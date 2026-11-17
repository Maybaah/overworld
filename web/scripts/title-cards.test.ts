import { describe, expect, it } from 'vitest';
import { titleCardSvg, wrap } from './title-cards';

describe('title cards', () => {
  it('wraps titles by words and cuts what does not fit', () => {
    expect(wrap('Bahama Conch n Burger Shack', 13, 5)).toEqual(['Bahama Conch', 'n Burger', 'Shack']);
    expect(wrap('Supercalifragilistic', 8, 2)).toEqual(['Superca…']);
    expect(wrap('a b c d e f', 1, 2)).toEqual(['a', '…']);
  });

  it('escapes markup in titles', () => {
    const svg = titleCardSvg('Tom & Jerry <3', 'Kenya', 2020);
    expect(svg).toContain('Tom &amp;');
    expect(svg).toContain('&lt;3');
    expect(svg).not.toContain('<3');
    expect(svg).toContain('Kenya · 2020');
  });
});
