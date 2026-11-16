import { describe, expect, it } from 'vitest';
import { calibrate, estimatePlayers, steamEstimate, type AudienceSignals } from './audience';

describe('steamEstimate', () => {
  it('takes the larger of reviews x 40 and the owner band floor', () => {
    expect(steamEstimate({ steamReviews: 200 })).toBe(8_000);
    expect(steamEstimate({ steamReviews: 100, steamOwnersLow: 20_000 })).toBe(20_000);
    expect(steamEstimate({})).toBeNull();
  });
});

describe('calibrate and estimatePlayers', () => {
  const games: AudienceSignals[] = Array.from({ length: 40 }, (_, i) => ({
    steamReviews: 1_000 * (i + 1),
    igdbPlayed: 0.0001 * (i + 1),
    ratingCount: 10 * (i + 1),
  }));
  const c = calibrate(games);

  it('finds the factor that maps each relative signal onto Steam players', () => {
    expect(c.igdbPlayed).toBeCloseTo(40_000 / 0.0001, -3);
    expect(c.ratingCount).toBeCloseTo(4_000, 6);
    expect(c.rawgAdded).toBeNull();
    expect(c.pairs.igdbPlayed).toBe(40);
  });

  it('takes the strongest signal, Steam included', () => {
    expect(estimatePlayers({ steamReviews: 150, igdbPlayed: 0.00001 }, c)).toEqual({ players: 6_000, basis: 'steam' });
    expect(estimatePlayers({ steamReviews: 10, igdbPlayed: 0.0002 }, c)!.basis).toBe('igdb_played');
    const console = estimatePlayers({ igdbPlayed: 0.00002, ratingCount: 1 }, c)!;
    expect(console.basis).toBe('igdb_played');
    expect(console.players).toBeCloseTo(8_000, -2);
    expect(estimatePlayers({ rawgAdded: 500 }, c)).toBeNull();
  });
});
