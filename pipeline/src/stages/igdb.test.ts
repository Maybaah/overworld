import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame, type RawIgdbGenre } from '../raw';
import { runIgdbStage } from './igdb';

const SECRET = 'test-secret-value-9f3';
const TOKEN = 'test-token-value-7c1';

let stageDir: string;

beforeEach(async () => {
  stageDir = await mkdtemp(path.join(os.tmpdir(), 'overworld-igdb-'));
});

afterEach(async () => {
  await rm(stageDir, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    root: stageDir,
    stageDir,
    httpCacheDir: path.join(stageDir, 'http'),
    outDir: path.join(stageDir, 'out'),
    reportDir: path.join(stageDir, 'reports'),
    curatedDir: path.join(stageDir, 'curated'),
    twitchClientId: 'test-client-id',
    twitchClientSecret: SECRET,
    mobygamesApiKey: null,
    wikidataUserAgent: 'test',
    gameLimit: 10000,
    refresh: false,
    only: null,
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

type Handler = (call: Call) => Response | undefined;

function fakeFetch(handler: Handler) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body === undefined ? '' : String(init.body),
    };
    calls.push(call);
    const res = handler(call);
    if (res) return res;
    if (call.url.startsWith('https://id.twitch.tv/')) {
      return json({ access_token: TOKEN, expires_in: 5000000, token_type: 'bearer' });
    }
    throw new Error(`unexpected request ${call.url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const noSleep = async () => {};
const offsetOf = (body: string) => Number(/offset (\d+);/.exec(body)![1]);
const limitOf = (body: string) => Number(/limit (\d+);/.exec(body)![1]);

function rawGame(id: number, ratingCount: number, companyIds: number[] = [id]) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    url: `https://www.igdb.com/games/game-${id}`,
    total_rating_count: ratingCount,
    game_type: 0,
    involved_companies: companyIds.map((c, i) => ({
      id: id * 1000 + i,
      company: c,
      developer: true,
      publisher: false,
      porting: false,
      supporting: false,
    })),
  };
}

function pagedGames(all: unknown[]): Handler {
  return (call) => {
    if (!call.url.endsWith('/games')) return undefined;
    const offset = offsetOf(call.body);
    return json(all.slice(offset, offset + limitOf(call.body)));
  };
}

function combine(...handlers: Handler[]): Handler {
  return (call) => {
    for (const h of handlers) {
      const res = h(call);
      if (res) return res;
    }
    return undefined;
  };
}

const companiesFor: Handler = (call) => {
  if (!call.url.endsWith('/companies')) return undefined;
  const ids = /id = \(([\d,]+)\)/.exec(call.body)![1]!.split(',').map(Number);
  return json(ids.map((id) => ({ id, name: `Company ${id}`, slug: `company-${id}`, url: `u${id}` })));
};

const genresHandler: Handler = (call) =>
  call.url.endsWith('/genres') ? json([{ id: 12, name: 'Role-playing (RPG)' }, { id: 5, name: 'Shooter' }]) : undefined;

const readStage = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(path.join(stageDir, file), 'utf8')) as T;

describe('runIgdbStage', () => {
  it('throws naming both env vars when credentials are missing', async () => {
    const { fetchImpl, calls } = fakeFetch(() => undefined);

    const run = runIgdbStage(makeConfig({ twitchClientId: null }), { fetchImpl, sleep: noSleep, log: () => {} });
    await expect(run).rejects.toThrow(/TWITCH_CLIENT_ID/);
    await expect(
      runIgdbStage(makeConfig({ twitchClientSecret: null }), { fetchImpl, sleep: noSleep, log: () => {} }),
    ).rejects.toThrow(/TWITCH_CLIENT_SECRET.*\.env|\.env.*TWITCH_CLIENT_SECRET/s);
    expect(calls).toHaveLength(0);
  });

  it('requests a token with client credentials and sends auth headers to IGDB', async () => {
    const { fetchImpl, calls } = fakeFetch(combine(pagedGames([rawGame(1, 10)]), companiesFor, genresHandler));

    await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    const token = calls[0]!;
    expect(token.url).toBe('https://id.twitch.tv/oauth2/token');
    expect(token.method).toBe('POST');
    const form = new URLSearchParams(token.body);
    expect(form.get('client_id')).toBe('test-client-id');
    expect(form.get('client_secret')).toBe(SECRET);
    expect(form.get('grant_type')).toBe('client_credentials');

    const gamesCall = calls.find((c) => c.url === 'https://api.igdb.com/v4/games')!;
    expect(gamesCall.method).toBe('POST');
    expect(gamesCall.headers.get('client-id')).toBe('test-client-id');
    expect(gamesCall.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(gamesCall.body).toContain('game_type = (0,8,9)');
    expect(gamesCall.body).toContain('total_rating_count > 0');
    expect(gamesCall.body).toContain('involved_companies != null');
    expect(gamesCall.body).toContain('sort total_rating_count desc');
    expect(gamesCall.body).toContain('limit 500');
    expect(gamesCall.body).toContain('external_games.external_game_source');
  });

  it('maps a realistic IGDB response, including missing optional fields and the Steam id', async () => {
    const witcher = {
      id: 1942,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'the-witcher-3-wild-hunt',
      url: 'https://www.igdb.com/games/the-witcher-3-wild-hunt',
      first_release_date: 1431993600,
      total_rating_count: 2100,
      game_type: 0,
      genres: [12, 31],
      platforms: [
        { id: 6, name: 'PC (Microsoft Windows)' },
        { id: 48, name: 'PlayStation 4' },
      ],
      cover: { id: 89386, image_id: 'co1wyy' },
      screenshots: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((image_id, i) => ({ id: i, image_id })),
      involved_companies: [
        { id: 1, company: 908, developer: true, publisher: false, porting: false, supporting: false },
        { id: 2, company: 909, developer: false, publisher: true },
      ],
      external_games: [
        { id: 10, uid: '1207664643', external_game_source: 5 },
        { id: 11, uid: '292030', external_game_source: 1 },
      ],
    };
    const sparse = {
      id: 7,
      name: 'Obscure Game',
      slug: 'obscure-game',
      url: 'https://www.igdb.com/games/obscure-game',
      total_rating_count: 5,
      involved_companies: [{ id: 9, company: 3 }],
      external_games: [{ id: 12, uid: 'not-a-number', external_game_source: 1 }],
    };
    const noSteam = {
      ...rawGame(8, 5),
      external_games: [{ id: 13, uid: '55', external_game_source: 5 }],
    };
    const { fetchImpl } = fakeFetch(
      combine(pagedGames([witcher, sparse, noSteam]), companiesFor, genresHandler),
    );

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    expect(result).toEqual({ games: 3, companies: 4, skipped: false });
    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(games.map((g) => g.id)).toEqual([1942, 7, 8]);
    expect(games[0]).toEqual({
      id: 1942,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'the-witcher-3-wild-hunt',
      url: 'https://www.igdb.com/games/the-witcher-3-wild-hunt',
      firstReleaseDate: 1431993600,
      totalRatingCount: 2100,
      gameType: 0,
      genres: [12, 31],
      platforms: ['PC (Microsoft Windows)', 'PlayStation 4'],
      cover: 'co1wyy',
      screenshots: ['a', 'b', 'c', 'd', 'e'],
      involvedCompanies: [
        { id: 1, company: 908, developer: true, publisher: false, porting: false, supporting: false },
        { id: 2, company: 909, developer: false, publisher: true, porting: false, supporting: false },
      ],
      steamAppId: 292030,
    });
    expect(games[1]).toEqual({
      id: 7,
      name: 'Obscure Game',
      slug: 'obscure-game',
      url: 'https://www.igdb.com/games/obscure-game',
      firstReleaseDate: null,
      totalRatingCount: 5,
      gameType: null,
      genres: [],
      platforms: [],
      cover: null,
      screenshots: [],
      involvedCompanies: [
        { id: 9, company: 3, developer: false, publisher: false, porting: false, supporting: false },
      ],
      steamAppId: null,
    });
    expect(games[2]!.steamAppId).toBeNull();

    const genres = await readStage<RawIgdbGenre[]>(STAGE_FILES.igdbGenres);
    expect(genres).toEqual([
      { id: 5, name: 'Shooter' },
      { id: 12, name: 'Role-playing (RPG)' },
    ]);
  });

  it('maps companies and logs ids that were not returned', async () => {
    const logs: string[] = [];
    const { fetchImpl } = fakeFetch(
      combine(
        pagedGames([rawGame(1, 10, [100, 101])]),
        (call) =>
          call.url.endsWith('/companies')
            ? json([
                {
                  id: 100,
                  name: 'Studio',
                  slug: 'studio',
                  url: 'https://www.igdb.com/companies/studio',
                  country: 752,
                  start_date: 946684800,
                  parent: 55,
                  changed_company_id: 56,
                },
              ])
            : undefined,
        genresHandler,
      ),
    );

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: (m) => logs.push(m) });

    expect(result.companies).toBe(1);
    const companies = await readStage<RawIgdbCompany[]>(STAGE_FILES.igdbCompanies);
    expect(companies).toEqual([
      {
        id: 100,
        name: 'Studio',
        slug: 'studio',
        url: 'https://www.igdb.com/companies/studio',
        country: 752,
        startDate: 946684800,
        parent: 55,
        changedCompanyId: 56,
      },
    ]);
    expect(logs.some((m) => /1 of 2 ids were not returned/.test(m))).toBe(true);
  });

  it('pages with offsets, de-duplicates rows repeated across pages and stops on an empty page', async () => {
    const all = Array.from({ length: 700 }, (_, i) => rawGame(i + 1, 1000 - i));
    const pages: Record<number, unknown[]> = {
      0: all.slice(0, 500),
      500: [all[499], ...all.slice(500, 700)],
      1000: [],
    };
    const { fetchImpl, calls } = fakeFetch(
      combine(
        (call) => (call.url.endsWith('/games') ? json(pages[offsetOf(call.body)]) : undefined),
        companiesFor,
        genresHandler,
      ),
    );

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    const gameCalls = calls.filter((c) => c.url.endsWith('/games'));
    expect(gameCalls.map((c) => offsetOf(c.body))).toEqual([0, 500, 1000]);
    expect(result.games).toBe(700);
    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(new Set(games.map((g) => g.id)).size).toBe(700);
  });

  it('sorts by rating count descending then id ascending', async () => {
    const { fetchImpl } = fakeFetch(
      combine(pagedGames([rawGame(9, 5), rawGame(3, 5), rawGame(4, 50), rawGame(1, 1)]), companiesFor, genresHandler),
    );

    await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(games.map((g) => g.id)).toEqual([4, 3, 9, 1]);
  });

  it('stops at gameLimit and keeps the most rated games', async () => {
    const all = Array.from({ length: 1200 }, (_, i) => rawGame(i + 1, 5000 - i));
    const { fetchImpl, calls } = fakeFetch(combine(pagedGames(all), companiesFor, genresHandler));

    const result = await runIgdbStage(makeConfig({ gameLimit: 3 }), { fetchImpl, sleep: noSleep, log: () => {} });

    expect(calls.filter((c) => c.url.endsWith('/games'))).toHaveLength(1);
    expect(result.games).toBe(3);
    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(games.map((g) => g.id)).toEqual([1, 2, 3]);
    const companyCall = calls.find((c) => c.url.endsWith('/companies'))!;
    expect(companyCall.body).toContain('id = (1,2,3)');
  });

  it('falls back to legacy field names after a 400 and keeps using them', async () => {
    const all = Array.from({ length: 600 }, (_, i) => rawGame(i + 1, 1000 - i));
    const legacy = all.map(({ game_type, ...rest }) => ({
      ...rest,
      category: game_type,
      external_games: [{ id: 1, uid: '440', category: 1 }],
    }));
    const { fetchImpl, calls } = fakeFetch(
      combine(
        (call) =>
          call.url.endsWith('/games') && call.body.includes('game_type')
            ? json({ message: 'Invalid Field', cause: 'game_type is not a field' }, 400)
            : undefined,
        (call) => {
          if (!call.url.endsWith('/games')) return undefined;
          const offset = offsetOf(call.body);
          return json(legacy.slice(offset, offset + 500));
        },
        companiesFor,
        genresHandler,
      ),
    );

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    const gameCalls = calls.filter((c) => c.url.endsWith('/games'));
    expect(gameCalls).toHaveLength(4);
    expect(gameCalls[0]!.body).toContain('game_type');
    for (const c of gameCalls.slice(1)) {
      expect(c.body).not.toContain('game_type');
      expect(c.body).toContain('category = (0,8,9)');
    }
    expect(result.games).toBe(600);
    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(games[0]!.gameType).toBe(0);
    expect(games[0]!.steamAppId).toBe(440);
  });

  it('fails on a 400 that does not mention a field after fallback', async () => {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.endsWith('/games') ? new Response('nope', { status: 400 }) : undefined,
    );

    await expect(runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} })).rejects.toThrow(/400/);
  });

  it('fetches companies in batches of 500 ids', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    const games = [rawGame(1, 30, ids.slice(0, 400)), rawGame(2, 20, ids.slice(400, 800)), rawGame(3, 10, ids.slice(800))];
    const { fetchImpl, calls } = fakeFetch(combine(pagedGames(games), companiesFor, genresHandler));

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    const companyCalls = calls.filter((c) => c.url.endsWith('/companies'));
    const sizes = companyCalls.map((c) => /id = \(([\d,]+)\)/.exec(c.body)![1]!.split(',').length);
    expect(sizes).toEqual([500, 500, 200]);
    for (const c of companyCalls) expect(c.body).toContain('limit 500;');
    expect(result.companies).toBe(1200);
  });

  it('skips with counts and no network when all stage files exist', async () => {
    await mkdir(stageDir, { recursive: true });
    await writeFile(path.join(stageDir, STAGE_FILES.igdbGames), JSON.stringify([{ id: 1 }, { id: 2 }]));
    await writeFile(path.join(stageDir, STAGE_FILES.igdbCompanies), JSON.stringify([{ id: 5 }]));
    await writeFile(path.join(stageDir, STAGE_FILES.igdbGenres), JSON.stringify([]));
    const { fetchImpl, calls } = fakeFetch(() => undefined);

    const result = await runIgdbStage(makeConfig({ twitchClientId: null, twitchClientSecret: null }), {
      fetchImpl,
      sleep: noSleep,
      log: () => {},
    });

    expect(result).toEqual({ games: 2, companies: 1, skipped: true });
    expect(calls).toHaveLength(0);
  });

  it('does not skip when only some stage files exist', async () => {
    await writeFile(path.join(stageDir, STAGE_FILES.igdbGames), JSON.stringify([{ id: 1 }]));
    const { fetchImpl, calls } = fakeFetch(combine(pagedGames([rawGame(1, 10)]), companiesFor, genresHandler));

    const result = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} });

    expect(result.skipped).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('refresh overrides the skip', async () => {
    await writeFile(path.join(stageDir, STAGE_FILES.igdbGames), JSON.stringify([{ id: 1 }]));
    await writeFile(path.join(stageDir, STAGE_FILES.igdbCompanies), JSON.stringify([]));
    await writeFile(path.join(stageDir, STAGE_FILES.igdbGenres), JSON.stringify([]));
    const { fetchImpl, calls } = fakeFetch(
      combine(pagedGames([rawGame(1, 10), rawGame(2, 9)]), companiesFor, genresHandler),
    );

    const result = await runIgdbStage(makeConfig({ refresh: true }), { fetchImpl, sleep: noSleep, log: () => {} });

    expect(result).toEqual({ games: 2, companies: 2, skipped: false });
    expect(calls.length).toBeGreaterThan(0);
    const games = await readStage<RawIgdbGame[]>(STAGE_FILES.igdbGames);
    expect(games).toHaveLength(2);
  });

  it('never logs the secret or the token and reports progress', async () => {
    const logs: string[] = [];
    const all = Array.from({ length: 600 }, (_, i) => rawGame(i + 1, 1000 - i));
    const { fetchImpl } = fakeFetch(combine(pagedGames(all), companiesFor, genresHandler));

    await runIgdbStage(makeConfig({ gameLimit: 1000 }), { fetchImpl, sleep: noSleep, log: (m) => logs.push(m) });

    expect(logs.some((m) => m.includes('IGDB games: 500/1000'))).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain(TOKEN);
    }
  });

  it('does not put the secret or token in a token failure message', async () => {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.startsWith('https://id.twitch.tv/') ? json({ status: 403, message: 'invalid client secret' }, 403) : undefined,
    );

    const error = await runIgdbStage(makeConfig(), { fetchImpl, sleep: noSleep, log: () => {} }).catch(
      (e: Error) => e,
    );

    expect((error as Error).message).toContain('403');
    expect((error as Error).message).not.toContain(SECRET);
  });
});
