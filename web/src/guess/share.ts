import { isValidSeed } from './rounds';
import { MAX_GAME_SCORE, MAX_ROUND_SCORE, ROUNDS_PER_GAME, roundScore } from './scoring';

export interface ShareRound {
  gameId: number;
  km: number;
  score: number;
  hint: boolean;
}

export interface ShareResult {
  seed: string;
  rounds: ShareRound[];
}

const VERSION = '1';
const MAX_KM = 20100;
const MAX_ID = 2_000_000_000;
const SCORE_TOLERANCE = 5;
const INT = /^\d{1,10}$/;

export function resultToShareParams(result: ShareResult): string {
  if (!isValidSeed(result.seed) || result.rounds.length !== ROUNDS_PER_GAME) {
    throw new Error('Result cannot be encoded');
  }
  const rounds = result.rounds
    .map((r) => [r.gameId, Math.round(r.km), r.score, r.hint ? 1 : 0].join('.'))
    .join('_');
  return new URLSearchParams({ v: VERSION, seed: result.seed, r: rounds }).toString();
}

function parseBounded(text: string, max: number): number | null {
  if (!INT.test(text)) return null;
  const n = Number(text);
  return n <= max ? n : null;
}

export function shareParamsToResult(params: string | URLSearchParams): ShareResult | null {
  const p = typeof params === 'string' ? new URLSearchParams(params) : params;
  const seed = p.get('seed');
  const encoded = p.get('r');
  if (p.get('v') !== VERSION || !isValidSeed(seed) || encoded === null) return null;
  const parts = encoded.split('_');
  if (parts.length !== ROUNDS_PER_GAME) return null;
  const rounds: ShareRound[] = [];
  for (const part of parts) {
    const fields = part.split('.');
    if (fields.length !== 4) return null;
    const gameId = parseBounded(fields[0]!, MAX_ID);
    const km = parseBounded(fields[1]!, MAX_KM);
    const score = parseBounded(fields[2]!, MAX_ROUND_SCORE);
    const hint = fields[3];
    if (gameId === null || gameId === 0 || km === null || score === null) return null;
    if (hint !== '0' && hint !== '1') return null;
    if (Math.abs(score - roundScore(km, hint === '1')) > SCORE_TOLERANCE) return null;
    rounds.push({ gameId, km, score, hint: hint === '1' });
  }
  return { seed, rounds };
}

export function shareTotal(result: ShareResult): number {
  return Math.min(MAX_GAME_SCORE, result.rounds.reduce((sum, r) => sum + r.score, 0));
}
