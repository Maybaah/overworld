import type { Indexes } from '../data/indexes';
import { ROUNDS_PER_GAME } from './scoring';

export const POOL_SIZE = 3000;

export interface RoundDef {
  gameId: number;
  name: string;
  year: number | null;
  cover: string;
  companyId: number;
  studioName: string;
  city: string | null;
  country: string;
  lat: number;
  lng: number;
}

const SEED_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function isValidSeed(seed: unknown): seed is string {
  return typeof seed === 'string' && SEED_PATTERN.test(seed);
}

export function randomSeed(): string {
  let out = '';
  while (out.length < 6) out += Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return out.slice(0, 6);
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPool(indexes: Indexes): RoundDef[] {
  const pool: RoundDef[] = [];
  for (const game of indexes.games.slice(0, POOL_SIZE)) {
    if (game.cover === null) continue;
    const studio = indexes.companyById.get(game.leadCompanyId);
    if (!studio || studio.precision !== 'city') continue;
    if (studio.lat === null || studio.lng === null || studio.country === null) continue;
    pool.push({
      gameId: game.id,
      name: game.name,
      year: game.year,
      cover: game.cover,
      companyId: studio.id,
      studioName: studio.name,
      city: studio.city,
      country: studio.country,
      lat: studio.lat,
      lng: studio.lng,
    });
  }
  return pool;
}

export function pickRounds(pool: readonly RoundDef[], seed: string, count = ROUNDS_PER_GAME): RoundDef[] {
  const random = seededRandom(seed);
  const order = pool.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const used = new Set<number>();
  const picked: RoundDef[] = [];
  for (const round of order) {
    if (used.has(round.companyId)) continue;
    used.add(round.companyId);
    picked.push(round);
    if (picked.length === count) break;
  }
  return picked;
}
