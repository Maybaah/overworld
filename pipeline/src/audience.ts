// Estimates how many people played a game from whatever signals exist for it, all on one scale.
// Steam is the anchor: SteamSpy owner bands and review counts (about 40 buyers per review, the Boxleiter rule).
// IGDB "Played" shares, RAWG "added" counts and IGDB rating counts are relative signals; each gets a factor
// calibrated as the median ratio to the Steam estimate over games that have both.

export const REVIEW_MULTIPLIER = 40;
export const PLAYER_FLOOR = 5_000;
const CALIBRATION_MIN_STEAM = 20_000;
const CALIBRATION_MIN_PAIRS = 30;
// IGDB "Played" is a share of all marks; its smallest step is one IGDB user. One or two marks are noise,
// so a share counts only from this many users up.
export const MIN_IGDB_USERS = 3;

export type AudienceBasis = 'steam' | 'igdb_played' | 'rawg_added' | 'igdb_ratings';

export interface AudienceSignals {
  steamReviews?: number;
  steamOwnersLow?: number;
  igdbPlayed?: number;
  rawgAdded?: number;
  ratingCount?: number;
}

export interface Calibration {
  igdbPlayed: number | null;
  rawgAdded: number | null;
  ratingCount: number | null;
  minIgdbPlayed: number; // share of MIN_IGDB_USERS users
  pairs: Record<'igdbPlayed' | 'rawgAdded' | 'ratingCount', number>;
}

export function steamEstimate(s: AudienceSignals): number | null {
  const fromReviews = s.steamReviews ? s.steamReviews * REVIEW_MULTIPLIER : 0;
  const fromOwners = s.steamOwnersLow ?? 0;
  const best = Math.max(fromReviews, fromOwners);
  return best > 0 ? best : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

export function calibrate(games: Iterable<AudienceSignals>): Calibration {
  const ratios: Record<'igdbPlayed' | 'rawgAdded' | 'ratingCount', number[]> = { igdbPlayed: [], rawgAdded: [], ratingCount: [] };
  let quantum = Infinity;
  for (const g of games) {
    if (g.igdbPlayed && g.igdbPlayed > 0) quantum = Math.min(quantum, g.igdbPlayed);
    const steam = steamEstimate(g);
    if (steam === null || steam < CALIBRATION_MIN_STEAM) continue;
    for (const key of ['igdbPlayed', 'rawgAdded', 'ratingCount'] as const) {
      const v = g[key];
      if (v && v > 0) ratios[key].push(steam / v);
    }
  }
  const pick = (k: keyof typeof ratios) => (ratios[k].length >= CALIBRATION_MIN_PAIRS ? median(ratios[k]) : null);
  return {
    igdbPlayed: pick('igdbPlayed'),
    rawgAdded: pick('rawgAdded'),
    ratingCount: pick('ratingCount'),
    minIgdbPlayed: Number.isFinite(quantum) ? quantum * MIN_IGDB_USERS * 0.999 : 0,
    pairs: { igdbPlayed: ratios.igdbPlayed.length, rawgAdded: ratios.rawgAdded.length, ratingCount: ratios.ratingCount.length },
  };
}

// The strongest signal wins: each one sees only part of the audience (Steam only PC, IGDB only its own users),
// and a game linked to a tiny Steam app (a demo, a delisted edition) must not lose its console audience.
export function estimatePlayers(s: AudienceSignals, c: Calibration): { players: number; basis: AudienceBasis } | null {
  const options: [number, AudienceBasis][] = [];
  const steam = steamEstimate(s);
  if (steam !== null) options.push([steam, 'steam']);
  if (s.igdbPlayed && c.igdbPlayed && s.igdbPlayed >= c.minIgdbPlayed) options.push([s.igdbPlayed * c.igdbPlayed, 'igdb_played']);
  if (s.rawgAdded && c.rawgAdded) options.push([s.rawgAdded * c.rawgAdded, 'rawg_added']);
  if (s.ratingCount && c.ratingCount) options.push([s.ratingCount * c.ratingCount, 'igdb_ratings']);
  if (options.length === 0) return null;
  options.sort((a, b) => b[0] - a[0]);
  return { players: Math.round(options[0]![0]), basis: options[0]![1] };
}
