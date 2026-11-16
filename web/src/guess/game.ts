import { haversineKm } from './distance';
import type { LatLng } from './distance';
import type { RoundDef } from './rounds';
import { roundScore } from './scoring';

export type Phase = 'idle' | 'guessing' | 'placed' | 'revealed' | 'finished';

export interface RoundResult {
  round: RoundDef;
  guess: LatLng;
  distanceKm: number;
  hintUsed: boolean;
  score: number;
}

export interface GameState {
  phase: Phase;
  seed: string | null;
  rounds: RoundDef[];
  index: number;
  guess: LatLng | null;
  hintUsed: boolean;
  results: RoundResult[];
}

export type GameAction =
  | { type: 'start'; seed: string; rounds: RoundDef[] }
  | { type: 'place'; lat: number; lng: number }
  | { type: 'hint' }
  | { type: 'confirm' }
  | { type: 'next' }
  | { type: 'reset' };

export const initialGameState: GameState = {
  phase: 'idle',
  seed: null,
  rounds: [],
  index: 0,
  guess: null,
  hintUsed: false,
  results: [],
};

export function totalScore(results: readonly RoundResult[]): number {
  return results.reduce((sum, r) => sum + r.score, 0);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      if (action.rounds.length === 0) return state;
      return { ...initialGameState, phase: 'guessing', seed: action.seed, rounds: action.rounds };
    case 'place':
      if (state.phase !== 'guessing' && state.phase !== 'placed') return state;
      if (!Number.isFinite(action.lat) || !Number.isFinite(action.lng)) return state;
      return { ...state, phase: 'placed', guess: { lat: action.lat, lng: action.lng } };
    case 'hint':
      if (state.phase !== 'guessing' && state.phase !== 'placed') return state;
      return { ...state, hintUsed: true };
    case 'confirm': {
      const round = state.rounds[state.index];
      if (state.phase !== 'placed' || !state.guess || !round) return state;
      const distanceKm = haversineKm(state.guess, round);
      const result: RoundResult = {
        round,
        guess: state.guess,
        distanceKm,
        hintUsed: state.hintUsed,
        score: roundScore(distanceKm, state.hintUsed),
      };
      return { ...state, phase: 'revealed', results: [...state.results, result] };
    }
    case 'next':
      if (state.phase !== 'revealed') return state;
      if (state.index + 1 >= state.rounds.length) return { ...state, phase: 'finished' };
      return { ...state, phase: 'guessing', index: state.index + 1, guess: null, hintUsed: false };
    case 'reset':
      return initialGameState;
  }
}
