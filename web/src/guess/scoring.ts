export const ROUNDS_PER_GAME = 5;
export const MAX_ROUND_SCORE = 5000;
export const MAX_GAME_SCORE = MAX_ROUND_SCORE * ROUNDS_PER_GAME;
export const PLATEAU_KM = 50;
const DECAY_KM = 1500;

export function baseScore(distanceKm: number): number {
  if (distanceKm <= PLATEAU_KM) return MAX_ROUND_SCORE;
  return Math.max(0, Math.round(MAX_ROUND_SCORE * Math.exp(-(distanceKm - PLATEAU_KM) / DECAY_KM)));
}

export function roundScore(distanceKm: number, hintUsed: boolean): number {
  const base = baseScore(distanceKm);
  return hintUsed ? Math.round(base / 2) : base;
}
