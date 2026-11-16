import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../config';
import { mapMobyRole } from '../merge';
import { STAGE_FILES, type RawIgdbGame, type RawMobyGame } from '../raw';
import { writeJson } from '../stageio';
import { game } from '../test-factories';
import {
  MOBY_REPORT_FILE,
  normalizeTitle,
  pickByTitle,
  runMobygamesStage,
  toRoles,
  type MobyApiGame,
  type MobyStageReport,
} from './mobygames';

const KEY = 'test+key/secret';
let stageDir: string;
let logs: string[];

beforeEach(async () => {
  stageDir = await mkdtemp(path.join(os.tmpdir(), 'overworld-moby-'));
  logs = [];
});

afterEach(async () => {
  await rm(stageDir, { recursive: true, force: true });
});

function config(over: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    root: stageDir,
    stageDir,
    httpCacheDir: path.join(stageDir, 'http'),
    outDir: stageDir,
    reportDir: stageDir,
    curatedDir: stageDir,
    twitchClientId: null,
    twitchClientSecret: null,
    mobygamesApiKey: KEY,
    rawgApiKey: null,
    wikidataUserAgent: 'test',
    gameLimit: 100,
    mobyLimit: 10000,
    refresh: false,
    only: null,
    ...over,
  };
}

function mg(id: number, title: string, year: string, over: Partial<MobyApiGame> = {}): MobyApiGame {
  return {
    game_id: id,
    title,
    moby_url: `https://www.mobygames.com/game/${id}/`,
    platforms: [{ platform_id: 3, name: 'Windows', release_date: year }],
    developers: [{ id: id * 10, name: `Dev ${id}`, platforms: ['Windows'] }],
    publishers: [],
    ...over,
  };
}

function fakeApi(handler: (params: URLSearchParams) => MobyApiGame[] | number) {
  const calls: URLSearchParams[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.searchParams);
    const out = handler(url.searchParams);
    if (typeof out === 'number') return new Response(JSON.stringify({ code: out, error: 'x' }), { status: out });
    return new Response(JSON.stringify({ games: out }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function run(games: RawIgdbGame[], api: ReturnType<typeof fakeApi>, over: Partial<PipelineConfig> = {}) {
  await writeJson(path.join(stageDir, STAGE_FILES.igdbGames), games);
  const result = await runMobygamesStage(config(over), { fetchImpl: api.fetchImpl, sleep: async () => {}, log: (m) => logs.push(m) });
  const out = JSON.parse(await readFile(path.join(stageDir, STAGE_FILES.mobygames), 'utf8')) as RawMobyGame[];
  const report = JSON.parse(await readFile(path.join(stageDir, MOBY_REPORT_FILE), 'utf8')) as MobyStageReport;
  return { result, out, report };
}

describe('normalizeTitle', () => {
  it('ignores case, accents, apostrophes and punctuation', () => {
    expect(normalizeTitle('Marvel’s Spider-Man')).toBe(normalizeTitle("marvel's spider man"));
    expect(normalizeTitle('Pokémon: Red & Blue')).toBe('pokemon red and blue');
  });
});

describe('pickByTitle', () => {
  const doom = game(1, [], { name: 'DOOM', firstReleaseDate: Date.UTC(2016, 4, 13) / 1000 });
  it('picks the same title closest in year', () => {
    const hit = pickByTitle(doom, [mg(1, 'Doom', '1993'), mg(2, 'Doom', '2016-05-13'), mg(3, 'Doom II', '2016')]);
    expect(hit?.game_id).toBe(2);
  });
  it('rejects a same-title game more than a year away', () => {
    expect(pickByTitle(doom, [mg(1, 'Doom', '1993')])).toBeNull();
  });
  it('breaks a same-title tie by platform count, then earliest date', () => {
    const two = [
      { platform_id: 3, name: 'Windows', release_date: '2016-06-01' },
      { platform_id: 141, name: 'PlayStation 4', release_date: '2016-06-01' },
    ];
    expect(pickByTitle(doom, [mg(1, 'Doom', '2016'), mg(2, 'Doom', '2016', { platforms: two })])?.game_id).toBe(2);
    expect(pickByTitle(doom, [mg(1, 'Doom', '2016-07'), mg(2, 'Doom', '2016-05')])?.game_id).toBe(2);
  });
  it('prefers the candidate sharing companies with IGDB over platform count', () => {
    const ac = game(7, [], { name: "Assassin's Creed", firstReleaseDate: Date.UTC(2007, 10, 13) / 1000 });
    const many = ['J2ME', 'BREW', 'iPhone'].map((name, i) => ({ platform_id: i, name, release_date: '2007-11' }));
    const mobile = mg(1, "Assassin's Creed", '2007-11', { platforms: many, developers: [{ id: 1, name: 'Gameloft S.A.' }] });
    const main = mg(2, "Assassin's Creed", '2007-11-14', { developers: [{ id: 2, name: 'Ubisoft Montreal Inc.' }] });
    expect(pickByTitle(ac, [mobile, main], ['Ubisoft Montreal', 'Ubisoft Entertainment'])?.game_id).toBe(2);
  });
  it('allows two years for a single same-title candidate', () => {
    const red = game(2, [], { name: 'Pokémon Red Version', firstReleaseDate: Date.UTC(1996, 1, 27) / 1000 });
    expect(pickByTitle(red, [mg(5, 'Pokémon Red Version', '1998-09-28')], ['Dev 5'])?.game_id).toBe(5);
    expect(pickByTitle(red, [mg(5, 'Pokémon Red Version', '1998-09-28')], ['Someone Else'])).toBeNull();
  });
  it('matches a title with or without its subtitle when the year agrees', () => {
    const hs = game(3, [], { name: 'Hearthstone', firstReleaseDate: Date.UTC(2014, 2, 11) / 1000 });
    expect(pickByTitle(hs, [mg(7, 'Hearthstone: Heroes of Warcraft', '2014-03-11')], ['Dev 7 Inc.'])?.game_id).toBe(7);
    expect(pickByTitle(hs, [mg(7, 'Hearthstone: Heroes of Warcraft', '2014-03-11')], ['Nobody'])).toBeNull();
    const d2 = game(4, [], { name: 'Doom II: Hell on Earth', firstReleaseDate: Date.UTC(1994, 9, 10) / 1000 });
    expect(pickByTitle(d2, [mg(8, 'Doom II', '1994')], ['Dev 8'])?.game_id).toBe(8);
    const destiny = game(6, [], { name: 'Destiny', firstReleaseDate: Date.UTC(2014, 8, 9) / 1000 });
    expect(pickByTitle(destiny, [mg(10, 'Destiny: The Taken King - Legendary Edition', '2015')], ['Dev 10'])).toBeNull();
    const ac = game(5, [], { name: "Assassin's Creed: Valhalla", firstReleaseDate: Date.UTC(2020, 10, 10) / 1000 });
    expect(pickByTitle(ac, [mg(9, "Assassin's Creed", '2007')])).toBeNull();
  });
});

describe('toRoles', () => {
  it('keeps a company on every platform as one role without platform', () => {
    const roles = toRoles(
      mg(1, 'X', '2015-05-18', {
        platforms: [
          { platform_id: 3, name: 'Windows', release_date: '2015-05-18' },
          { platform_id: 141, name: 'PlayStation 4', release_date: '2015-05-19' },
        ],
        developers: [{ id: 5, name: 'Main', platforms: ['PlayStation 4', 'Windows'] }],
        publishers: [{ id: 6, name: 'Pub', platforms: ['Windows'] }],
      }),
    );
    expect(roles).toEqual([
      { mobyCompanyId: 5, companyName: 'Main', roleName: 'Developed by', platform: null, year: 2015 },
      { mobyCompanyId: 6, companyName: 'Pub', roleName: 'Published by', platform: 'Windows', year: 2015 },
    ]);
  });

  it('marks a developer only on later platforms as a port', () => {
    const roles = toRoles(
      mg(1, 'X', '2016', {
        platforms: [
          { platform_id: 3, name: 'Windows', release_date: '2016-05-13' },
          { platform_id: 203, name: 'Nintendo Switch', release_date: '2017-11-10' },
        ],
        developers: [
          { id: 5, name: 'id Software', platforms: ['Windows'] },
          { id: 7, name: 'Panic Button', platforms: ['Nintendo Switch'] },
        ],
      }),
    );
    const port = roles.find((r) => r.mobyCompanyId === 7)!;
    expect(port).toMatchObject({ roleName: 'Ported by', platform: 'Nintendo Switch', year: 2017 });
    expect(mapMobyRole(port.roleName)).toBe('port');
    expect(mapMobyRole(roles.find((r) => r.mobyCompanyId === 5)!.roleName)).toBe('co_developer');
  });

  it('copes with null lists', () => {
    expect(toRoles({ game_id: 1, title: 'X', moby_url: 'u', platforms: null, developers: null, publishers: null })).toEqual([]);
  });
});

describe('runMobygamesStage', () => {
  it('skips without a key', async () => {
    const api = fakeApi(() => []);
    const r = await runMobygamesStage(config({ mobygamesApiKey: null }), { fetchImpl: api.fetchImpl, log: () => {} });
    expect(r.skipped).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it('matches by Steam batch, then single Steam id, then title, and writes the stage file', async () => {
    const games = [
      game(1, [], { name: 'The Witcher 3: Wild Hunt', totalRatingCount: 900, steamAppIds: [292030], firstReleaseDate: Date.UTC(2015, 4, 19) / 1000 }),
      game(2, [], { name: 'Renamed On Moby', totalRatingCount: 800, steamAppIds: [111], firstReleaseDate: Date.UTC(2012, 0, 1) / 1000 }),
      game(3, [], { name: 'Console Only', totalRatingCount: 700, firstReleaseDate: Date.UTC(2018, 0, 1) / 1000 }),
      game(4, [], { name: 'Nowhere', totalRatingCount: 600 }),
    ];
    const api = fakeApi((p) => {
      const steam = p.getAll('steam_app_id');
      if (steam.length > 1) return [mg(73001, 'The Witcher 3: Wild Hunt', '2015-05-18'), mg(9, 'Moby Name', '2012'), mg(10, 'Other', '2012')];
      if (steam[0] === '111') return [mg(9, 'Moby Name', '2012')];
      if (p.get('title') === 'Console Only') return [mg(20, 'Console Only', '2018-01-30'), mg(21, 'Console Only 2', '2019')];
      return [];
    });
    const { result, out, report } = await run(games, api);

    expect(result).toMatchObject({ games: 4, matched: 3, skipped: false });
    expect(out.map((g) => [g.igdbGameId, g.mobyGameId])).toEqual([[1, 73001], [2, 9], [3, 20]]);
    expect(report.byBasis).toEqual({ steam_batch: 1, steam_single: 1, title: 1, title_fuzzy: 0 });
    expect(report.unmatched).toEqual([{ igdbGameId: 4, name: 'Nowhere', year: 2010 }]);
    for (const p of api.calls) {
      expect(p.get('api_key')).toBe(KEY);
      expect(p.get('include')).toContain('developers');
    }
    expect(api.calls.some((p) => p.get('fuzzy') === 'true' && p.get('title') === 'Nowhere')).toBe(true);
  });

  it('sends at most 5 Steam ids per request and pairs a lone leftover result', async () => {
    const games = [
      game(1, [], { name: 'Many Ids', totalRatingCount: 9, steamAppIds: [1, 2, 3, 4, 5, 6, 7] }),
      game(2, [], { name: 'Two Ids', totalRatingCount: 8, steamAppIds: [8, 9, 11, 12, 13] }),
      game(3, [], { name: 'Not On Moby Steam', totalRatingCount: 7, steamAppIds: [10] }),
    ];
    const api = fakeApi((p) => {
      const steam = p.getAll('steam_app_id');
      if (steam.includes('1')) return [mg(50, 'Many Ids', '2010')];
      if (steam.includes('8')) return [mg(60, 'Renamed', '2010')];
      return [];
    });
    const { out, report } = await run(games, api);
    expect(api.calls.every((p) => p.getAll('steam_app_id').length <= 5)).toBe(true);
    expect(out.map((g) => [g.igdbGameId, g.mobyGameId])).toEqual([[1, 50], [2, 60]]);
    expect(report.byBasis.steam_batch).toBe(2);
    expect(api.calls.filter((p) => p.getAll('steam_app_id').length === 1 && p.get('steam_app_id') === '10')).toHaveLength(1);
  });

  it('fails loudly on 422 instead of caching an empty answer', async () => {
    const err = await run([game(1, [], { name: 'A' })], fakeApi(() => 422)).catch((e: Error) => e);
    expect((err as Error).message).toContain('422');
  });

  it('serves repeat runs from the cache without network', async () => {
    const games = [game(1, [], { name: 'Solo', steamAppIds: [5] })];
    const api = fakeApi(() => [mg(1, 'Solo', '2010')]);
    await run(games, api);
    const first = api.calls.length;
    const again = await run(games, api);
    expect(api.calls.length).toBe(first);
    expect(again.report).toMatchObject({ requests: 0, matched: 1 });
  });

  it('respects the game limit by popularity', async () => {
    const games = [game(1, [], { name: 'Low', totalRatingCount: 1 }), game(2, [], { name: 'High', totalRatingCount: 50 })];
    const api = fakeApi(() => []);
    const { report } = await run(games, api, { gameLimit: 1 });
    expect(report.games).toBe(1);
    expect(api.calls.every((p) => p.get('title') === 'High')).toBe(true);
  });

  it('treats 404 as no result but fails on a rejected key without leaking it', async () => {
    const games = [game(1, [], { name: 'A' })];
    const ok = await run(games, fakeApi(() => 404));
    expect(ok.out).toEqual([]);
    await rm(path.join(stageDir, 'http'), { recursive: true, force: true });
    const err = await run(games, fakeApi(() => 401)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain('secret');
  });
});
