import { describe, expect, it } from 'vitest';
import { DETAIL_CHUNK_SIZE, ROLE_TYPES } from '../../shared/model';
import { MOBY_ONLY_COMPANY_OFFSET, mapMobyRole, merge } from './merge';
import { company, game, input, moby, row, wdCompany, wdGame } from './test-factories';

function rolesOf(result: ReturnType<typeof merge>, gameId: number) {
  const i = result.games.findIndex((g) => g.id === gameId);
  return result.details[i]!.roles;
}

describe('merge: company ids and sources (a, b)', () => {
  it('keeps IGDB ids, gives MobyGames-only companies 20000000 + id, and attaches sources', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha')],
      games: [game(1, [row(10, 1, { developer: true })])],
      moby: [moby(1, [{ id: 77, name: 'Zeta Audio Works', role: 'Sound by' }])],
    }));
    expect(r.companies.map((c) => c.id)).toEqual([1, MOBY_ONLY_COMPANY_OFFSET + 77]);
    expect(r.companies[0]!.sources).toEqual([{ source: 'igdb', id: '1', url: 'https://www.igdb.com/companies/1' }]);
    const zeta = r.companies[1]!;
    expect(zeta.precision).toBe('none');
    expect(zeta.sources).toEqual([{ source: 'mobygames', id: '77' }]);
    const d = r.details[0]!;
    expect(d.sources).toContainEqual({ source: 'igdb', id: '1', url: 'https://www.igdb.com/games/game-1' });
    expect(d.sources).toContainEqual({ source: 'mobygames', id: '5001', url: 'https://www.mobygames.com/game/5001' });
    const audio = d.roles.find((x) => x.role === 'audio')!;
    expect(audio.companyId).toBe(MOBY_ONLY_COMPANY_OFFSET + 77);
    expect(audio.source.source).toBe('mobygames');
  });

  it('adds Wikidata and curated refs to companies', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Loc Ltd')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { supporting: true })])],
      wikidataCompanies: [wdCompany(1, { qid: 'Q42' })],
      specialties: [{ igdbCompanyId: 2, name: 'Loc Ltd', specialty: 'localization', evidenceUrl: 'https://example.com/loc' }],
    }));
    expect(r.companies[0]!.sources).toContainEqual({ source: 'wikidata', id: 'Q42', url: 'https://www.wikidata.org/wiki/Q42' });
    expect(r.companies[1]!.sources).toContainEqual({ source: 'curated', id: 'loc', url: 'https://example.com/loc' });
  });
});

describe('merge: lead studio (c)', () => {
  it('single developer is the lead', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'B')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(1);
    expect(r.details[0]!.leadBasis).toBe('igdb_single_developer');
  });

  it('ignores porting and supporting developers when a pure developer exists', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'B'), company(3, 'C')],
      games: [game(1, [
        row(10, 1, { developer: true, porting: true }),
        row(11, 2, { developer: true }),
        row(12, 3, { developer: true, supporting: true }),
      ])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('igdb_single_developer');
    expect(rolesOf(r, 1).map((x) => [x.companyId, x.role])).toEqual([[2, 'lead_developer'], [1, 'port'], [3, 'support']]);
  });

  it('several developers: Wikidata confirms one', () => {
    const r = merge(input({
      companies: [company(1, 'First Studio'), company(2, 'Second Studio Co., Ltd.')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { developer: true })])],
      wikidataGames: [wdGame(1, ['Second Studio'])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('igdb_developer_confirmed_by_wikidata');
    expect(rolesOf(r, 1).find((x) => x.companyId === 1)!.role).toBe('co_developer');
  });

  it('several developers: a Wikidata item link beats a label match', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha Studio'), company(2, 'Beta Works')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { developer: true })])],
      wikidataCompanies: [wdCompany(2, { qid: 'Q222' })],
      wikidataGames: [wdGame(1, ['Alpha Studio'], { developers: [{ qid: 'Q999', label: 'Alpha Studio' }, { qid: 'Q222', label: 'Different label' }] })],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('igdb_developer_confirmed_by_wikidata');
  });

  it('no developer: a Wikidata item link finds the lead although the label differs', () => {
    const r = merge(input({
      companies: [company(1, 'Pub Inc'), company(2, 'Odd Name')],
      games: [game(1, [row(10, 1, { publisher: true }), row(11, 2, { supporting: true })])],
      wikidataCompanies: [wdCompany(2, { qid: 'Q222' })],
      wikidataGames: [wdGame(1, [], { developers: [{ qid: 'Q222', label: 'Completely other' }] })],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('wikidata_developer');
  });

  it('several developers: the first matching Wikidata developer wins when several match', () => {
    const r = merge(input({
      companies: [company(1, 'First Studio'), company(2, 'Second Studio')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { developer: true })])],
      wikidataGames: [wdGame(1, ['Unknown', 'Second Studio', 'First Studio'])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
  });

  it('several developers without a Wikidata match: lowest involved-company row id', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'B')],
      games: [game(1, [row(20, 1, { developer: true }), row(11, 2, { developer: true })])],
      wikidataGames: [wdGame(1, ['Nobody'])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('igdb_first_developer');
    expect(rolesOf(r, 1).find((x) => x.companyId === 1)!.role).toBe('co_developer');
  });

  it('uses all developers when every developer is porting or supporting', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'B')],
      games: [game(1, [row(10, 1, { developer: true, porting: true }), row(11, 2, { developer: true, porting: true })])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(1);
    expect(r.details[0]!.leadBasis).toBe('igdb_first_developer');
  });

  it('no developer: Wikidata developer matching an involved company', () => {
    const r = merge(input({
      companies: [company(1, 'Pub Inc'), company(2, 'Real Dev Ltd')],
      games: [game(1, [row(10, 1, { publisher: true }), row(11, 2, { supporting: true })])],
      wikidataGames: [wdGame(1, ['Real Dev'])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('wikidata_developer');
    const leadRole = rolesOf(r, 1).find((x) => x.role === 'lead_developer')!;
    expect(leadRole.source.source).toBe('wikidata');
  });

  it('no developer: MobyGames developer matching an involved company', () => {
    const r = merge(input({
      companies: [company(1, 'Pub Inc'), company(2, 'Real Dev Ltd')],
      games: [game(1, [row(10, 1, { publisher: true }), row(11, 2, { supporting: true })])],
      moby: [moby(1, [{ id: 3, name: 'Real Dev', role: 'Developed by' }])],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('mobygames_developer');
    expect(rolesOf(r, 1).filter((x) => x.role === 'lead_developer')).toHaveLength(1);
    expect(rolesOf(r, 1).some((x) => x.role === 'co_developer')).toBe(false);
  });

  it('drops a game with no determinable lead and reports it', () => {
    const r = merge(input({
      companies: [company(1, 'Pub Inc')],
      games: [game(1, [row(10, 1, { publisher: true })]), game(2, [row(11, 1, { developer: true })])],
    }));
    expect(r.games.map((g) => g.id)).toEqual([2]);
    expect(r.report.droppedGames).toHaveLength(1);
    expect(r.report.droppedGames[0]).toMatchObject({ id: 1, name: 'Game 1' });
    expect(r.report.droppedGames[0]!.reason).toMatch(/no developer/);
  });
});

describe('merge: roles from IGDB flags (d)', () => {
  it('maps flags to roles with platform null and the game year', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'B'), company(3, 'C'), company(4, 'D'), company(5, 'E')],
      games: [game(1, [
        row(10, 1, { developer: true }),
        row(11, 2, { developer: true }),
        row(12, 3, { porting: true }),
        row(13, 4, { publisher: true }),
        row(14, 5, { supporting: true }),
      ])],
    }));
    const roles = rolesOf(r, 1);
    expect(roles.map((x) => [x.companyId, x.role])).toEqual([
      [1, 'lead_developer'], [2, 'co_developer'], [3, 'port'], [4, 'publisher'], [5, 'support'],
    ]);
    for (const x of roles) {
      expect(x.platform).toBeNull();
      expect(x.year).toBe(2010);
      expect(x.source).toEqual({ source: 'igdb', id: '1', url: 'https://www.igdb.com/games/game-1' });
    }
  });

  it('gives a supporting company its specialty, matched by id then by name', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'Audio House'), company(3, 'Qa Corp.')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { supporting: true }), row(12, 3, { supporting: true })])],
      specialties: [
        { igdbCompanyId: 2, name: 'whatever', specialty: 'audio', evidenceUrl: 'https://e/1' },
        { name: 'Qa Corp', specialty: 'qa', evidenceUrl: 'https://e/3' },
      ],
    }));
    const roles = rolesOf(r, 1);
    expect(roles.find((x) => x.companyId === 2)).toMatchObject({ role: 'audio', source: { source: 'igdb' } });
    expect(roles.find((x) => x.companyId === 3)!.role).toBe('qa');
    expect(r.companies.find((c) => c.id === 3)!.sources.map((s) => s.source)).toEqual(['igdb', 'curated']);
  });

  it('lets a company hold several roles on one game', () => {
    const r = merge(input({
      companies: [company(1, 'A')],
      games: [game(1, [row(10, 1, { developer: true, publisher: true }), row(11, 1, { supporting: true })])],
    }));
    expect(rolesOf(r, 1).map((x) => x.role)).toEqual(['lead_developer', 'publisher', 'support']);
    expect(r.companies[0]!.gameCount).toBe(1);
  });
});

describe('merge: MobyGames roles (e)', () => {
  it('maps role names with case-insensitive patterns', () => {
    const cases: [string, string][] = [
      ['Developed by', 'co_developer'], ['PUBLISHED BY', 'publisher'], ['Distributed by', 'publisher'],
      ['Ported by', 'port'], ['Converted by', 'port'], ['Localization', 'localization'], ['Translation', 'localization'],
      ['Quality Assurance', 'qa'], ['Testing', 'qa'], ['Graphics', 'art'], ['Cinematics', 'art'], ['Animation', 'art'],
      ['Music by', 'audio'], ['Voice Recording', 'audio'], ['Sound', 'audio'], ['Supported by', 'support'], ['Special thanks', 'support'],
    ];
    for (const [name, role] of cases) expect(mapMobyRole(name), name).toBe(role);
  });

  it('matches by normalized name among involved companies, then globally when unique', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Beta Interactive Ltd.'), company(3, 'Gamma Studio'), company(4, 'Gamma Studio Inc')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 3, { publisher: true })])],
      moby: [moby(1, [
        { id: 1, name: 'beta interactive', role: 'Published by' },
        { id: 2, name: 'Gamma Studio', role: 'Sound by' },
        { id: 3, name: 'Delta', role: 'Graphics' },
      ])],
    }));
    const roles = rolesOf(r, 1);
    expect(roles.find((x) => x.role === 'publisher' && x.companyId === 2)).toBeTruthy();
    expect(roles.find((x) => x.role === 'audio')!.companyId).toBe(3);
    expect(roles.find((x) => x.role === 'art')!.companyId).toBe(MOBY_ONLY_COMPANY_OFFSET + 3);
    expect(r.companies.find((c) => c.id === 2)!.sources.map((s) => s.source)).toContain('mobygames');
  });

  it('creates a MobyGames-only company when the name is ambiguous globally', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Twin'), company(3, 'Twin Inc')],
      games: [game(1, [row(10, 1, { developer: true })])],
      moby: [moby(1, [{ id: 9, name: 'Twin', role: 'Published by' }])],
    }));
    expect(rolesOf(r, 1).find((x) => x.role === 'publisher')!.companyId).toBe(MOBY_ONLY_COMPANY_OFFSET + 9);
  });

  it('does not duplicate an existing IGDB row and never adds a second lead', () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Beta')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })])],
      moby: [moby(1, [
        { id: 1, name: 'Beta', role: 'Published by', platform: 'PC' },
        { id: 2, name: 'Alpha', role: 'Developed by' },
        { id: 3, name: 'Alpha', role: 'Published by' },
      ])],
    }));
    const roles = rolesOf(r, 1);
    expect(roles.filter((x) => x.role === 'publisher').map((x) => x.companyId)).toEqual([1, 2]);
    expect(roles.filter((x) => x.role === 'lead_developer')).toHaveLength(1);
    expect(roles.filter((x) => x.companyId === 1 && x.role === 'co_developer')).toHaveLength(0);
  });

  it("replaces an IGDB 'support' row with a specific MobyGames role", () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Helper')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { supporting: true })])],
      moby: [moby(1, [{ id: 5, name: 'Helper', role: 'Localization' }])],
    }));
    const helper = rolesOf(r, 1).filter((x) => x.companyId === 2);
    expect(helper).toHaveLength(1);
    expect(helper[0]).toMatchObject({ role: 'localization', source: { source: 'mobygames' } });
    expect(r.report.unmatchedSupportCompanies).toEqual([]);
  });

  it("keeps the 'support' row when MobyGames also says support", () => {
    const r = merge(input({
      companies: [company(1, 'Alpha'), company(2, 'Helper')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { supporting: true })])],
      moby: [moby(1, [{ id: 5, name: 'Helper', role: 'Special thanks' }])],
    }));
    expect(rolesOf(r, 1).filter((x) => x.companyId === 2).map((x) => x.role)).toEqual(['support']);
  });

  it('adds MobyGames attribution only when a MobyGames role landed in the output', () => {
    const base = { companies: [company(1, 'A')], games: [game(1, [row(10, 1, { developer: true })])] };
    expect(merge(input({ ...base, moby: null })).meta.attribution.map((a) => a.source)).toEqual(['igdb', 'wikidata']);
    expect(merge(input({ ...base, moby: [moby(1, [])] })).meta.attribution.map((a) => a.source)).toEqual(['igdb', 'wikidata']);
    const used = moby(1, [{ id: 3, name: 'Elsewhere', role: 'Graphics' }]);
    expect(merge(input({ ...base, moby: [used] })).meta.attribution.map((a) => a.source)).toEqual(['igdb', 'wikidata', 'mobygames']);
  });
});

describe('merge: company location (f)', () => {
  const g = [game(1, [row(10, 1, { developer: true })])];

  it('city precision from the Wikidata headquarters', () => {
    const r = merge(input({
      companies: [company(1, 'A', { country: 392 })],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq: { qid: 'Q1', label: 'Kyoto', lat: 35, lng: 135.7 }, country: 'JP' })],
    }));
    expect(r.companies[0]).toMatchObject({
      country: 'JP', city: 'Kyoto', lat: 35, lng: 135.7, precision: 'city',
      locationSource: { source: 'wikidata', id: 'Q1', url: 'https://www.wikidata.org/wiki/Q1' },
    });
  });

  it('country precision from IGDB, then from Wikidata, with the matching source', () => {
    const a = merge(input({ companies: [company(1, 'A', { country: 392 })], games: g })).companies[0]!;
    expect(a).toMatchObject({ country: 'JP', city: null, precision: 'country', locationSource: { source: 'igdb', id: '1' } });
    expect(a.lat).not.toBeNull();
    const b = merge(input({
      companies: [company(1, 'A')],
      games: g,
      wikidataCompanies: [wdCompany(1, { country: 'FR' })],
    })).companies[0]!;
    expect(b).toMatchObject({ country: 'FR', precision: 'country', locationSource: { source: 'wikidata', id: 'Q1' } });
  });

  it('precision none without any location', () => {
    const c = merge(input({ companies: [company(1, 'A')], games: g })).companies[0]!;
    expect(c).toMatchObject({ country: null, lat: null, lng: null, precision: 'none', locationSource: null });
  });

  it('treats an invalid Wikidata hq as absent', () => {
    const c = merge(input({
      companies: [company(1, 'A', { country: 392 })],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq: { qid: 'Q1', label: 'Null Island', lat: 0, lng: 0 }, country: 'JP' })],
    })).companies[0]!;
    expect(c.precision).toBe('country');
  });

  it('rejects a name-matched Wikidata record with a different country', () => {
    const r = merge(input({
      companies: [company(1, 'A', { country: 392 })],
      games: g,
      wikidataCompanies: [wdCompany(1, { matchedBy: 'name', country: 'US', hq: { qid: 'Q1', label: 'Austin', lat: 30, lng: -97 }, inception: 1999 })],
    }));
    const c = r.companies[0]!;
    expect(c).toMatchObject({ country: 'JP', precision: 'country', founded: null });
    expect(c.sources.map((s) => s.source)).toEqual(['igdb']);
    expect(r.report.rejectedWikidataMatches).toEqual([
      { companyId: 1, name: 'A', wikidataQid: 'Q1', wikidataCountry: 'US', igdbCountry: 'JP' },
    ]);
    expect(r.report.wikidataMatchCounts.name).toBe(0);
  });

  it('keeps an external-id or via-game Wikidata record with a different country and reports it', () => {
    for (const matchedBy of ['external_id', 'via_game'] as const) {
      const r = merge(input({
        companies: [company(1, 'A', { country: 392 })],
        games: g,
        wikidataCompanies: [wdCompany(1, { matchedBy, country: 'US', hq: { qid: 'Q1', label: 'Austin', lat: 30, lng: -97 } })],
      }));
      expect(r.companies[0]).toMatchObject({ country: 'US', city: 'Austin', precision: 'city' });
      expect(r.report.countryMismatches).toHaveLength(1);
      expect(r.report.rejectedWikidataMatches).toHaveLength(0);
      expect(r.report.wikidataMatchCounts[matchedBy]).toBe(1);
    }
  });
});

describe('merge: company fields (g)', () => {
  it('founded, parent, years and counts', () => {
    const r = merge(input({
      companies: [
        company(1, 'Parent', { startDate: Date.UTC(1985, 6, 1) / 1000 }),
        company(2, 'Child', { parent: 1, startDate: Date.UTC(1990, 0, 1) / 1000 }),
        company(3, 'Orphan', { parent: 99 }),
        company(4, 'Unused'),
        company(5, 'Pub', { parent: 4 }),
      ],
      games: [
        game(1, [row(10, 2, { developer: true }), row(11, 1, { publisher: true })], { firstReleaseDate: Date.UTC(2001, 0, 1) / 1000, totalRatingCount: 5 }),
        game(2, [row(12, 2, { developer: true }), row(13, 3, { developer: true, porting: true })], { firstReleaseDate: Date.UTC(2005, 0, 1) / 1000, totalRatingCount: 4 }),
        game(3, [row(14, 1, { developer: true }), row(15, 5, { publisher: true })], { firstReleaseDate: null, totalRatingCount: 3 }),
      ],
      wikidataCompanies: [wdCompany(2, { inception: 1988 })],
    }));
    expect(r.companies.map((c) => c.id)).toEqual([1, 2, 3, 5]);
    const byId = (id: number) => r.companies.find((c) => c.id === id)!;
    expect(byId(2)).toMatchObject({ founded: 1988, parentId: 1, firstYear: 2001, lastYear: 2005, gameCount: 2, leadCount: 2 });
    expect(byId(1)).toMatchObject({ founded: 1985, parentId: null, firstYear: 2001, lastYear: 2001, gameCount: 2, leadCount: 1 });
    expect(byId(3)).toMatchObject({ parentId: null, gameCount: 1, leadCount: 0 });
    expect(byId(5)).toMatchObject({ parentId: null, firstYear: null, lastYear: null, gameCount: 1 });
  });

  it('lists companies whose only roles are support, by game count', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'Helper'), company(3, 'Rare Helper')],
      games: [
        game(1, [row(10, 1, { developer: true }), row(11, 2, { supporting: true }), row(12, 3, { supporting: true })]),
        game(2, [row(13, 1, { developer: true }), row(14, 2, { supporting: true })], { totalRatingCount: 1 }),
      ],
    }));
    expect(r.report.unmatchedSupportCompanies).toEqual([
      { companyId: 2, name: 'Helper', gameCount: 2 },
      { companyId: 3, name: 'Rare Helper', gameCount: 1 },
    ]);
  });
});

describe('merge: games, meta, report (h, i, j)', () => {
  it('computes year, popularity, indie, sorts, then limits after dropping', () => {
    const r = merge(input({
      companies: [company(1, 'A'), company(2, 'Pub')],
      games: [
        game(1, [row(10, 1, { developer: true })], { totalRatingCount: 10, genres: [32, 5], firstReleaseDate: Date.UTC(1999, 11, 31, 23) / 1000 }),
        game(2, [row(11, 1, { developer: true })], { totalRatingCount: 50, firstReleaseDate: null }),
        game(3, [row(12, 2, { publisher: true })], { totalRatingCount: 999 }),
        game(4, [row(13, 1, { developer: true })], { totalRatingCount: 10 }),
        game(5, [row(14, 1, { developer: true })], { totalRatingCount: 1 }),
      ],
      genres: [{ id: 5, name: 'Five' }, { id: 32, name: 'Indie' }, { id: 6, name: 'Six' }],
      gameLimit: 3,
    }));
    expect(r.games.map((x) => x.id)).toEqual([2, 1, 4]);
    expect(r.games[1]).toMatchObject({ year: 1999, popularity: 10, indie: true, leadCompanyId: 1 });
    expect(r.games[0]).toMatchObject({ year: null, indie: false });
    expect(r.details.map((d) => d.id)).toEqual([2, 1, 4]);
    expect(r.meta.genres).toEqual([{ id: 5, name: 'Five' }, { id: 32, name: 'Indie' }]);
    expect(r.report.droppedGames.map((d) => d.id)).toEqual([3]);
  });

  it('fills meta and report', () => {
    const r = merge(input({
      companies: [company(1, 'A', { country: 392 }), company(2, 'B')],
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })])],
      now: new Date('2026-03-04T05:06:07Z'),
    }));
    expect(r.meta.generatedAt).toBe('2026-03-04T05:06:07.000Z');
    expect(r.meta.detailChunkSize).toBe(DETAIL_CHUNK_SIZE);
    expect(r.meta.detailChunks).toBe(1);
    expect(Object.keys(r.meta.counts.rolesByType)).toEqual([...ROLE_TYPES]);
    expect(r.meta.counts).toMatchObject({ games: 1, companies: 2, roles: 2 });
    expect(r.meta.counts.rolesByType).toMatchObject({ lead_developer: 1, publisher: 1, qa: 0 });
    expect(r.meta.attribution[0]).toEqual({
      source: 'igdb', name: 'IGDB', url: 'https://www.igdb.com', licence: 'IGDB API terms (Twitch Developer Service Agreement)',
    });
    expect(r.meta.attribution[1]).toMatchObject({ source: 'wikidata', licence: 'CC0 1.0' });
    expect(r.report.leadBasisCounts.igdb_single_developer).toBe(1);
    expect(r.report.leadBasisCounts.wikidata_developer).toBe(0);
    expect(r.report.companiesByPrecision).toEqual({ city: 0, country: 1, none: 1 });
  });
});
