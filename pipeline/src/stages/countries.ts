import path from 'node:path';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame } from '../raw';
import { readJson, writeJson } from '../stageio';
import { companiesQuery, CURRENT_FIELDS, gamesByIdQuery, igdbClient, list, mapCompany, mapGame, numOrNull, refId } from './igdb';

const PAGE = 500;
export const COUNTRY_FLOOR = 10;

// Studios of a country, with the games they developed; one sweep over every IGDB company that has both.
function companyPage(lastId: number): string {
  return `fields country,developed; where country != null & developed != null & id > ${lastId}; sort id asc; limit ${PAGE};`;
}

export interface FloorCandidate {
  game: RawIgdbGame;
  developerCountries: number[]; // countries of its developers that have one
}

// Games are ranked by IGDB ratings, then by having a cover, then newest first.
export function pickFloor(candidates: FloorCandidate[], country: number, need: number): RawIgdbGame[] {
  return candidates
    .filter((c) => c.developerCountries.length > 0 && c.developerCountries.every((k) => k === country))
    .sort(
      (a, b) =>
        b.game.totalRatingCount - a.game.totalRatingCount ||
        Number(b.game.cover !== null) - Number(a.game.cover !== null) ||
        (b.game.firstReleaseDate ?? 0) - (a.game.firstReleaseDate ?? 0) ||
        a.game.id - b.game.id,
    )
    .slice(0, need)
    .map((c) => c.game);
}

// Adds each country's best known games, even below the player floor, until it has COUNTRY_FLOOR games
// whose developers all come from it, so every country with game studios shows up on the globe.
export async function runCountriesStage(
  config: PipelineConfig,
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (msg: string) => void } = {},
): Promise<{ countries: number; added: number; companiesAdded: number }> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const gamesFile = path.join(config.stageDir, STAGE_FILES.igdbGames);
  const companiesFile = path.join(config.stageDir, STAGE_FILES.igdbCompanies);
  const games = await readJson<RawIgdbGame[]>(gamesFile);
  const companies = await readJson<RawIgdbCompany[]>(companiesFile);
  const { postRows } = await igdbClient(config, deps, log);

  const countryOf = new Map<number, number>();
  for (const c of companies) if (c.country !== null) countryOf.set(c.id, c.country);
  const developedIn = new Map<number, Set<number>>();
  let lastId = 0;
  for (let n = 0; ; n++) {
    const rows = await postRows('companies', companyPage(lastId));
    if (rows.length === 0) break;
    for (const r of rows) {
      const id = numOrNull(r.id);
      const country = numOrNull(r.country);
      if (id === null) continue;
      lastId = Math.max(lastId, id);
      if (country === null) continue;
      countryOf.set(id, country);
      let set = developedIn.get(country);
      if (!set) developedIn.set(country, (set = new Set()));
      for (const g of list(r.developed)) {
        const gid = refId(g);
        if (gid !== null) set.add(gid);
      }
    }
    if (n % 20 === 0) log(`countries: ${countryOf.size} studios read`);
  }

  const developerCountries = (g: RawIgdbGame) => [
    ...new Set(g.involvedCompanies.filter((c) => c.developer).flatMap((c) => (countryOf.has(c.company) ? [countryOf.get(c.company)!] : []))),
  ];
  const have = new Map<number, number>();
  const known = new Set(games.map((g) => g.id));
  for (const g of games) {
    const cs = developerCountries(g);
    if (cs.length === 1) have.set(cs[0]!, (have.get(cs[0]!) ?? 0) + 1);
  }

  const added: RawIgdbGame[] = [];
  let countries = 0;
  for (const [country, ids] of [...developedIn].sort((a, b) => a[0] - b[0])) {
    const need = COUNTRY_FLOOR - (have.get(country) ?? 0);
    if (need <= 0) continue;
    const todo = [...ids].filter((id) => !known.has(id));
    if (todo.length === 0) continue;
    const candidates: FloorCandidate[] = [];
    for (let i = 0; i < todo.length; i += PAGE) {
      for (const row of await postRows('games', gamesByIdQuery(CURRENT_FIELDS, todo.slice(i, i + PAGE)))) {
        const game = mapGame(row, CURRENT_FIELDS);
        if (game) candidates.push({ game, developerCountries: [] });
      }
    }
    for (const c of candidates) c.developerCountries = developerCountries(c.game);
    const picked = pickFloor(candidates, country, need);
    if (picked.length === 0) continue;
    countries++;
    for (const g of picked) {
      known.add(g.id);
      added.push(g);
    }
  }

  const haveCompany = new Set(companies.map((c) => c.id));
  const missing = [...new Set(added.flatMap((g) => g.involvedCompanies.map((c) => c.company)))].filter((id) => !haveCompany.has(id));
  const newCompanies: RawIgdbCompany[] = [];
  for (let i = 0; i < missing.length; i += PAGE) {
    for (const row of await postRows('companies', companiesQuery(missing.slice(i, i + PAGE)))) {
      const c = mapCompany(row);
      if (c) newCompanies.push(c);
    }
  }

  if (added.length > 0) {
    await writeJson(gamesFile, [...games, ...added]);
    await writeJson(companiesFile, [...companies, ...newCompanies].sort((a, b) => a.id - b.id));
  }
  log(`countries: added ${added.length} games for ${countries} countries, ${newCompanies.length} new companies`);
  return { countries, added: added.length, companiesAdded: newCompanies.length };
}
