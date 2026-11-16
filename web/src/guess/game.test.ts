import { describe, expect, it } from 'vitest';
import { gameReducer, initialGameState, totalScore } from './game';
import type { GameAction, GameState } from './game';
import { buildPool, pickRounds } from './rounds';
import { fixtureData } from './fixtures';

const rounds = pickRounds(buildPool(fixtureData().indexes), 'game-test');

function run(actions: GameAction[], from: GameState = initialGameState): GameState {
  return actions.reduce(gameReducer, from);
}

const started = run([{ type: 'start', seed: 'game-test', rounds }]);

describe('gameReducer', () => {
  it('starts in the guessing phase', () => {
    expect(started).toMatchObject({ phase: 'guessing', index: 0, seed: 'game-test', guess: null });
  });

  it('does not start without rounds', () => {
    expect(run([{ type: 'start', seed: 's', rounds: [] }]).phase).toBe('idle');
  });

  it('ignores clicks and confirm before starting', () => {
    expect(run([{ type: 'place', lat: 1, lng: 2 }, { type: 'confirm' }]).phase).toBe('idle');
  });

  it('cannot confirm without a guess', () => {
    expect(run([{ type: 'confirm' }], started).phase).toBe('guessing');
  });

  it('places and moves the marker before confirming', () => {
    const placed = run([{ type: 'place', lat: 1, lng: 2 }], started);
    expect(placed).toMatchObject({ phase: 'placed', guess: { lat: 1, lng: 2 } });
    const moved = run([{ type: 'place', lat: 10, lng: 20 }], placed);
    expect(moved).toMatchObject({ phase: 'placed', guess: { lat: 10, lng: 20 } });
  });

  it('rejects non-finite coordinates', () => {
    expect(run([{ type: 'place', lat: NaN, lng: 2 }], started).phase).toBe('guessing');
  });

  it('scores on confirm and ignores later clicks', () => {
    const round = rounds[0]!;
    const revealed = run([{ type: 'place', lat: round.lat, lng: round.lng }, { type: 'confirm' }], started);
    expect(revealed.phase).toBe('revealed');
    expect(revealed.results[0]).toMatchObject({ distanceKm: 0, score: 5000, hintUsed: false });
    const after = run([{ type: 'place', lat: 0, lng: 0 }, { type: 'hint' }, { type: 'confirm' }], revealed);
    expect(after).toBe(revealed);
  });

  it('halves the score when the hint is used', () => {
    const round = rounds[0]!;
    const revealed = run(
      [{ type: 'hint' }, { type: 'place', lat: round.lat, lng: round.lng }, { type: 'confirm' }],
      started,
    );
    expect(revealed.results[0]).toMatchObject({ score: 2500, hintUsed: true });
  });

  it('plays five rounds to the end, resetting the guess and hint each round', () => {
    let state = started;
    for (let i = 0; i < 5; i++) {
      expect(state).toMatchObject({ phase: 'guessing', index: i, guess: null, hintUsed: false });
      state = run([{ type: 'place', lat: rounds[i]!.lat, lng: rounds[i]!.lng }, { type: 'confirm' }], state);
      expect(state.phase).toBe('revealed');
      state = run([{ type: 'next' }], state);
    }
    expect(state.phase).toBe('finished');
    expect(totalScore(state.results)).toBe(25000);
    expect(run([{ type: 'place', lat: 1, lng: 1 }, { type: 'next' }], state)).toBe(state);
  });

  it('ignores next before the reveal', () => {
    expect(run([{ type: 'next' }], started)).toBe(started);
  });

  it('resets', () => {
    expect(run([{ type: 'reset' }], started)).toEqual(initialGameState);
  });
});
