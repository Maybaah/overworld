import { describe, expect, it } from 'vitest';
import { buildChangePoints, topGameAt, type GameLike } from './coverChoice';

const g = (id: number, year: number | null, leadCompanyId: number): GameLike => ({ id, year, leadCompanyId });

function naiveTop(games: readonly GameLike[], place: (c: number) => number, p: number, year: number, filter: Set<number> | null) {
  for (let i = 0; i < games.length; i++) {
    const x = games[i]!;
    if (filter && !filter.has(x.id)) continue;
    if (place(x.leadCompanyId) !== p) continue;
    const y = x.year === null ? 2026 : Math.min(Math.max(x.year, 1970), 2026);
    if (y <= year) return i;
  }
  return -1;
}

describe('change points', () => {
  const games = [g(1, 2013, 10), g(2, 2020, 11), g(3, 1998, 10), g(4, 2005, 10), g(5, 1985, 11), g(6, 1960, 12), g(7, null, 12), g(8, 1998, 10)];
  const place = (c: number) => (c === 12 ? 1 : 0);
  const cp = buildChangePoints(games, place, 2, 1970, 2026);

  it('keeps only the periods where the top game changes, oldest first', () => {
    const p0 = Array.from(cp.year.subarray(cp.start[0]!, cp.start[1]!));
    expect(p0).toEqual([1985, 1998, 2013]);
  });

  it('answers each year with the most popular game released by then', () => {
    expect(topGameAt(cp, 0, 1984)).toBe(-1);
    expect(topGameAt(cp, 0, 1985)).toBe(4);
    expect(topGameAt(cp, 0, 1999)).toBe(2);
    expect(topGameAt(cp, 0, 2013)).toBe(0);
    expect(topGameAt(cp, 0, 2026)).toBe(0);
  });

  it('clamps early years to the first slider year and puts undated games at the end', () => {
    expect(topGameAt(cp, 1, 1970)).toBe(5);
    expect(topGameAt(cp, 1, 2026)).toBe(5);
  });

  it('respects a game filter', () => {
    const filtered = buildChangePoints(games, place, 2, 1970, 2026, new Set([3, 8, 2]));
    expect(topGameAt(filtered, 0, 2026)).toBe(1);
    expect(topGameAt(filtered, 0, 2019)).toBe(2);
    expect(topGameAt(filtered, 1, 2026)).toBe(-1);
  });

  it('matches a brute-force scan on random data', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const many = Array.from({ length: 3000 }, (_, i) => g(i, rnd() < 0.05 ? null : 1965 + Math.floor(rnd() * 64), Math.floor(rnd() * 40)));
    const pl = (c: number) => (c < 35 ? c % 9 : -1);
    const filter = new Set(many.filter(() => rnd() < 0.4).map((x) => x.id));
    for (const f of [null, filter]) {
      const c = buildChangePoints(many, pl, 9, 1970, 2026, f);
      for (let p = 0; p < 9; p++) for (let y = 1970; y <= 2026; y++) expect(topGameAt(c, p, y)).toBe(naiveTop(many, pl, p, y, f));
    }
  });

  it('makes a year step a cheap lookup', () => {
    const many = Array.from({ length: 10000 }, (_, i) => g(i, 1970 + (i * 37) % 57, i % 6000));
    const c = buildChangePoints(many, (x) => x, 6000, 1970, 2026);
    const t0 = performance.now();
    let sum = 0;
    for (let p = 0; p < 6000; p++) sum += topGameAt(c, p, 1990);
    expect(performance.now() - t0).toBeLessThan(5);
    expect(sum).not.toBe(0);
  });
});
