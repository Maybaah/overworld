import type { LocationCorrection } from '../merge';
import type { RawIgdbCompany, RawIgdbGame } from '../raw';
import { alpha2ToNumeric } from '../countries';
import type { CityRecord } from '../cities';
import { normalizeCompanyName, sameCompanyLoosely } from '../names';
import { normalizeTitle } from './mobygames';

export interface CountryGame {
  country: string;
  game: string;
  year: number | null;
  developer: string;
  city: string | null;
  evidenceUrl: string;
  igdbGameId?: number | null;
  igdbSlug?: string | null;
  notOnIgdb?: boolean;
  storeUrl?: string | null;
}

export const CURATED_ID_BASE = 1_900_000_000;

function stableId(key: string, offset: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return CURATED_ID_BASE + offset + ((h >>> 0) % 40_000_000);
}

function slugOf(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function curatedCompanyId(entry: CountryGame): number {
  return stableId(`${entry.country}|${slugOf(entry.developer)}`, 50_000_000);
}

export function curatedCompany(entry: CountryGame): RawIgdbCompany {
  return {
    id: curatedCompanyId(entry),
    name: entry.developer,
    slug: slugOf(entry.developer),
    url: entry.evidenceUrl,
    country: alpha2ToNumeric(entry.country),
    startDate: null,
    parent: null,
    changedCompanyId: null,
    curated: true,
  };
}

export function curatedGame(entry: CountryGame): RawIgdbGame {
  const company = curatedCompanyId(entry);
  return {
    id: stableId(`${entry.country}|${slugOf(entry.game)}`, 0),
    name: entry.game,
    slug: slugOf(entry.game),
    url: entry.storeUrl ?? entry.evidenceUrl,
    firstReleaseDate: entry.year === null ? null : Date.UTC(entry.year, 0, 1) / 1000,
    totalRatingCount: 0,
    gameType: 0,
    genres: [],
    platforms: [],
    cover: null,
    screenshots: [],
    involvedCompanies: [{ id: company, company, developer: true, publisher: false, porting: false, supporting: false }],
    steamAppId: null,
    steamAppIds: [],
    curated: true,
  };
}

export function yearOf(g: RawIgdbGame): number | null {
  return g.firstReleaseDate ? new Date(g.firstReleaseDate * 1000).getUTCFullYear() : null;
}

export function pickSearchHit(entry: CountryGame, hits: RawIgdbGame[]): RawIgdbGame | null {
  const want = normalizeTitle(entry.game);
  const same = hits.filter((g) => normalizeTitle(g.name) === want);
  const dated = entry.year === null ? same : same.filter((g) => yearOf(g) === null || Math.abs(yearOf(g)! - entry.year!) <= 1);
  return dated.sort((a, b) => (a.firstReleaseDate ?? Infinity) - (b.firstReleaseDate ?? Infinity) || a.id - b.id)[0] ?? null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function placeOf(entry: CountryGame, cities: readonly CityRecord[]): { city: string; lat: number; lng: number } | null {
  if (!entry.city) return null;
  const name = fold(entry.city);
  const hit = cities
    .filter((c) => c.country === entry.country && fold(c.name) === name)
    .sort((a, b) => b.population - a.population)[0];
  return hit ? { city: hit.name, lat: hit.lat, lng: hit.lng } : null;
}

export function developerOf(entry: CountryGame, game: RawIgdbGame, names: ReadonlyMap<number, string>): number | null {
  const devs = game.involvedCompanies.filter((c) => c.developer).map((c) => c.company);
  const named = devs.find((id) => {
    const n = names.get(id);
    return n !== undefined && (normalizeCompanyName(n) === normalizeCompanyName(entry.developer) || sameCompanyLoosely(n, entry.developer));
  });
  if (named !== undefined) return named;
  return devs.length === 1 ? devs[0]! : null;
}

export function correctionFor(entry: CountryGame, companyId: number, name: string, cities: readonly CityRecord[]): LocationCorrection | null {
  const place = placeOf(entry, cities);
  if (!place) return null;
  return { igdbCompanyId: companyId, name, city: place.city, country: entry.country, lat: place.lat, lng: place.lng, evidenceUrl: entry.evidenceUrl };
}
