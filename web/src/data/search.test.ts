import { describe, expect, it } from 'vitest';
import { normalize, searchGames } from './search';
import { game } from './testData';

const named = (id: number, name: string, popularity = 0) => game(id, { name, popularity });

describe('normalize', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalize("  Pokémon: Rouge-et-Noir's  ")).toBe('pokemon rouge et noir s');
  });
});

describe('searchGames', () => {
  const games = [
    named(1, 'The Last of Us', 10),
    named(2, 'Last Stand', 5),
    named(3, 'Lastation', 99),
    named(4, 'Pokémon Red', 1),
    named(5, 'Pac-Man', 3),
    named(6, 'Half-Life 2', 8),
    named(7, 'Blast Radius', 50),
  ];

  it('ranks prefix matches above substring matches', () => {
    expect(searchGames(games, 'last').map((g) => g.id)).toEqual([3, 2, 7, 1]);
  });

  it('breaks ties by popularity', () => {
    const r = searchGames([named(1, 'Alpha One', 1), named(2, 'Alpha Two', 9), named(3, 'Alpha Three', 5)], 'alpha');
    expect(r.map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it('ignores case and diacritics', () => {
    expect(searchGames(games, 'POKEMON').map((g) => g.id)).toEqual([4]);
    expect(searchGames(games, 'pokémon').map((g) => g.id)).toEqual([4]);
  });

  it('ignores punctuation', () => {
    expect(searchGames(games, 'pac man').map((g) => g.id)).toEqual([5]);
    expect(searchGames(games, 'pacman').map((g) => g.id)).toEqual([5]);
    expect(searchGames(games, 'half life').map((g) => g.id)).toEqual([6]);
  });

  it('respects the limit and handles empty queries', () => {
    expect(searchGames(games, 'last', 2).map((g) => g.id)).toEqual([3, 2]);
    expect(searchGames(games, '   ')).toEqual([]);
    expect(searchGames(games, 'zzzz')).toEqual([]);
  });

  it('answers in under 5 ms for 10,000 games', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => named(i, `Sample Game ${String(i).padStart(4, '0')} Édition`, i % 977));
    searchGames(many, 'warm');
    const queries = ['sample', 'game 04', 'edition', 'game 00', 'zzz'];
    for (const q of queries) {
      const start = performance.now();
      const r = searchGames(many, q);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5);
      if (q !== 'zzz') expect(r.length).toBe(20);
    }
  });
});
