import { createHash } from 'node:crypto';
import path from 'node:path';
import { createHttp, type Http } from '../http';
import type { PipelineConfig } from '../config';
import { normalizeCompanyName, sameCompanyLoosely } from '../names';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame, type RawMobyCompanyRole, type RawMobyGame } from '../raw';
import { readJsonIfExists, writeJson } from '../stageio';

const API = 'https://api.mobygames.com/v2/games';
const INCLUDE = 'game_id,title,moby_url,platforms,developers,publishers';
const MIN_INTERVAL_MS = 5_200;
const STEAM_BATCH = 5; // API rejects more than 5 Steam ids per request
const TITLE_PAGES = 3;
const PAGE_SIZE = 100;
const YEAR_TOLERANCE = 1;
const WIDE_YEAR_TOLERANCE = 2;
export const MOBY_REPORT_FILE = 'mobygames-report.json';

interface MobyCompany {
  id: number;
  name: string;
  platforms?: string[] | null;
}

export interface MobyApiGame {
  game_id: number;
  title: string;
  moby_url: string;
  platforms?: { platform_id: number; name: string; release_date: string | null }[] | null;
  developers?: MobyCompany[] | null;
  publishers?: MobyCompany[] | null;
}

export type MatchBasis = 'steam_batch' | 'steam_single' | 'title' | 'title_fuzzy';

export interface MobyStageReport {
  games: number;
  matched: number;
  byBasis: Record<MatchBasis, number>;
  requests: number;
  cached: number;
  unmatched: { igdbGameId: number; name: string; year: number | null }[];
}

export interface MobyDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]+/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function yearOf(date: string | null | undefined): number | null {
  const m = date ? /^(\d{4})/.exec(date) : null;
  return m ? Number(m[1]) : null;
}

export function mobyFirstYear(game: MobyApiGame): number | null {
  const years = (game.platforms ?? []).map((p) => yearOf(p.release_date)).filter((y): y is number => y !== null);
  return years.length ? Math.min(...years) : null;
}

function igdbYear(game: RawIgdbGame): number | null {
  return game.firstReleaseDate === null ? null : new Date(game.firstReleaseDate * 1000).getUTCFullYear();
}

function mainTitle(title: string): string {
  return normalizeTitle(title.split(/:| - /)[0] ?? title);
}

function firstDate(game: MobyApiGame): string {
  return (game.platforms ?? []).map((p) => p.release_date ?? '9999').sort()[0] ?? '9999';
}

const NOT_THE_GAME = /\b(edition|collection|bundle|pack|anthology|trilogy|season pass|expansion|dlc|soundtrack|demo)\b/i;

export function sharedCompanies(game: MobyApiGame, igdbNames: string[]): number {
  const moby = [...(game.developers ?? []), ...(game.publishers ?? [])].map((c) => c.name);
  return new Set(
    moby.filter((m) => igdbNames.some((n) => normalizeCompanyName(n) === normalizeCompanyName(m) || sameCompanyLoosely(n, m))),
  ).size;
}

function closest(
  year: number,
  pool: MobyApiGame[],
  tolerance: number,
  breakTies: boolean,
  igdbNames: string[],
): MobyApiGame | null {
  const scored = pool
    .map((c) => ({ c, d: Math.abs((mobyFirstYear(c) ?? Infinity) - year), shared: sharedCompanies(c, igdbNames) }))
    .filter((s) => s.d <= tolerance)
    .sort(
      (a, b) =>
        a.d - b.d ||
        b.shared - a.shared ||
        (b.c.platforms?.length ?? 0) - (a.c.platforms?.length ?? 0) ||
        firstDate(a.c).localeCompare(firstDate(b.c)) ||
        a.c.game_id - b.c.game_id,
    );
  if (scored.length === 0) return null;
  const best = scored[0]!;
  if (!breakTies && scored.length > 1 && best.d === scored[1]!.d) return null;
  if (best.d > YEAR_TOLERANCE && best.shared === 0) return null;
  return best.c;
}

export function pickByTitle(game: RawIgdbGame, candidates: MobyApiGame[], igdbNames: string[] = []): MobyApiGame | null {
  const wanted = normalizeTitle(game.name);
  const year = igdbYear(game);
  const same = candidates.filter((c) => normalizeTitle(c.title) === wanted);
  if (same.length > 0) {
    if (year === null) return same.length === 1 ? same[0]! : null;
    return closest(year, same, same.length === 1 ? WIDE_YEAR_TOLERANCE : YEAR_TOLERANCE, true, igdbNames);
  }
  if (year === null) return null;
  const wantedMain = mainTitle(game.name);
  const near = candidates.filter((c) => {
    const t = normalizeTitle(c.title);
    if (NOT_THE_GAME.test(c.title)) return false;
    return (wantedMain !== wanted && t === wantedMain) || (mainTitle(c.title) !== t && mainTitle(c.title) === wanted);
  });
  const hit = closest(year, near, YEAR_TOLERANCE, false, igdbNames);
  return hit && sharedCompanies(hit, igdbNames) > 0 ? hit : null;
}

export function toRoles(game: MobyApiGame): RawMobyCompanyRole[] {
  const platforms = game.platforms ?? [];
  const allNames = platforms.map((p) => p.name);
  const yearByPlatform = new Map(platforms.map((p) => [p.name, yearOf(p.release_date)]));
  const firstYear = mobyFirstYear(game);
  const earliest = new Set(platforms.filter((p) => yearOf(p.release_date) === firstYear).map((p) => p.name));
  const covers = (c: MobyCompany) => {
    const own = c.platforms ?? [];
    return own.length === 0 || allNames.every((n) => own.includes(n));
  };
  const developers = game.developers ?? [];
  const roles: RawMobyCompanyRole[] = [];
  const push = (c: MobyCompany, roleName: string) => {
    if (covers(c)) {
      roles.push({ mobyCompanyId: c.id, companyName: c.name, roleName, platform: null, year: firstYear });
      return;
    }
    for (const p of c.platforms ?? []) {
      roles.push({ mobyCompanyId: c.id, companyName: c.name, roleName, platform: p, year: yearByPlatform.get(p) ?? firstYear });
    }
  };
  for (const d of developers) {
    const own = new Set(d.platforms ?? []);
    const isPort =
      !covers(d) &&
      ![...earliest].some((p) => own.has(p)) &&
      developers.some((o) => o !== d && [...earliest].some((p) => (o.platforms ?? []).includes(p)));
    push(d, isPort ? 'Ported by' : 'Developed by');
  }
  for (const p of game.publishers ?? []) push(p, 'Published by');
  return roles;
}

function cacheKey(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('api_key');
  return createHash('sha1').update(u.toString()).digest('hex');
}

export async function runMobygamesStage(
  config: PipelineConfig,
  deps: MobyDeps = {},
): Promise<{ games: number; matched: number; requests: number; skipped: boolean }> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const key = config.mobygamesApiKey;
  if (!key) {
    log('mobygames: no MOBYGAMES_API_KEY set, skipped');
    return { games: 0, matched: 0, requests: 0, skipped: true };
  }
  const igdbGames = await readJsonIfExists<RawIgdbGame[]>(path.join(config.stageDir, STAGE_FILES.igdbGames));
  if (!igdbGames) throw new Error('mobygames: igdb stage file missing, run the igdb stage first');
  const igdbCompanies =
    (await readJsonIfExists<RawIgdbCompany[]>(path.join(config.stageDir, STAGE_FILES.igdbCompanies))) ?? [];
  const companyName = new Map(igdbCompanies.map((c) => [c.id, c.name]));
  const namesOf = (g: RawIgdbGame) =>
    [...new Set(g.involvedCompanies.map((r) => companyName.get(r.company)).filter((n): n is string => !!n))];
  const games = [...igdbGames]
    .sort((a, b) => b.totalRatingCount - a.totalRatingCount || a.id - b.id)
    .slice(0, config.gameLimit);

  const http: Http = createHttp({
    minIntervalMs: MIN_INTERVAL_MS,
    maxConcurrent: 1,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  const cacheDir = path.join(config.httpCacheDir, 'mobygames');
  let requests = 0;
  let cached = 0;

  async function query(params: [string, string][]): Promise<MobyApiGame[]> {
    const qs = new URLSearchParams([...params, ['include', INCLUDE], ['api_key', key!]]);
    const url = `${API}?${qs.toString()}`;
    const file = path.join(cacheDir, `${cacheKey(url)}.json`);
    if (!config.refresh) {
      const hit = await readJsonIfExists<{ games: MobyApiGame[] }>(file);
      if (hit) {
        cached++;
        return hit.games;
      }
    }
    requests++;
    const res = await http.request(url, { headers: { accept: 'application/json' } });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`MobyGames rejected the API key: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    let body: { games?: MobyApiGame[] } = {};
    if (res.ok) {
      body = JSON.parse(text) as { games?: MobyApiGame[] };
    } else if (res.status !== 404) {
      throw new Error(`MobyGames request failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const out = body.games ?? [];
    await writeJson(file, { games: out });
    return out;
  }

  const matches = new Map<number, { moby: MobyApiGame; basis: MatchBasis }>();
  const started = Date.now();
  const progress = (done: number, total: number, phase: string) => {
    if (done % 50 !== 0 && done !== total) return;
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    log(`mobygames ${phase}: ${done}/${total}, matched ${matches.size}, requests ${requests}, cached ${cached}, ${mins} min`);
  };

  const steamIds = (g: RawIgdbGame) => g.steamAppIds.slice(0, STEAM_BATCH);
  const withSteam = games.filter((g) => g.steamAppIds.length > 0);
  const batches: RawIgdbGame[][] = [];
  let current: RawIgdbGame[] = [];
  let ids = 0;
  for (const g of withSteam) {
    if (ids + steamIds(g).length > STEAM_BATCH && current.length) {
      batches.push(current);
      current = [];
      ids = 0;
    }
    current.push(g);
    ids += steamIds(g).length;
  }
  if (current.length) batches.push(current);

  const steamSettled = new Set<number>();
  for (const [i, batch] of batches.entries()) {
    const params = batch.flatMap((g) => steamIds(g).map((s): [string, string] => ['steam_app_id', String(s)]));
    const results = await query(params);
    const claimed = new Set<number>();
    for (const g of batch) {
      const hit = pickByTitle(g, results, namesOf(g));
      if (hit) {
        matches.set(g.id, { moby: hit, basis: 'steam_batch' });
        claimed.add(hit.game_id);
      }
    }
    const open = batch.filter((g) => !matches.has(g.id));
    const unclaimed = results.filter((r) => !claimed.has(r.game_id));
    if (open.length === 1 && unclaimed.length === 1) {
      matches.set(open[0]!.id, { moby: unclaimed[0]!, basis: 'steam_batch' });
    } else if (unclaimed.length === 0) {
      for (const g of open) steamSettled.add(g.id);
    }
    progress(i + 1, batches.length, 'steam batches');
  }

  const rest = games.filter((g) => !matches.has(g.id));
  for (const [i, g] of rest.entries()) {
    if (g.steamAppIds.length > 0 && !steamSettled.has(g.id)) {
      const results = await query(steamIds(g).map((s): [string, string] => ['steam_app_id', String(s)]));
      if (results.length === 1) {
        matches.set(g.id, { moby: results[0]!, basis: 'steam_single' });
        progress(i + 1, rest.length, 'single');
        continue;
      }
    }
    const title = g.name.slice(0, 128);
    let hit: MobyApiGame | null = null;
    for (let page = 0; page < TITLE_PAGES && !hit; page++) {
      const results = await query([
        ['title', title],
        ['limit', String(PAGE_SIZE)],
        ['offset', String(page * PAGE_SIZE)],
      ]);
      hit = pickByTitle(g, results, namesOf(g));
      if (results.length < PAGE_SIZE) break;
    }
    if (hit) matches.set(g.id, { moby: hit, basis: 'title' });
    else {
      const fuzzy = await query([['title', title], ['fuzzy', 'true'], ['limit', '10']]);
      const f = pickByTitle(g, fuzzy, namesOf(g));
      if (f) matches.set(g.id, { moby: f, basis: 'title_fuzzy' });
    }
    progress(i + 1, rest.length, 'single');
  }

  const out: RawMobyGame[] = [];
  const byBasis: Record<MatchBasis, number> = { steam_batch: 0, steam_single: 0, title: 0, title_fuzzy: 0 };
  const unmatched: MobyStageReport['unmatched'] = [];
  for (const g of games) {
    const m = matches.get(g.id);
    if (!m) {
      unmatched.push({ igdbGameId: g.id, name: g.name, year: igdbYear(g) });
      continue;
    }
    byBasis[m.basis]++;
    out.push({ igdbGameId: g.id, mobyGameId: m.moby.game_id, url: m.moby.moby_url, roles: toRoles(m.moby) });
  }

  await writeJson(path.join(config.stageDir, STAGE_FILES.mobygames), out);
  const report: MobyStageReport = { games: games.length, matched: out.length, byBasis, requests, cached, unmatched };
  await writeJson(path.join(config.stageDir, MOBY_REPORT_FILE), report, true);
  log(
    `mobygames: matched ${out.length}/${games.length} (steam batch ${byBasis.steam_batch}, steam single ${byBasis.steam_single}, title ${byBasis.title}, fuzzy ${byBasis.title_fuzzy}); ${requests} requests, ${cached} cached`,
  );
  return { games: games.length, matched: out.length, requests, skipped: false };
}
