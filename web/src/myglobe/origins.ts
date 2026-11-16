import type { Indexes } from '../data/indexes';
import { cityKey } from '../data/indexes';

export interface OwnedGame {
  appId: number;
  minutes: number;
}

export interface CountryOrigin {
  code: string;
  games: number;
  share: number;
  minutes: number;
  minutesShare: number;
}

export interface CityOrigin {
  key: string;
  name: string;
  country: string;
  games: number;
  share: number;
}

export interface StudioOrigin {
  companyId: number;
  name: string;
  country: string | null;
  games: number;
  share: number;
}

export interface Origins {
  owned: number;
  matched: number;
  unmatchedAppIds: number;
  byCountry: CountryOrigin[];
  byCity: CityOrigin[];
  byStudio: StudioOrigin[];
  unknownLocation: number;
  gameIds: Set<number>;
}

const TOP = 10;

export function computeOrigins(owned: OwnedGame[], steamMap: Record<string, number>, indexes: Indexes): Origins {
  const minutesByApp = new Map<number, number>();
  for (const g of owned) {
    minutesByApp.set(g.appId, Math.max(minutesByApp.get(g.appId) ?? 0, Number.isFinite(g.minutes) ? g.minutes : 0));
  }

  const minutesByGame = new Map<number, number>();
  let matchedApps = 0;
  for (const [appId, minutes] of minutesByApp) {
    const gameId = Object.prototype.hasOwnProperty.call(steamMap, String(appId)) ? steamMap[String(appId)] : undefined;
    if (gameId === undefined || !indexes.gameById.has(gameId)) continue;
    matchedApps++;
    minutesByGame.set(gameId, (minutesByGame.get(gameId) ?? 0) + minutes);
  }

  const countries = new Map<string, { games: number; minutes: number }>();
  const cities = new Map<string, CityOrigin>();
  const studios = new Map<number, StudioOrigin>();
  let unknownLocation = 0;
  let knownGames = 0;
  let knownMinutes = 0;

  for (const [gameId, minutes] of minutesByGame) {
    const game = indexes.gameById.get(gameId)!;
    const company = indexes.companyById.get(game.leadCompanyId);

    if (company) {
      const s = studios.get(company.id);
      if (s) s.games++;
      else studios.set(company.id, { companyId: company.id, name: company.name, country: company.country, games: 1, share: 0 });
    }

    if (!company || company.country === null) {
      unknownLocation++;
      continue;
    }
    knownGames++;
    knownMinutes += minutes;
    const c = countries.get(company.country);
    if (c) {
      c.games++;
      c.minutes += minutes;
    } else countries.set(company.country, { games: 1, minutes });

    if (company.precision === 'city' && company.city !== null) {
      const key = cityKey(company.country, company.city);
      const city = cities.get(key);
      if (city) city.games++;
      else cities.set(key, { key, name: company.city, country: company.country, games: 1, share: 0 });
    }
  }

  const matchedGames = minutesByGame.size;
  const byCountry: CountryOrigin[] = [...countries]
    .map(([code, v]) => ({
      code,
      games: v.games,
      share: knownGames > 0 ? v.games / knownGames : 0,
      minutes: v.minutes,
      minutesShare: knownMinutes > 0 ? v.minutes / knownMinutes : 0,
    }))
    .sort((a, b) => b.games - a.games || b.minutes - a.minutes || a.code.localeCompare(b.code));

  const byCity = [...cities.values()]
    .map((c) => ({ ...c, share: matchedGames > 0 ? c.games / matchedGames : 0 }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, TOP);

  const byStudio = [...studios.values()]
    .map((s) => ({ ...s, share: matchedGames > 0 ? s.games / matchedGames : 0 }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, TOP);

  return {
    owned: minutesByApp.size,
    matched: matchedApps,
    unmatchedAppIds: minutesByApp.size - matchedApps,
    byCountry,
    byCity,
    byStudio,
    unknownLocation,
    gameIds: new Set(minutesByGame.keys()),
  };
}

export function largestRemainderPercents(shares: number[]): number[] {
  const clean = shares.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total === 0) return clean.map(() => 0);
  const exact = clean.map((s) => (s / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - floors[i]! }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}

export interface CountryRow {
  code: string | null;
  games: number;
  percent: number;
}

export function countryRows(
  origins: Origins,
  by: 'games' | 'playtime',
  limit: number,
): { rows: CountryRow[]; other: { countries: number; games: number; percent: number } | null } {
  const sorted = [...origins.byCountry].sort((a, b) =>
    by === 'games' ? 0 : b.minutes - a.minutes || b.games - a.games || a.code.localeCompare(b.code),
  );
  const share = (c: (typeof sorted)[number]) => (by === 'games' ? c.share : c.minutesShare);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  const tailShare = tail.reduce((a, c) => a + share(c), 0);
  const shares = [...head.map(share), ...(tail.length > 0 ? [tailShare] : [])];
  const percents = largestRemainderPercents(shares);
  const rows = head.map((c, i) => ({ code: c.code, games: c.games, percent: percents[i]! }));
  const other =
    tail.length > 0
      ? { countries: tail.length, games: tail.reduce((a, c) => a + c.games, 0), percent: percents[head.length]! }
      : null;
  return { rows, other };
}

export function sampleLibrary(steamMap: Record<string, number>, indexes: Indexes, count = 60): OwnedGame[] {
  const appByGame = new Map<number, number>();
  for (const [app, gameId] of Object.entries(steamMap)) {
    const appId = Number(app);
    if (!Number.isInteger(appId)) continue;
    const prev = appByGame.get(gameId);
    if (prev === undefined || appId < prev) appByGame.set(gameId, appId);
  }
  const out: OwnedGame[] = [];
  for (const g of indexes.games) {
    const appId = appByGame.get(g.id);
    if (appId === undefined) continue;
    out.push({ appId, minutes: ((appId * 37) % 3000) + 30 });
    if (out.length >= count) break;
  }
  return out;
}
