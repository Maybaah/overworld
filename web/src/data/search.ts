import type { GameSummary } from '@shared';

interface Prepared {
  names: string[];
  squashed: string[];
}

const cache = new WeakMap<GameSummary[], Prepared>();

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function prepare(games: GameSummary[]): Prepared {
  let p = cache.get(games);
  if (!p || p.names.length !== games.length) {
    const names = games.map((g) => normalize(g.name));
    p = { names, squashed: names.map((n) => n.replace(/ /g, '')) };
    cache.set(games, p);
  }
  return p;
}

export function searchGames(games: GameSummary[], query: string, limit = 20): GameSummary[] {
  const q = normalize(query);
  if (q === '' || limit <= 0) return [];
  const qs = q.replace(/ /g, '');
  const { names, squashed } = prepare(games);

  const topRank: number[] = [];
  const topPop: number[] = [];
  const topIdx: number[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    let rank: number;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (squashed[i]!.startsWith(qs)) rank = 2;
    else if (squashed[i]!.includes(qs)) rank = 3;
    else continue;
    const pop = games[i]!.popularity;

    let at = topRank.length;
    while (at > 0 && (topRank[at - 1]! > rank || (topRank[at - 1] === rank && topPop[at - 1]! < pop))) at--;
    if (at >= limit) continue;
    topRank.splice(at, 0, rank);
    topPop.splice(at, 0, pop);
    topIdx.splice(at, 0, i);
    if (topRank.length > limit) {
      topRank.pop();
      topPop.pop();
      topIdx.pop();
    }
  }
  return topIdx.map((i) => games[i]!);
}
