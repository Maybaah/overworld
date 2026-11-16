import path from 'node:path';
import { createHttp } from '../http';
import type { PipelineConfig } from '../config';
import {
  STAGE_FILES,
  type RawIgdbCompany,
  type RawIgdbGame,
  type RawIgdbGenre,
  type RawIgdbInvolvedCompany,
} from '../raw';
import { readJsonIfExists, writeJson } from '../stageio';
import { calibrate, estimatePlayers, PLAYER_FLOOR, type AudienceSignals } from '../audience';
import type { RawRawgGame, RawSteamApp } from '../raw';
import { normalizeTitle } from './mobygames';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_BASE = 'https://api.igdb.com/v4';
const PAGE_SIZE = 500;
const COMPANY_BATCH = 500;
const MAX_SCREENSHOTS = 5;
const GAME_TYPE_IDS = [0, 8, 9];
const STEAM_SOURCE_ID = 1;
// In the audience pass the rating pass reads every game with at least this many IGDB ratings.
const RATING_FLOOR = 25;
const PLAYED_TYPE = 4;
const ID_BATCH = 500;
const STEAM_ITEMS = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
const STEAM_BATCH = 200;

interface GameFieldNames {
  gameType: string;
  externalGameSource: string;
}

const CURRENT_FIELDS: GameFieldNames = { gameType: 'game_type', externalGameSource: 'external_game_source' };
const LEGACY_FIELDS: GameFieldNames = { gameType: 'category', externalGameSource: 'category' };

const gameFields = (f: GameFieldNames) =>
  [
    'name',
    'slug',
    'url',
    'first_release_date',
    'total_rating_count',
    f.gameType,
    'genres',
    'platforms.name',
    'cover.image_id',
    'screenshots.image_id',
    'involved_companies.id',
    'involved_companies.company',
    'involved_companies.developer',
    'involved_companies.publisher',
    'involved_companies.porting',
    'involved_companies.supporting',
    'external_games.uid',
    `external_games.${f.externalGameSource}`,
  ].join(',');

function gamesQuery(f: GameFieldNames, offset: number, minRating = 1): string {
  return (
    `fields ${gameFields(f)}; ` +
    `where ${f.gameType} = (${GAME_TYPE_IDS.join(',')}) & total_rating_count >= ${minRating} & involved_companies != null; ` +
    `sort total_rating_count desc; limit ${PAGE_SIZE}; offset ${offset};`
  );
}

function gamesByIdQuery(f: GameFieldNames, ids: number[]): string {
  return (
    `fields ${gameFields(f)}; ` +
    `where id = (${ids.join(',')}) & ${f.gameType} = (${GAME_TYPE_IDS.join(',')}) & involved_companies != null; ` +
    `limit ${ids.length};`
  );
}

function companiesQuery(ids: number[]): string {
  return (
    'fields name,slug,url,country,start_date,parent,changed_company_id; ' +
    `where id = (${ids.join(',')}); limit ${COMPANY_BATCH};`
  );
}

const GENRES_QUERY = 'fields name; limit 500;';

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function refId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (isRow(v)) return numOrNull(v.id);
  return null;
}

function mapInvolvedCompany(v: unknown): RawIgdbInvolvedCompany | null {
  if (!isRow(v)) return null;
  const id = numOrNull(v.id);
  const company = refId(v.company);
  if (id === null || company === null) return null;
  return {
    id,
    company,
    developer: v.developer === true,
    publisher: v.publisher === true,
    porting: v.porting === true,
    supporting: v.supporting === true,
  };
}

function steamAppIds(externals: unknown, f: GameFieldNames): number[] {
  const ids: number[] = [];
  for (const e of list(externals)) {
    if (!isRow(e) || refId(e[f.externalGameSource]) !== STEAM_SOURCE_ID) continue;
    const uid = typeof e.uid === 'string' ? e.uid.trim() : typeof e.uid === 'number' ? String(e.uid) : '';
    if (!/^\d+$/.test(uid)) continue;
    const id = Number.parseInt(uid, 10);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function mapGame(v: Row, f: GameFieldNames): RawIgdbGame | null {
  const id = numOrNull(v.id);
  if (id === null) return null;
  const steamIds = steamAppIds(v.external_games, f);
  return {
    id,
    name: str(v.name),
    slug: str(v.slug),
    url: str(v.url),
    firstReleaseDate: numOrNull(v.first_release_date),
    totalRatingCount: numOrNull(v.total_rating_count) ?? 0,
    gameType: refId(v[f.gameType]),
    genres: list(v.genres).map(refId).filter((g): g is number => g !== null),
    platforms: list(v.platforms)
      .map((p) => (isRow(p) ? str(p.name) : ''))
      .filter((n) => n !== ''),
    cover: isRow(v.cover) && typeof v.cover.image_id === 'string' ? v.cover.image_id : null,
    screenshots: list(v.screenshots)
      .map((s) => (isRow(s) && typeof s.image_id === 'string' ? s.image_id : ''))
      .filter((s) => s !== '')
      .slice(0, MAX_SCREENSHOTS),
    involvedCompanies: list(v.involved_companies)
      .map(mapInvolvedCompany)
      .filter((c): c is RawIgdbInvolvedCompany => c !== null),
    steamAppId: steamIds[0] ?? null,
    steamAppIds: steamIds,
  };
}

function mapCompany(v: Row): RawIgdbCompany | null {
  const id = numOrNull(v.id);
  if (id === null) return null;
  return {
    id,
    name: str(v.name),
    slug: str(v.slug),
    url: str(v.url),
    country: numOrNull(v.country),
    startDate: numOrNull(v.start_date),
    parent: refId(v.parent),
    changedCompanyId: refId(v.changed_company_id),
  };
}

function looksLikeUnknownField(body: string): boolean {
  return /field|unknown|category|game_type|external_game_source/i.test(body);
}

export async function runIgdbStage(
  config: PipelineConfig,
  deps: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    log?: (msg: string) => void;
  } = {},
): Promise<{ games: number; companies: number; skipped: boolean }> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const gamesFile = path.join(config.stageDir, STAGE_FILES.igdbGames);
  const companiesFile = path.join(config.stageDir, STAGE_FILES.igdbCompanies);
  const genresFile = path.join(config.stageDir, STAGE_FILES.igdbGenres);

  if (!config.refresh) {
    const [g, c, ge] = await Promise.all([
      readJsonIfExists<RawIgdbGame[]>(gamesFile),
      readJsonIfExists<RawIgdbCompany[]>(companiesFile),
      readJsonIfExists<RawIgdbGenre[]>(genresFile),
    ]);
    if (g && c && ge) {
      log(`IGDB: stage files exist, skipping (${g.length} games, ${c.length} companies)`);
      return { games: g.length, companies: c.length, skipped: true };
    }
  }

  const { twitchClientId, twitchClientSecret } = config;
  if (!twitchClientId || !twitchClientSecret) {
    throw new Error(
      'IGDB credentials are missing: set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the .env file at the repo root.',
    );
  }

  const http = createHttp({
    minIntervalMs: 280,
    maxConcurrent: 4,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });

  const tokenRes = await http.request(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Twitch token request failed: HTTP ${tokenRes.status} ${tokenText.slice(0, 300)}`);
  }
  let accessToken: unknown;
  try {
    accessToken = (JSON.parse(tokenText) as Row).access_token;
  } catch {
    accessToken = undefined;
  }
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new Error('Twitch token response did not contain an access_token');
  }
  log('IGDB: obtained access token');

  async function post(endpoint: string, body: string): Promise<{ status: number; text: string }> {
    const res = await http.request(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': twitchClientId as string,
        Authorization: `Bearer ${accessToken as string}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body,
    });
    return { status: res.status, text: await res.text() };
  }

  async function postRows(endpoint: string, body: string): Promise<Row[]> {
    const { status, text } = await post(endpoint, body);
    if (status < 200 || status >= 300) {
      throw new Error(`IGDB ${endpoint} request failed: HTTP ${status} ${text.slice(0, 300)}`);
    }
    return parseRows(endpoint, text);
  }

  function parseRows(endpoint: string, text: string): Row[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`IGDB ${endpoint} returned invalid JSON: ${text.slice(0, 300)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`IGDB ${endpoint} returned a non-array response: ${text.slice(0, 300)}`);
    }
    return parsed.filter(isRow);
  }

  let fields = CURRENT_FIELDS;
  let triedLegacy = false;

  async function gamesPage(offset: number, minRating: number): Promise<Row[]> {
    let res = await post('games', gamesQuery(fields, offset, minRating));
    if (res.status === 400 && !triedLegacy && looksLikeUnknownField(res.text)) {
      triedLegacy = true;
      log('IGDB games: field names rejected, retrying with legacy field names');
      fields = LEGACY_FIELDS;
      res = await post('games', gamesQuery(fields, offset, minRating));
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`IGDB games request failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
    }
    return parseRows('games', res.text);
  }

  const steamApps = await readJsonIfExists<RawSteamApp[]>(path.join(config.stageDir, STAGE_FILES.steamspy));
  const audience = steamApps !== null;

  const collected = new Map<number, RawIgdbGame>();
  const ratingCap = audience ? Infinity : config.gameLimit;
  for (let offset = 0; collected.size < ratingCap; offset += PAGE_SIZE) {
    const page = await gamesPage(offset, audience ? RATING_FLOOR : 1);
    if (page.length === 0) break;
    for (const row of page) {
      const game = mapGame(row, fields);
      if (game && !collected.has(game.id)) collected.set(game.id, game);
    }
    log(`IGDB games by ratings: ${collected.size}${audience ? '' : `/${config.gameLimit}`}`);
  }

  let games: RawIgdbGame[];
  if (!audience) {
    games = [...collected.values()]
      .sort((a, b) => b.totalRatingCount - a.totalRatingCount || a.id - b.id)
      .slice(0, config.gameLimit);
  } else {
    games = await audiencePass(steamApps);
  }

  // Review counts from Steam's store API, 200 apps per request; kept in a stage file so a rerun skips it.
  async function steamReviews(appids: number[]): Promise<Map<number, number>> {
    const file = path.join(config.stageDir, STAGE_FILES.steamReviews);
    const cached = config.refresh ? null : await readJsonIfExists<Record<string, number>>(file);
    const out = new Map<number, number>(cached ? Object.entries(cached).map(([k, v]) => [Number(k), v]) : []);
    const todo = appids.filter((a) => !cached || !(String(a) in cached));
    const steamHttp = createHttp({ minIntervalMs: 350, maxConcurrent: 2, fetchImpl: deps.fetchImpl, sleep: deps.sleep });
    const seen: Record<string, number> = { ...(cached ?? {}) };
    for (let i = 0; i < todo.length; i += STEAM_BATCH) {
      const batch = todo.slice(i, i + STEAM_BATCH);
      const input = { ids: batch.map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_reviews: true } };
      const res = await steamHttp.request(`${STEAM_ITEMS}?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      if (!res.ok) throw new Error(`Steam GetItems failed: HTTP ${res.status}`);
      const body = (await res.json()) as { response?: { store_items?: Row[] } };
      for (const appid of batch) seen[String(appid)] = 0;
      for (const item of body.response?.store_items ?? []) {
        const appid = numOrNull(item.appid) ?? numOrNull(item.id);
        const reviews = isRow(item.reviews) && isRow(item.reviews.summary_filtered) ? numOrNull(item.reviews.summary_filtered.review_count) : null;
        if (appid === null || !reviews) continue;
        seen[String(appid)] = reviews;
        out.set(appid, reviews);
      }
      if ((i / STEAM_BATCH) % 25 === 0) log(`Steam reviews: ${Math.min(i + STEAM_BATCH, todo.length)}/${todo.length}`);
    }
    await writeJson(file, seen);
    return out;
  }

  // Adds every game that Steam or IGDB "Played" says enough people played, then estimates players for all.
  async function audiencePass(apps: RawSteamApp[]): Promise<RawIgdbGame[]> {
    const signals = new Map<number, AudienceSignals>();
    const sig = (id: number) => {
      let s = signals.get(id);
      if (!s) signals.set(id, (s = {}));
      return s;
    };

    let lastId = 0;
    for (let n = 0; ; n++) {
      const rows = await postRows(
        'popularity_primitives',
        `fields game_id,value; where popularity_type = ${PLAYED_TYPE} & id > ${lastId}; sort id asc; limit ${PAGE_SIZE};`,
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        lastId = Math.max(lastId, numOrNull(r.id) ?? lastId);
        const gameId = refId(r.game_id);
        const value = numOrNull(r.value);
        if (gameId !== null && value !== null && value > 0) sig(gameId).igdbPlayed = value;
      }
      if (n % 20 === 0) log(`IGDB played shares: ${signals.size}`);
    }

    // Every Steam app IGDB links to a game that could be on the globe.
    const gamesByApp = new Map<number, number[]>();
    let lastLink = 0;
    for (let n = 0; ; n++) {
      const rows = await postRows(
        'external_games',
        `fields game,uid; where ${fields.externalGameSource} = ${STEAM_SOURCE_ID} & game.${fields.gameType} = (${GAME_TYPE_IDS.join(',')}) & game.involved_companies != null & id > ${lastLink}; sort id asc; limit ${PAGE_SIZE};`,
      );
      if (rows.length === 0) break;
      for (const r of rows) {
        lastLink = Math.max(lastLink, numOrNull(r.id) ?? lastLink);
        const gameId = refId(r.game);
        const uid = str(r.uid).trim();
        if (gameId === null || !/^\d+$/.test(uid)) continue;
        const appid = Number(uid);
        const list = gamesByApp.get(appid) ?? [];
        if (!list.includes(gameId)) list.push(gameId);
        gamesByApp.set(appid, list);
      }
      if (n % 20 === 0) log(`IGDB Steam links: ${gamesByApp.size}`);
    }

    const reviews = await steamReviews([...gamesByApp.keys()]);
    for (const [appid, gameIds] of gamesByApp) {
      const count = reviews.get(appid);
      if (!count) continue;
      for (const id of gameIds) sig(id).steamReviews = Math.max(sig(id).steamReviews ?? 0, count);
    }
    for (const app of apps) {
      for (const id of gamesByApp.get(app.appid) ?? []) sig(id).steamOwnersLow = Math.max(sig(id).steamOwnersLow ?? 0, app.ownersLow);
    }
    log(`Steam: ${reviews.size} apps with reviews, ${[...signals.values()].filter((x) => x.steamReviews).length} games`);
    for (const g of collected.values()) sig(g.id).ratingCount = g.totalRatingCount;

    const rawg = await readJsonIfExists<RawRawgGame[]>(path.join(config.stageDir, STAGE_FILES.rawg));
    if (rawg && rawg.length > 0) {
      // RAWG has no IGDB ids, so its games are matched by title and year to the games already in the pool.
      const titles = new Map<string, { id: number; year: number | null }[]>();
      const addTitle = (id: number, name: string, year: number | null) => {
        const key = normalizeTitle(name);
        if (!key) return;
        const list = titles.get(key) ?? [];
        list.push({ id, year });
        titles.set(key, list);
      };
      for (const g of collected.values()) addTitle(g.id, g.name, g.firstReleaseDate ? new Date(g.firstReleaseDate * 1000).getUTCFullYear() : null);
      const unnamed = [...signals.keys()].filter((id) => !collected.has(id));
      for (let i = 0; i < unnamed.length; i += ID_BATCH) {
        const rows = await postRows(
          'games',
          `fields name,first_release_date; where id = (${unnamed.slice(i, i + ID_BATCH).join(',')}) & ${fields.gameType} = (${GAME_TYPE_IDS.join(',')}) & involved_companies != null; limit ${ID_BATCH};`,
        );
        for (const r of rows) {
          const id = numOrNull(r.id);
          const date = numOrNull(r.first_release_date);
          if (id !== null) addTitle(id, str(r.name), date ? new Date(date * 1000).getUTCFullYear() : null);
        }
        if ((i / ID_BATCH) % 40 === 0) log(`IGDB titles for RAWG matching: ${Math.min(i + ID_BATCH, unnamed.length)}/${unnamed.length}`);
      }
      let matched = 0;
      for (const r of rawg) {
        const cands = (titles.get(normalizeTitle(r.name)) ?? []).filter((c) => r.year === null || c.year === null || Math.abs(c.year - r.year) <= 1);
        if (cands.length !== 1) continue;
        const s = sig(cands[0]!.id);
        s.rawgAdded = Math.max(s.rawgAdded ?? 0, r.added);
        matched++;
      }
      log(`RAWG: ${matched} of ${rawg.length} games matched to IGDB by title and year`);
    }

    const calibration = calibrate(signals.values());
    log(
      `audience calibration: played x${calibration.igdbPlayed?.toFixed(0) ?? '-'} (${calibration.pairs.igdbPlayed} pairs), ` +
        `ratings x${calibration.ratingCount?.toFixed(0) ?? '-'} (${calibration.pairs.ratingCount} pairs)`,
    );

    const wanted = [...signals.entries()]
      .filter(([id, s]) => !collected.has(id) && (estimatePlayers(s, calibration)?.players ?? 0) >= PLAYER_FLOOR)
      .map(([id]) => id);
    for (let i = 0; i < wanted.length; i += ID_BATCH) {
      for (const row of await postRows('games', gamesByIdQuery(fields, wanted.slice(i, i + ID_BATCH)))) {
        const game = mapGame(row, fields);
        if (game) collected.set(game.id, game);
      }
      log(`IGDB games by audience: ${Math.min(i + ID_BATCH, wanted.length)}/${wanted.length}`);
    }

    const out: RawIgdbGame[] = [];
    for (const g of collected.values()) {
      const s = { ...sig(g.id), ratingCount: g.totalRatingCount };
      const est = estimatePlayers(s, calibration);
      if (!est || est.players < PLAYER_FLOOR) continue;
      out.push({ ...g, players: est.players, playersBasis: est.basis });
    }
    out.sort((a, b) => (b.players ?? 0) - (a.players ?? 0) || a.id - b.id);
    const byBasis = out.reduce<Record<string, number>>((acc, g) => ((acc[g.playersBasis!] = (acc[g.playersBasis!] ?? 0) + 1), acc), {});
    log(`audience: ${out.length} games with ${PLAYER_FLOOR}+ estimated players (${JSON.stringify(byBasis)})`);
    return out.slice(0, config.gameLimit);
  }

  const companyIds = [...new Set(games.flatMap((g) => g.involvedCompanies.map((c) => c.company)))].sort(
    (a, b) => a - b,
  );
  const companies = new Map<number, RawIgdbCompany>();
  for (let i = 0; i < companyIds.length; i += COMPANY_BATCH) {
    const batch = companyIds.slice(i, i + COMPANY_BATCH);
    for (const row of await postRows('companies', companiesQuery(batch))) {
      const company = mapCompany(row);
      if (company) companies.set(company.id, company);
    }
    log(`IGDB companies: ${companies.size}/${companyIds.length}`);
  }
  const missing = companyIds.length - companyIds.filter((id) => companies.has(id)).length;
  if (missing > 0) log(`IGDB companies: ${missing} of ${companyIds.length} ids were not returned`);

  const genres: RawIgdbGenre[] = (await postRows('genres', GENRES_QUERY))
    .map((r) => ({ id: numOrNull(r.id), name: str(r.name) }))
    .filter((g): g is RawIgdbGenre => g.id !== null)
    .sort((a, b) => a.id - b.id);

  const companyList = [...companies.values()].sort((a, b) => a.id - b.id);
  await writeJson(gamesFile, games);
  await writeJson(companiesFile, companyList);
  await writeJson(genresFile, genres);
  log(`IGDB: wrote ${games.length} games, ${companyList.length} companies, ${genres.length} genres`);

  return { games: games.length, companies: companyList.length, skipped: false };
}
