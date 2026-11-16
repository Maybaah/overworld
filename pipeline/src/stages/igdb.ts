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

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_BASE = 'https://api.igdb.com/v4';
const PAGE_SIZE = 500;
const COMPANY_BATCH = 500;
const MAX_SCREENSHOTS = 5;
const GAME_TYPE_IDS = [0, 8, 9];
const STEAM_SOURCE_ID = 1;

interface GameFieldNames {
  gameType: string;
  externalGameSource: string;
}

const CURRENT_FIELDS: GameFieldNames = { gameType: 'game_type', externalGameSource: 'external_game_source' };
const LEGACY_FIELDS: GameFieldNames = { gameType: 'category', externalGameSource: 'category' };

function gamesQuery(f: GameFieldNames, offset: number): string {
  const fields = [
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
  return (
    `fields ${fields}; ` +
    `where ${f.gameType} = (${GAME_TYPE_IDS.join(',')}) & total_rating_count > 0 & involved_companies != null; ` +
    `sort total_rating_count desc; limit ${PAGE_SIZE}; offset ${offset};`
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

  async function gamesPage(offset: number): Promise<Row[]> {
    let res = await post('games', gamesQuery(fields, offset));
    if (res.status === 400 && !triedLegacy && looksLikeUnknownField(res.text)) {
      triedLegacy = true;
      log('IGDB games: field names rejected, retrying with legacy field names');
      fields = LEGACY_FIELDS;
      res = await post('games', gamesQuery(fields, offset));
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`IGDB games request failed: HTTP ${res.status} ${res.text.slice(0, 300)}`);
    }
    return parseRows('games', res.text);
  }

  const collected = new Map<number, RawIgdbGame>();
  for (let offset = 0; collected.size < config.gameLimit; offset += PAGE_SIZE) {
    const page = await gamesPage(offset);
    if (page.length === 0) break;
    for (const row of page) {
      const game = mapGame(row, fields);
      if (game && !collected.has(game.id)) collected.set(game.id, game);
    }
    log(`IGDB games: ${Math.min(collected.size, config.gameLimit)}/${config.gameLimit}`);
  }

  const games = [...collected.values()]
    .sort((a, b) => b.totalRatingCount - a.totalRatingCount || a.id - b.id)
    .slice(0, config.gameLimit);

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
