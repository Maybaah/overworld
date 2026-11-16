export interface GameLike {
  id: number;
  year: number | null;
  leadCompanyId: number;
}

export interface ChangePoints {
  start: Uint32Array;
  year: Int16Array;
  game: Int32Array;
}

export function effectiveYear(year: number | null, minYear: number, maxYear: number): number {
  if (year === null) return maxYear;
  return Math.min(Math.max(year, minYear), maxYear);
}

// Games come in popularity order, so a place's top game at year Y is its first game with year <= Y.
// Walking that order, each game older than every game before it starts a new period: those are the change points.
export function buildChangePoints(
  games: readonly GameLike[],
  placeOfCompany: (companyId: number) => number,
  places: number,
  minYear: number,
  maxYear: number,
  filter: ReadonlySet<number> | null = null,
): ChangePoints {
  const earliest = new Int32Array(places).fill(0x7fffffff);
  const count = new Uint32Array(places);
  const hitPlace: number[] = [];
  const hitYear: number[] = [];
  const hitGame: number[] = [];
  for (let gi = 0; gi < games.length; gi++) {
    const g = games[gi]!;
    if (filter && !filter.has(g.id)) continue;
    const p = placeOfCompany(g.leadCompanyId);
    if (p < 0 || p >= places) continue;
    const y = effectiveYear(g.year, minYear, maxYear);
    if (y >= earliest[p]!) continue;
    earliest[p] = y;
    count[p]!++;
    hitPlace.push(p);
    hitYear.push(y);
    hitGame.push(gi);
  }
  const start = new Uint32Array(places + 1);
  for (let p = 0; p < places; p++) start[p + 1] = start[p]! + count[p]!;
  const year = new Int16Array(hitPlace.length);
  const game = new Int32Array(hitPlace.length);
  const fill = new Uint32Array(places);
  for (let k = 0; k < hitPlace.length; k++) {
    const p = hitPlace[k]!;
    const slot = start[p + 1]! - 1 - fill[p]!;
    fill[p]!++;
    year[slot] = hitYear[k]!;
    game[slot] = hitGame[k]!;
  }
  return { start, year, game };
}

export function topGameAt(cp: ChangePoints, place: number, year: number): number {
  let best = -1;
  const end = cp.start[place + 1]!;
  for (let k = cp.start[place]!; k < end; k++) {
    if (cp.year[k]! > year) break;
    best = cp.game[k]!;
  }
  return best;
}
