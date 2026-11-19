import path from 'node:path';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame } from '../raw';
import { readJson, readJsonIfExists, writeJson } from '../stageio';
import { loadCityRecords } from '../cities';
import { alpha2ToNumeric } from '../countries';
import type { LeadOverride, LocationCorrection } from '../merge';
import { correctionFor, CURATED_ID_BASE, curatedCompany, curatedCompanyId, curatedGame, developerOf, pickSearchHit, type CountryGame } from './countryGames';
import { companiesQuery, CURRENT_FIELDS, gameFields, gamesByIdQuery, igdbClient, list, mapCompany, mapGame, numOrNull, refId } from './igdb';

const PAGE = 500;
export const COUNTRY_FLOOR = 10;

function companyPage(lastId: number): string {
  return `fields country,developed; where country != null & developed != null & id > ${lastId}; sort id asc; limit ${PAGE};`;
}

export interface FloorCandidate {
  game: RawIgdbGame;
  developerCountries: number[];
}

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

export async function runCountriesStage(
  config: PipelineConfig,
  deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; log?: (msg: string) => void } = {},
): Promise<{ countries: number; added: number; companiesAdded: number; handListed: number; notOnIgdb: number }> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const gamesFile = path.join(config.stageDir, STAGE_FILES.igdbGames);
  const companiesFile = path.join(config.stageDir, STAGE_FILES.igdbCompanies);
  const games = (await readJson<RawIgdbGame[]>(gamesFile)).filter((g) => !g.curated);
  const companies = (await readJson<RawIgdbCompany[]>(companiesFile)).filter((c) => !c.curated);
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

  const curated = (await readJsonIfExists<CountryGame[]>(path.join(config.curatedDir, 'country-games.json'))) ?? [];
  const byId = new Map([...games, ...added].map((g) => [g.id, g]));
  const matched: { entry: CountryGame; game: RawIgdbGame }[] = [];
  const fields = gameFields(CURRENT_FIELDS);
  const quote = (t: string) => t.replace(/[\\"]/g, ' ');
  let notOnIgdb = 0;
  for (const entry of curated) {
    let game: RawIgdbGame | null = entry.igdbGameId ? (byId.get(entry.igdbGameId) ?? null) : null;
    if (!game && !entry.notOnIgdb) {
      const where = entry.igdbGameId
        ? `where id = ${entry.igdbGameId};`
        : entry.igdbSlug
          ? `where slug = "${quote(entry.igdbSlug)}";`
          : `search "${quote(entry.game)}"; where themes != (42);`;
      const hits = (await postRows('games', `fields ${fields}; ${where} limit 20;`))
        .map((r) => mapGame(r, CURRENT_FIELDS))
        .filter((g): g is RawIgdbGame => g !== null);
      game = entry.igdbGameId || entry.igdbSlug ? (hits[0] ?? null) : pickSearchHit(entry, hits);
    }
    if (!game) {
      game = curatedGame(entry);
      notOnIgdb++;
    }
    matched.push({ entry, game });
    if (!known.has(game.id)) {
      known.add(game.id);
      added.push(game);
      byId.set(game.id, game);
    }
  }

  const haveCompany = new Set(companies.map((c) => c.id));
  const missing = [...new Set(added.flatMap((g) => g.involvedCompanies.map((c) => c.company)))].filter(
    (id) => !haveCompany.has(id) && id < CURATED_ID_BASE,
  );
  const newCompanies: RawIgdbCompany[] = [];
  for (let i = 0; i < missing.length; i += PAGE) {
    for (const row of await postRows('companies', companiesQuery(missing.slice(i, i + PAGE)))) {
      const c = mapCompany(row);
      if (c) newCompanies.push(c);
    }
  }
  const listed = new Map<number, RawIgdbCompany>();
  const allCompanies = () => [...companies, ...newCompanies, ...listed.values()];
  const names = new Map(allCompanies().map((c) => [c.id, c.name]));
  const companyById = new Map(allCompanies().map((c) => [c.id, c]));
  const cities = matched.length > 0 ? loadCityRecords() : [];
  const corrections: LocationCorrection[] = [];
  const leads: LeadOverride[] = [];
  let patched = 0;
  for (const { entry, game } of matched) {
    const dev = developerOf(entry, game, names);
    let company = dev === null ? undefined : companyById.get(dev);
    if (!company || company.curated) {
      company = listed.get(curatedCompanyId(entry)) ?? curatedCompany(entry);
      listed.set(company.id, company);
      companyById.set(company.id, company);
    }
    leads.push({ igdbGameId: game.id, game: game.name, igdbCompanyId: company.id, company: company.name, evidenceUrl: entry.evidenceUrl });
    const fix = correctionFor(entry, company.id, company.name, cities);
    if (fix) corrections.push(fix);
    else if (company.country === null) {
      company.country = alpha2ToNumeric(entry.country);
      patched++;
    }
  }

  await writeJson(gamesFile, [...games, ...added]);
  await writeJson(companiesFile, allCompanies().sort((a, b) => a.id - b.id));
  await writeJson(path.join(config.stageDir, STAGE_FILES.countryStudios), corrections);
  await writeJson(path.join(config.stageDir, STAGE_FILES.countryLeads), leads);
  log(
    `countries: added ${added.length} games (${countries} countries by IGDB studios, ${matched.length} hand-listed, ${notOnIgdb} of them not on IGDB), ` +
      `${newCompanies.length} new companies, ${listed.size} studios from the list, ${corrections.length} placed in a city, ${patched} given a country`,
  );
  return { countries, added: added.length, companiesAdded: newCompanies.length, handListed: matched.length, notOnIgdb };
}
