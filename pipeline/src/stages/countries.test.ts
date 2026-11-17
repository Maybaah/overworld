import { describe, expect, it } from 'vitest';
import type { RawIgdbGame } from '../raw';
import { pickFloor, type FloorCandidate } from './countries';

const game = (id: number, ratings: number, cover: string | null = 'c', date: number | null = null): RawIgdbGame => ({
  id,
  name: `g${id}`,
  slug: `g${id}`,
  url: '',
  firstReleaseDate: date,
  totalRatingCount: ratings,
  gameType: 0,
  genres: [],
  platforms: [],
  cover,
  screenshots: [],
  involvedCompanies: [],
  steamAppId: null,
  steamAppIds: [],
});

const cand = (g: RawIgdbGame, countries: number[]): FloorCandidate => ({ game: g, developerCountries: countries });

describe('pickFloor', () => {
  it('keeps games made only in the country, best rated first, then with a cover, then newest', () => {
    const picked = pickFloor(
      [
        cand(game(1, 5), [100]),
        cand(game(2, 50), [100, 200]),
        cand(game(3, 0, null, 10), [100]),
        cand(game(4, 0, 'c', 5), [100]),
        cand(game(5, 0, 'c', 9), [100]),
        cand(game(6, 99), []),
      ],
      100,
      3,
    );
    expect(picked.map((g) => g.id)).toEqual([1, 5, 4]);
  });
});
