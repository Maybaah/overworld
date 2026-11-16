import { kmToMiles } from './distance';
import type { RoundResult } from './game';
import { MAX_GAME_SCORE } from './scoring';

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export const fmtKm = (km: number) => `${fmt(km)} km`;

export const fmtMiles = (km: number) => `${fmt(kmToMiles(km))} mi`;

let regionNames: Intl.DisplayNames | null | undefined;

export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function placeText(r: { city: string | null; country: string }): string {
  const country = countryName(r.country);
  return r.city ? `${r.city}, ${country}` : country;
}

export function challengeLink(seed: string, loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${loc.origin}${loc.pathname}?mode=guess&seed=${encodeURIComponent(seed)}`;
}

export function shareSummary(results: readonly RoundResult[], total: number): string {
  const lines = results.map(
    (r, i) => `${i + 1}. ${fmtKm(r.distanceKm)} — ${fmt(r.score)}${r.hintUsed ? ' (hint)' : ''}`,
  );
  return [`Overworld guess: ${fmt(total)} / ${fmt(MAX_GAME_SCORE)}`, ...lines].join('\n');
}
