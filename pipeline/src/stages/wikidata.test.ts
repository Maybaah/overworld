import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawIgdbCompany, type RawIgdbGame, type RawWikidataCompany, type RawWikidataGame } from '../raw';
import { writeJson } from '../stageio';
import {
  buildGamesQuery,
  buildNameLookupQuery,
  buildPlaceStatementsQuery,
  escapeSparqlString,
  nameVariants,
  parseWktPoint,
  runBatched,
  runWikidataStage,
} from './wikidata';

type Binding = Record<string, { type: string; value: string } | undefined>;

const uri = (q: string) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
const lit = (v: string) => ({ type: 'literal', value: v });
const RANK = (r: 'Preferred' | 'Normal') => lit(`http://wikiba.se/ontology#${r}Rank`);
const TRUE = { type: 'literal', value: 'true' };
const FALSE = { type: 'literal', value: 'false' };

function igdbCompany(id: number, name: string, slug = `c-${id}`, country: number | null = null): RawIgdbCompany {
  return { id, name, slug, url: '', country, startDate: null, parent: null, changedCompanyId: null };
}

function igdbGame(id: number, companyIds: number[], slug = `game-${id}`): RawIgdbGame {
  return {
    id,
    name: slug,
    slug,
    url: '',
    firstReleaseDate: null,
    totalRatingCount: 1,
    gameType: 0,
    genres: [],
    platforms: [],
    cover: null,
    screenshots: [],
    involvedCompanies: companyIds.map((company, i) => ({
      id: id * 100 + i,
      company,
      developer: true,
      publisher: false,
      porting: false,
      supporting: false,
    })),
    steamAppId: null,
  };
}

function gameRows(slug: string, game: string, devs: [string, string][] = [], pubs: [string, string][] = [], cc?: string): Binding[] {
  const rows: Binding[] = [];
  for (const [q, label] of devs) rows.push({ igdb: lit(slug), game: uri(game), kind: lit('dev'), ent: uri(q), entLabel: lit(label) });
  for (const [q, label] of pubs) rows.push({ igdb: lit(slug), game: uri(game), kind: lit('pub'), ent: uri(q), entLabel: lit(label) });
  if (cc) rows.push({ igdb: lit(slug), game: uri(game), kind: lit('cc'), ent: lit(cc) });
  if (rows.length === 0) rows.push({ igdb: lit(slug), game: uri(game) });
  return rows;
}

interface Routes {
  games?: (query: string) => Binding[] | number;
  external?: (query: string) => Binding[] | number;
  itemNames?: (query: string) => Binding[] | number;
  names?: (query: string) => Binding[] | number;
  statements?: (query: string) => Binding[] | number;
  details?: (query: string) => Binding[] | number;
  places?: (query: string) => Binding[] | number;
}

function classify(query: string): keyof Routes {
  if (query.startsWith('SELECT ?igdb')) return 'games';
  if (query.startsWith('SELECT ?v ?co')) return 'external';
  if (query.startsWith('SELECT ?e ?l')) return 'itemNames';
  if (query.startsWith('SELECT DISTINCT ?name')) return 'names';
  if (query.startsWith('SELECT ?co ?prop')) return 'statements';
  if (query.startsWith('SELECT ?co ?coLabel')) return 'details';
  if (query.startsWith('SELECT DISTINCT ?pl')) return 'places';
  throw new Error(`unexpected query: ${query.slice(0, 80)}`);
}

function fakeWikidata(routes: Routes) {
  const calls: { kind: keyof Routes; query: string; init: RequestInit }[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const query = new URLSearchParams(String(init?.body)).get('query') ?? '';
    const kind = classify(query);
    calls.push({ kind, query, init: init! });
    const out = routes[kind]?.(query) ?? [];
    if (typeof out === 'number') return new Response('Query timeout limit reached', { status: out });
    return new Response(JSON.stringify({ head: { vars: [] }, results: { bindings: out } }), {
      status: 200,
      headers: { 'content-type': 'application/sparql-results+json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

let stageDir: string;
let logs: string[];

const sleep = async () => {};
const log = (m: string) => logs.push(m);

function config(over: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    root: stageDir,
    stageDir,
    httpCacheDir: stageDir,
    outDir: stageDir,
    reportDir: stageDir,
    curatedDir: stageDir,
    twitchClientId: null,
    twitchClientSecret: null,
    mobygamesApiKey: null,
    wikidataUserAgent: 'test-agent/1.0 (test)',
    gameLimit: 10,
    refresh: false,
    only: null,
    ...over,
  };
}

async function seed(games: RawIgdbGame[], companies: RawIgdbCompany[]) {
  await writeJson(path.join(stageDir, STAGE_FILES.igdbGames), games);
  await writeJson(path.join(stageDir, STAGE_FILES.igdbCompanies), companies);
}

async function readOut(): Promise<{ games: RawWikidataGame[]; companies: RawWikidataCompany[] }> {
  return {
    games: JSON.parse(await readFile(path.join(stageDir, STAGE_FILES.wikidataGames), 'utf8')),
    companies: JSON.parse(await readFile(path.join(stageDir, STAGE_FILES.wikidataCompanies), 'utf8')),
  };
}

function place(q: string, label: string, wkt: string | null, extra: Binding = {}): Binding {
  const b: Binding = { pl: uri(q), plLabel: lit(label), cc: lit('JP'), isRegion: FALSE, isCity: TRUE, ...extra };
  if (wkt) b.coord = lit(wkt);
  return b;
}

beforeEach(async () => {
  stageDir = await mkdtemp(path.join(os.tmpdir(), 'wikidata-stage-test-'));
  logs = [];
});

afterEach(async () => {
  await rm(stageDir, { recursive: true, force: true });
});

describe('query building', () => {
  it('escapes quotes, backslashes and control characters', () => {
    expect(escapeSparqlString('a"b\\c\nd\te')).toBe('a\\"b\\\\c\\nd\\te');
    expect(escapeSparqlString('\u0001')).toBe('\\u0001');
  });

  it('keeps unicode intact and quotes names with injected syntax inside the literal', () => {
    const q = buildNameLookupQuery(['Ubisoft "Montréal" \\ 日本', 'x" } UNION { ?s ?p ?o #']);
    expect(q).toContain('"Ubisoft \\"Montréal\\" \\\\ 日本"@en');
    expect(q).toContain('"x\\" } UNION { ?s ?p ?o #"@en');
    expect(q).not.toMatch(/[^\\]"x" \}/);
  });

  it('escapes slugs in the games query', () => {
    const q = buildGamesQuery(['plain-slug', 'we"ird']);
    expect(q).toContain('"plain-slug" "we\\"ird"');
    expect(q).toContain('wdt:P5794');
  });

  it('excludes ended and deprecated statements', () => {
    const q = buildPlaceStatementsQuery(['Q1']);
    expect(q).toContain('FILTER NOT EXISTS { ?st pq:P582 ?end }');
    expect(q).toContain('wikibase:DeprecatedRank');
  });
});

describe('parseWktPoint', () => {
  it('reads longitude first', () => {
    expect(parseWktPoint('Point(139.6917 35.6895)')).toEqual({ lat: 35.6895, lng: 139.6917 });
    expect(parseWktPoint('Point(-122.12389 47.669444)')).toEqual({ lat: 47.669444, lng: -122.12389 });
  });

  it('handles whitespace, signs and exponents', () => {
    expect(parseWktPoint('  point( -0.5   +51.5 ) ')).toEqual({ lat: 51.5, lng: -0.5 });
    expect(parseWktPoint('Point(1e1 2.5E0)')).toEqual({ lat: 2.5, lng: 10 });
  });

  it('rejects garbage, out of range values and other celestial bodies', () => {
    expect(parseWktPoint('')).toBeNull();
    expect(parseWktPoint('Point(abc def)')).toBeNull();
    expect(parseWktPoint('Point(10 95)')).toBeNull();
    expect(parseWktPoint('<http://www.wikidata.org/entity/Q111> Point(10 20)')).toBeNull();
    expect(parseWktPoint('<http://www.wikidata.org/entity/Q2> Point(10 20)')).toEqual({ lat: 20, lng: 10 });
  });
});

describe('runBatched', () => {
  it('splits a failing batch in half down to the floor and reports the rest', async () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const failed: number[][] = [];
    const sizes: number[] = [];
    const out = await runBatched(
      items,
      100,
      25,
      async (batch) => {
        sizes.push(batch.length);
        if (batch.includes(10) || batch.length > 60) throw new Error('boom');
        return batch;
      },
      (batch) => failed.push(batch),
    );
    expect(sizes.slice(0, 3)).toEqual([100, 50, 25]);
    expect(failed).toEqual([items.slice(0, 25)]);
    expect(out).toEqual(items.slice(25));
  });
});

describe('runWikidataStage', () => {
  it('throws a clear error when the IGDB stage files are missing', async () => {
    await expect(runWikidataStage(config(), { sleep, log, fetchImpl: fakeWikidata({}).fetchImpl })).rejects.toThrow(/igdb/i);
  });

  it('skips without network when both stage files exist', async () => {
    await writeJson(path.join(stageDir, STAGE_FILES.wikidataGames), [{ igdbGameId: 1 }]);
    await writeJson(path.join(stageDir, STAGE_FILES.wikidataCompanies), [
      { igdbCompanyId: 1, matchedBy: 'name', hq: { qid: 'Q1', label: 'x', lat: 1, lng: 2 } },
      { igdbCompanyId: 2, matchedBy: 'via_game', hq: null },
    ]);
    const fake = fakeWikidata({});
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect(res).toMatchObject({ skipped: true, games: 1, companies: 2, withHq: 1 });
    expect(res.byBasis).toEqual({ external_id: 0, via_game: 1, name: 1 });
    expect(fake.calls).toHaveLength(0);
  });

  it('refreshes when refresh is set', async () => {
    await seed([igdbGame(1, [1])], [igdbCompany(1, 'Foo')]);
    await writeJson(path.join(stageDir, STAGE_FILES.wikidataGames), []);
    await writeJson(path.join(stageDir, STAGE_FILES.wikidataCompanies), []);
    const fake = fakeWikidata({});
    const res = await runWikidataStage(config({ refresh: true }), { fetchImpl: fake.fetchImpl, sleep, log });
    expect(res.skipped).toBe(false);
    expect(fake.calls.length).toBeGreaterThan(0);
  });

  it('posts form-encoded queries with the configured headers', async () => {
    await seed([igdbGame(1, [1])], [igdbCompany(1, 'Foo')]);
    const fake = fakeWikidata({});
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const init = fake.calls[0]!.init;
    const headers = new Headers(init.headers);
    expect(init.method).toBe('POST');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('accept')).toBe('application/sparql-results+json');
    expect(headers.get('user-agent')).toBe('test-agent/1.0 (test)');
  });

  it('matches games, keeps the item with more statements and records origin', async () => {
    await seed([igdbGame(7, [1], 'zed'), igdbGame(3, [1], 'abc'), igdbGame(5, [1], 'nope')], [igdbCompany(1, 'Foo')]);
    const fake = fakeWikidata({
      games: () => [
        ...gameRows('zed', 'Q50', [['Q10', 'Dev A'], ['Q11', 'Dev B']], [['Q12', 'Pub']], 'JP'),
        ...gameRows('zed', 'Q40', [['Q10', 'Dev A']]),
        ...gameRows('abc', 'Q60', [], [], 'FR'),
      ],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { games } = await readOut();
    expect(res.games).toBe(2);
    expect(games.map((g) => g.igdbGameId)).toEqual([3, 7]);
    expect(games[1]).toEqual({
      igdbGameId: 7,
      igdbSlug: 'zed',
      qid: 'Q50',
      developers: [{ qid: 'Q10', label: 'Dev A' }, { qid: 'Q11', label: 'Dev B' }],
      publishers: [{ qid: 'Q12', label: 'Pub' }],
      countryOfOrigin: 'JP',
    });
    expect(games[0]).toMatchObject({ qid: 'Q60', developers: [], countryOfOrigin: 'FR' });
    expect(logs.some((l) => l.includes('zed') && l.includes('Q40') && l.includes('keeping Q50'))).toBe(true);
  });

  it('links by external id, preferring slug over legacy numeric ids, and fills hq', async () => {
    await seed([], [igdbCompany(2015, 'Numeric Co', 'numeric-co'), igdbCompany(9, 'Slugged', 'slugged'), igdbCompany(4, 'Twice', 'twice')]);
    const fake = fakeWikidata({
      external: () => [
        { v: lit('2015'), co: uri('Q300') },
        { v: lit('slugged'), co: uri('Q100') },
        { v: lit('9'), co: uri('Q999') },
        { v: lit('twice'), co: uri('Q80') },
        { v: lit('twice'), co: uri('Q70') },
      ],
      statements: () => [{ co: uri('Q100'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q34600') }],
      details: () => [
        { co: uri('Q100'), coLabel: lit('Slugged Ltd') },
        { co: uri('Q100'), kind: lit('inc'), date: lit('1989-04-01T00:00:00Z'), rank: RANK('Normal') },
        { co: uri('Q300'), coLabel: lit('Q300') },
      ],
      places: () => [place('Q34600', 'Kyoto', 'Point(135.768111 35.011611)')],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(res.byBasis).toEqual({ external_id: 3, via_game: 0, name: 0 });
    expect(companies.map((c) => [c.igdbCompanyId, c.qid, c.matchedBy])).toEqual([
      [4, 'Q70', 'external_id'],
      [9, 'Q100', 'external_id'],
      [2015, 'Q300', 'external_id'],
    ]);
    expect(companies[1]).toMatchObject({
      label: 'Slugged Ltd',
      hq: { qid: 'Q34600', label: 'Kyoto', lat: 35.011611, lng: 135.768111 },
      hqBasis: 'headquarters',
      country: 'JP',
      inception: 1989,
    });
    expect(companies[2]).toMatchObject({ label: 'Numeric Co', hq: null, country: null, inception: null });
    expect(logs.some((l) => l.includes('Q70, Q80') && l.includes('keeping Q70'))).toBe(true);
    expect(fake.calls.some((c) => c.kind === 'names')).toBe(false);
  });

  it('links via_game by label or alias and does not reconsider external_id companies', async () => {
    await seed(
      [igdbGame(1, [1, 2, 3], 'g1')],
      [igdbCompany(1, 'Foo Studio Ltd', 'foo'), igdbCompany(2, 'Bar Interactive', 'bar'), igdbCompany(3, 'Linked Already', 'linked')],
    );
    const fake = fakeWikidata({
      external: () => [{ v: lit('linked'), co: uri('Q5') }],
      games: () => gameRows('g1', 'Q500', [['Q10', 'Foo Studio'], ['Q11', 'Other'], ['Q5', 'Linked Already']], [['Q12', 'Barwerks']]),
      itemNames: () => [
        { e: uri('Q10'), l: lit('Foo Studio Co., Ltd.') },
        { e: uri('Q11'), l: lit('Other') },
        { e: uri('Q12'), l: lit('Barwerks') },
        { e: uri('Q12'), l: lit('BAR interactive') },
        { e: uri('Q5'), l: lit('Linked Already') },
      ],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(res.byBasis).toEqual({ external_id: 1, via_game: 2, name: 0 });
    expect(companies.map((c) => [c.igdbCompanyId, c.qid, c.matchedBy])).toEqual([
      [1, 'Q10', 'via_game'],
      [2, 'Q12', 'via_game'],
      [3, 'Q5', 'external_id'],
    ]);
    const nameQuery = fake.calls.find((c) => c.kind === 'itemNames')!.query;
    expect(nameQuery).toContain('wd:Q10');
    expect(fake.calls.some((c) => c.kind === 'names')).toBe(false);
  });

  it('resolves via_game conflicts by votes and logs them', async () => {
    await seed(
      [igdbGame(1, [1], 'g1'), igdbGame(2, [1], 'g2'), igdbGame(3, [1], 'g3')],
      [igdbCompany(1, 'Acme')],
    );
    const fake = fakeWikidata({
      games: () => [
        ...gameRows('g1', 'Q501', [['Q30', 'Acme']]),
        ...gameRows('g2', 'Q502', [['Q30', 'Acme']]),
        ...gameRows('g3', 'Q503', [['Q20', 'Acme']]),
      ],
      itemNames: () => [
        { e: uri('Q30'), l: lit('Acme') },
        { e: uri('Q20'), l: lit('Acme') },
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ qid: 'Q30', matchedBy: 'via_game' });
    expect(logs.some((l) => l.includes('Q30=2') && l.includes('Q20=1') && l.includes('keeping Q30'))).toBe(true);
  });

  it('breaks vote ties by lowest QID', async () => {
    await seed([igdbGame(1, [1], 'g1'), igdbGame(2, [1], 'g2')], [igdbCompany(1, 'Acme')]);
    const fake = fakeWikidata({
      games: () => [...gameRows('g1', 'Q501', [['Q30', 'Acme']]), ...gameRows('g2', 'Q502', [['Q9', 'Acme']])],
      itemNames: () => [
        { e: uri('Q30'), l: lit('Acme') },
        { e: uri('Q9'), l: lit('Acme') },
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect((await readOut()).companies[0]!.qid).toBe('Q9');
  });

  it('links by unique exact name and leaves ambiguous names unlinked', async () => {
    await seed(
      [],
      [igdbCompany(1, 'Solo Games'), igdbCompany(2, 'Twin "Studios"'), igdbCompany(3, 'Nobody'), igdbCompany(4, 'Alias Only')],
    );
    const fake = fakeWikidata({
      names: () => [
        { name: lit('Solo Games'), co: uri('Q1') },
        { name: lit('Solo Games'), co: uri('Q1') },
        { name: lit('Twin "Studios"'), co: uri('Q2') },
        { name: lit('Twin "Studios"'), co: uri('Q3') },
        { name: lit('Alias Only'), co: uri('Q4') },
      ],
      details: () => [{ co: uri('Q1'), coLabel: lit('Solo Games') }],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(res.byBasis).toEqual({ external_id: 0, via_game: 0, name: 2 });
    expect(companies.map((c) => [c.igdbCompanyId, c.qid])).toEqual([[1, 'Q1'], [4, 'Q4']]);
    expect(logs.some((l) => l.includes('ambiguous') && l.includes('Twin'))).toBe(true);
    expect(logs.some((l) => l.includes('ambiguous names 1'))).toBe(true);
    const nameQuery = fake.calls.find((c) => c.kind === 'names')!.query;
    expect(nameQuery).toContain('"Twin \\"Studios\\""@en');
    expect(nameQuery).toContain('wd:Q210167');
    expect(nameQuery).toContain('wd:Q1137109');
    expect(nameQuery).toContain('wd:Q7889');
  });

  it('sets hq to null for region-level places but keeps the country; cities that are also regions stay', async () => {
    await seed([], [igdbCompany(1, 'A', 'a'), igdbCompany(2, 'B', 'b'), igdbCompany(3, 'C', 'c')]);
    const fake = fakeWikidata({
      external: () => [
        { v: lit('a'), co: uri('Q1') },
        { v: lit('b'), co: uri('Q2') },
        { v: lit('c'), co: uri('Q3') },
      ],
      statements: () => [
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q1439') },
        { co: uri('Q2'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q1490') },
        { co: uri('Q3'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q500') },
      ],
      places: () => [
        place('Q1439', 'Texas', 'Point(-100 31)', { cc: lit('US'), isRegion: TRUE, isCity: FALSE }),
        place('Q1490', 'Tokyo', 'Point(139.69 35.68)', { isRegion: TRUE, isCity: TRUE }),
        place('Q500', 'Nowhere', null),
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies[0]).toMatchObject({ hq: null, country: 'US' });
    expect(companies[0]!.hqBasis).toBeUndefined();
    expect(companies[1]).toMatchObject({ hq: { label: 'Tokyo', lat: 35.68, lng: 139.69 }, country: 'JP', hqBasis: 'headquarters' });
    expect(companies[2]).toMatchObject({ hq: null, country: 'JP' });
  });

  it('uses a place that is itself a country for the country code only', async () => {
    await seed([], [igdbCompany(1, 'A', 'a')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }],
      statements: () => [{ co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q17') }],
      places: () => [
        { pl: uri('Q17'), plLabel: lit('Japan'), coord: lit('Point(136 35)'), own: lit('JP'), isRegion: TRUE, isCity: FALSE },
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect((await readOut()).companies[0]).toMatchObject({ hq: null, country: 'JP' });
  });

  it('falls back from headquarters to located_in to formation and records which', async () => {
    await seed([], [1, 2, 3, 4].map((i) => igdbCompany(i, `Co ${i}`, `co-${i}`)));
    const fake = fakeWikidata({
      external: () => [1, 2, 3, 4].map((i) => ({ v: lit(`co-${i}`), co: uri(`Q${i}`) })),
      statements: () => [
        { co: uri('Q1'), prop: lit('formation'), rank: RANK('Normal'), pl: uri('Q13') },
        { co: uri('Q1'), prop: lit('located_in'), rank: RANK('Normal'), pl: uri('Q12') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q11') },
        { co: uri('Q2'), prop: lit('formation'), rank: RANK('Normal'), pl: uri('Q13') },
        { co: uri('Q2'), prop: lit('located_in'), rank: RANK('Normal'), pl: uri('Q12') },
        { co: uri('Q3'), prop: lit('formation'), rank: RANK('Normal'), pl: uri('Q13') },
      ],
      places: () => [
        place('Q11', 'HQ city', 'Point(1 11)'),
        place('Q12', 'Located city', 'Point(2 12)'),
        place('Q13', 'Formation city', 'Point(3 13)'),
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies.map((c) => c.hqBasis)).toEqual(['headquarters', 'located_in', 'formation', undefined]);
    expect(companies[3]!.hq).toBeNull();
    expect(companies[0]!.hq).toMatchObject({ qid: 'Q11', lat: 11, lng: 1 });
  });

  it('chooses preferred rank first, then lowest QID, among several places', async () => {
    await seed([], [igdbCompany(1, 'A', 'a'), igdbCompany(2, 'B', 'b')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }, { v: lit('b'), co: uri('Q2') }],
      statements: () => [
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q5') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Preferred'), pl: uri('Q90') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q4') },
        { co: uri('Q2'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q100') },
        { co: uri('Q2'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q20') },
      ],
      places: () => ['Q5', 'Q90', 'Q4', 'Q100', 'Q20'].map((q) => place(q, q, 'Point(0 0)')),
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies[0]!.hq!.qid).toBe('Q90');
    expect(companies[1]!.hq!.qid).toBe('Q20');
  });

  it('prefers the most recent start time among equally ranked places', async () => {
    await seed([], [igdbCompany(1, 'A', 'a')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }],
      statements: () => [
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q10'), start: lit('1994-02-02T00:00:00Z') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q90'), start: lit('2016-04-01T00:00:00Z') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q5') },
      ],
      places: () => ['Q10', 'Q90', 'Q5'].map((q) => place(q, q, 'Point(0 0)')),
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect((await readOut()).companies[0]!.hq!.qid).toBe('Q90');
  });

  it('prefers places in the IGDB country, then city level, and counts equal candidates in different cities as ambiguous', async () => {
    await seed([], [igdbCompany(1, 'Sonic', 'sonic', 392), igdbCompany(2, 'Saber', 'saber', 840), igdbCompany(3, 'Nowhere', 'nowhere')]);
    const hq = (co: string, pl: string): Binding => ({ co: uri(co), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri(pl) });
    const fake = fakeWikidata({
      external: () => [{ v: lit('sonic'), co: uri('Q1') }, { v: lit('saber'), co: uri('Q2') }, { v: lit('nowhere'), co: uri('Q3') }],
      statements: () => [
        hq('Q1', 'Q883'),
        hq('Q1', 'Q1490'),
        hq('Q2', 'Q656'),
        hq('Q2', 'Q812'),
        hq('Q2', 'Q540513'),
        hq('Q2', 'Q165972'),
        hq('Q3', 'Q700'),
        hq('Q3', 'Q701'),
      ],
      places: () => [
        place('Q883', 'Novosibirsk', 'Point(82.9 55.0)', { cc: lit('RU') }),
        place('Q1490', 'Tokyo', 'Point(139.69 35.68)'),
        place('Q656', 'Saint Petersburg', 'Point(30.3 59.9)', { cc: lit('RU') }),
        place('Q812', 'Florida', 'Point(-82 28)', { cc: lit('US'), isRegion: TRUE, isCity: FALSE }),
        place('Q540513', 'Millburn', 'Point(-74.3 40.7)', { cc: lit('US') }),
        place('Q165972', 'Fort Lauderdale', 'Point(-80.1 26.1)', { cc: lit('US') }),
        place('Q700', 'Town B', 'Point(2 2)'),
        place('Q701', 'Town A', 'Point(1 1)'),
      ],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies.map((c) => c.hq!.label)).toEqual(['Tokyo', 'Fort Lauderdale', 'Town B']);
    expect(res.ambiguousHq).toBe(2);
    expect(logs.some((l) => l.includes('ambiguous hq') && l.includes('Saber') && l.includes('Q540513') && l.includes('Q165972'))).toBe(true);
    expect(logs.some((l) => l.includes('ambiguous hq') && l.includes('Sonic'))).toBe(false);
  });

  it('orders ties by start time, then headquarters before located_in before formation, then QID', async () => {
    await seed([], [igdbCompany(1, 'A', 'a'), igdbCompany(2, 'B', 'b')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }, { v: lit('b'), co: uri('Q2') }],
      statements: () => [
        { co: uri('Q1'), prop: lit('formation'), rank: RANK('Normal'), pl: uri('Q1') },
        { co: uri('Q1'), prop: lit('located_in'), rank: RANK('Normal'), pl: uri('Q50') },
        { co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q60') },
        { co: uri('Q2'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q70') },
        { co: uri('Q2'), prop: lit('formation'), rank: RANK('Preferred'), pl: uri('Q80') },
      ],
      places: () => ['Q1', 'Q50', 'Q60', 'Q70', 'Q80'].map((q) => place(q, q, 'Point(0 0)')),
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies.map((c) => [c.hq!.qid, c.hqBasis])).toEqual([['Q60', 'headquarters'], ['Q80', 'formation']]);
  });

  it('keeps coordinates and label of building or ward level places', async () => {
    await seed([], [igdbCompany(1, 'A', 'a')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }],
      statements: () => [{ co: uri('Q1'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q9') }],
      places: () => [place('Q9', 'Peck Building', 'Point(-73.5983 45.5261)', { cc: lit('CA'), isCity: FALSE, isRegion: FALSE })],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect((await readOut()).companies[0]).toMatchObject({ hq: { label: 'Peck Building', lat: 45.5261, lng: -73.5983 }, country: 'CA' });
  });

  it('links business-class items by name only when unique and the country matches IGDB', async () => {
    await seed(
      [],
      [
        igdbCompany(1, 'Keywords', 'k', 372),
        igdbCompany(2, 'No Country', 'n'),
        igdbCompany(3, 'Wrong Country', 'w', 840),
        igdbCompany(4, 'Two Items', 't', 372),
        igdbCompany(5, 'Game Wins', 'g', 840),
      ],
    );
    const fake = fakeWikidata({
      names: () => [
        { name: lit('Keywords'), co: uri('Q1'), tier: lit('business'), cc: lit('IE') },
        { name: lit('No Country'), co: uri('Q2'), tier: lit('business'), cc: lit('IE') },
        { name: lit('Wrong Country'), co: uri('Q3'), tier: lit('business'), cc: lit('IE') },
        { name: lit('Two Items'), co: uri('Q4'), tier: lit('business'), cc: lit('IE') },
        { name: lit('Two Items'), co: uri('Q5'), tier: lit('business'), cc: lit('IE') },
        { name: lit('Game Wins'), co: uri('Q6'), tier: lit('business'), cc: lit('US') },
        { name: lit('Game Wins'), co: uri('Q7'), tier: lit('game'), cc: lit('JP') },
      ],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies.map((c) => [c.igdbCompanyId, c.qid])).toEqual([[1, 'Q1'], [5, 'Q7']]);
    expect(res.byBasis.name).toBe(2);
    const q = fake.calls.find((c) => c.kind === 'names')!.query;
    for (const id of ['Q4830453', 'Q783794', 'Q6881511', 'Q891723']) expect(q).toContain(`wd:${id}`);
  });

  it('builds name variants with legal suffixes removed but keeps words like Games and Studios', () => {
    expect(nameVariants('Sega Enterprises, Ltd.')).toEqual(['Sega Enterprises, Ltd.', 'Sega Enterprises']);
    expect(nameVariants('Nihon Falcom Corporation')).toEqual(['Nihon Falcom Corporation', 'Nihon Falcom']);
    expect(nameVariants('MicroProse Software, Inc.')).toEqual(['MicroProse Software, Inc.', 'MicroProse Software']);
    expect(nameVariants('Foo Co., Ltd.')).toEqual(['Foo Co., Ltd.', 'Foo Co', 'Foo']);
    expect(nameVariants('Big Games')).toEqual(['Big Games']);
    expect(nameVariants('Some Studios Interactive Entertainment')).toEqual(['Some Studios Interactive Entertainment']);
  });

  it('queries and links by suffix-stripped variants, merging hits across variants', async () => {
    await seed([], [igdbCompany(1, 'Nihon Falcom Corporation', 'f'), igdbCompany(2, 'Twin Co., Ltd.', 't')]);
    const fake = fakeWikidata({
      names: () => [
        { name: lit('Nihon Falcom'), co: uri('Q1'), tier: lit('game') },
        { name: lit('Twin'), co: uri('Q2'), tier: lit('game') },
        { name: lit('Twin Co., Ltd.'), co: uri('Q3'), tier: lit('game') },
      ],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const q = fake.calls.find((c) => c.kind === 'names')!.query;
    expect(q).toContain('"Nihon Falcom"@en');
    expect(q).toContain('"Nihon Falcom Corporation"@en');
    const { companies } = await readOut();
    expect(companies.map((c) => [c.igdbCompanyId, c.qid])).toEqual([[1, 'Q1']]);
    expect(res.byBasis.name).toBe(1);
    expect(logs.some((l) => l.includes('ambiguous name') && l.includes('Twin'))).toBe(true);
  });

  it('writes ambiguous headquarters cases to a report file', async () => {
    await seed([], [igdbCompany(2, 'B', 'b'), igdbCompany(1, 'A', 'a')]);
    const hq = (co: string, pl: string): Binding => ({ co: uri(co), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri(pl) });
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }, { v: lit('b'), co: uri('Q2') }],
      statements: () => [hq('Q1', 'Q11'), hq('Q1', 'Q12'), hq('Q2', 'Q21')],
      places: () => [place('Q11', 'Town B', 'Point(2 2)'), place('Q12', 'Town A', 'Point(1 1)', { cc: lit('FR') }), place('Q21', 'Solo', 'Point(3 3)')],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const report = JSON.parse(await readFile(path.join(stageDir, 'wikidata-ambiguous-hq.json'), 'utf8'));
    expect(report).toEqual([
      {
        igdbCompanyId: 1,
        name: 'A',
        qid: 'Q1',
        chosen: { qid: 'Q11', label: 'Town B', country: 'JP' },
        candidates: [
          { qid: 'Q11', label: 'Town B', country: 'JP', basis: 'headquarters' },
          { qid: 'Q12', label: 'Town A', country: 'FR', basis: 'headquarters' },
        ],
      },
    ]);
  });

  it('picks the preferred or earliest inception year', async () => {
    await seed([], [igdbCompany(1, 'A', 'a'), igdbCompany(2, 'B', 'b')]);
    const fake = fakeWikidata({
      external: () => [{ v: lit('a'), co: uri('Q1') }, { v: lit('b'), co: uri('Q2') }],
      details: () => [
        { co: uri('Q1'), kind: lit('inc'), date: lit('1947-09-23T00:00:00Z'), rank: RANK('Normal') },
        { co: uri('Q1'), kind: lit('inc'), date: lit('1889-09-23T00:00:00Z'), rank: RANK('Normal') },
        { co: uri('Q2'), kind: lit('inc'), date: lit('1947-09-23T00:00:00Z'), rank: RANK('Preferred') },
        { co: uri('Q2'), kind: lit('inc'), date: lit('1889-09-23T00:00:00Z'), rank: RANK('Normal') },
      ],
    });
    await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    const { companies } = await readOut();
    expect(companies.map((c) => c.inception)).toEqual([1889, 1947]);
  });

  it('splits a failing batch in half and retries the halves', async () => {
    const games = Array.from({ length: 600 }, (_, i) => igdbGame(i + 1, [], `slug-${String(i).padStart(3, '0')}`));
    await seed(games, []);
    const sizes: number[] = [];
    const fake = fakeWikidata({
      games: (query) => {
        const n = (query.match(/"slug-\d+"/g) ?? []).length;
        sizes.push(n);
        if (n > 300) return 500;
        return (query.match(/"(slug-\d+)"/g) ?? []).flatMap((s) => gameRows(s.slice(1, -1), `Q${s.slice(6, -1)}1`));
      },
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect(res.games).toBe(600);
    expect(sizes.filter((n) => n === 500).length).toBe(3);
    expect(sizes.filter((n) => n === 250).length).toBe(2);
    expect(sizes.filter((n) => n === 100).length).toBe(1);
    expect(logs.some((l) => l.includes('failed batches 0'))).toBe(true);
  });

  it('logs batches that still fail and carries on', async () => {
    await seed([igdbGame(1, [1], 'g1')], [igdbCompany(1, 'Foo', 'foo')]);
    const fake = fakeWikidata({
      games: () => 500,
      external: () => [{ v: lit('foo'), co: uri('Q1') }],
    });
    const res = await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
    expect(res.games).toBe(0);
    expect(res.companies).toBe(1);
    expect(logs.some((l) => l.includes('games batch of 1 failed'))).toBe(true);
    expect(logs.some((l) => l.includes('failed batches 1'))).toBe(true);
  });

  it('produces identical output regardless of response row order', async () => {
    const run = async (reverse: boolean) => {
      stageDir = await mkdtemp(path.join(os.tmpdir(), 'wikidata-stage-test-'));
      await seed([igdbGame(1, [1, 2], 'g1')], [igdbCompany(1, 'Foo Studio', 'foo'), igdbCompany(2, 'Bar', 'bar')]);
      const order = <T,>(rows: T[]) => (reverse ? rows.slice().reverse() : rows);
      const fake = fakeWikidata({
        games: () => order([...gameRows('g1', 'Q9', [['Q10', 'Foo Studio'], ['Q11', 'Bar']], [['Q12', 'Pub']], 'JP'), ...gameRows('g1', 'Q8', [['Q10', 'Foo Studio']])]),
        external: () => order([{ v: lit('bar'), co: uri('Q22') }, { v: lit('bar'), co: uri('Q21') }]),
        itemNames: () => order([{ e: uri('Q10'), l: lit('Foo Studio') }]),
        statements: () => order([
          { co: uri('Q10'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q60') },
          { co: uri('Q10'), prop: lit('headquarters'), rank: RANK('Normal'), pl: uri('Q50') },
        ]),
        places: () => order([place('Q60', 'Sixty', 'Point(6 6)'), place('Q50', 'Fifty', 'Point(5 5)')]),
      });
      await runWikidataStage(config(), { fetchImpl: fake.fetchImpl, sleep, log });
      const out = JSON.stringify(await readOut());
      await rm(stageDir, { recursive: true, force: true });
      return out;
    };
    const a = await run(false);
    const b = await run(true);
    expect(a).toBe(b);
    expect(JSON.parse(a).companies.find((c: RawWikidataCompany) => c.igdbCompanyId === 1).hq.qid).toBe('Q50');
  });
});
