import { describe, expect, it } from 'vitest';
import { merge } from './merge';
import { company, game, input, row, wdCompany, wdGame } from './test-factories';

const JP = 392;
const US = 840;
const GB = 826;

function leadOf(r: ReturnType<typeof merge>, gameId = 1) {
  const i = r.games.findIndex((g) => g.id === gameId);
  return { lead: r.games[i]!.leadCompanyId, basis: r.details[i]!.leadBasis, roles: r.details[i]!.roles };
}

describe('lead overrides (round 4, item 2)', () => {
  const comps = [company(1, 'Pub'), company(2, 'Dev A'), company(3, 'Dev B'), company(4, 'Real Dev')];

  it('makes the override company the lead even when it is not involved, others become co_developer', () => {
    const r = merge(input({
      companies: comps,
      games: [game(1, [row(10, 2, { developer: true }), row(11, 3, { developer: true })])],
      leadOverrides: [{ igdbGameId: 1, game: 'Game 1', igdbCompanyId: 4, company: 'Real Dev', evidenceUrl: 'https://e/1' }],
    }));
    const { lead, basis, roles } = leadOf(r);
    expect(lead).toBe(4);
    expect(basis).toBe('curated');
    expect(roles.find((x) => x.role === 'lead_developer')!.source).toEqual({ source: 'curated', id: 'lead-1', url: 'https://e/1' });
    expect(roles.filter((x) => x.role === 'co_developer').map((x) => x.companyId)).toEqual([2, 3]);
    expect(r.report.unusedLeadOverrides).toEqual([]);
    expect(r.report.leadBasisCounts.curated).toBe(1);
  });

  it('beats a Wikidata match and a single developer', () => {
    const r = merge(input({
      companies: comps,
      games: [game(1, [row(10, 2, { developer: true })])],
      leadOverrides: [{ igdbGameId: 1, game: 'Game 1', igdbCompanyId: 3, company: 'Dev B', evidenceUrl: 'https://e/1' }],
    }));
    expect(leadOf(r).lead).toBe(3);
  });

  it('rescues a game that would be dropped', () => {
    const r = merge(input({
      companies: comps,
      games: [game(1, [row(10, 1, { publisher: true })])],
      leadOverrides: [{ igdbGameId: 1, game: 'Game 1', igdbCompanyId: 4, company: 'Real Dev', evidenceUrl: 'https://e/1' }],
    }));
    expect(r.report.droppedGames).toEqual([]);
    expect(leadOf(r).lead).toBe(4);
  });

  it('lists unresolvable and unused overrides', () => {
    const r = merge(input({
      companies: comps,
      games: [game(1, [row(10, 2, { developer: true })])],
      leadOverrides: [
        { igdbGameId: 1, game: 'Game 1', igdbCompanyId: 999, company: 'Ghost', evidenceUrl: 'https://e/1' },
        { igdbGameId: 77, game: 'Missing', igdbCompanyId: 4, company: 'Real Dev', evidenceUrl: 'https://e/2' },
      ],
    }));
    expect(leadOf(r).lead).toBe(2);
    expect(r.report.unusedLeadOverrides).toEqual([
      { igdbGameId: 1, game: 'Game 1', igdbCompanyId: 999, reason: 'company not found in igdb-companies' },
      { igdbGameId: 77, game: 'Missing', igdbCompanyId: 4, reason: 'game not found in igdb-games' },
    ]);
  });
});

describe('lead heuristic (round 4, item 1)', () => {
  const portGames = [100, 101, 102].map((id) => game(id, [row(id, 2, { porting: true })], { totalRatingCount: 1 }));

  function withPortHouse(extra: Parameters<typeof input>[0] = {}) {
    return input({
      companies: [company(1, 'Original', { country: JP }), company(2, 'Port House', { country: US }), company(3, 'Third', { country: JP })],
      games: [...portGames, game(1, [row(10, 2, { developer: true }), row(11, 1, { developer: true })], { totalRatingCount: 50 })],
      ...extra,
    });
  }

  it('drops port houses (port share of at least 40 percent over at least 3 port rows)', () => {
    const r = merge(withPortHouse({ games: [...portGames, game(1, [row(10, 2, { developer: true }), row(11, 1, { developer: true })])] }));
    expect(leadOf(r)).toMatchObject({ lead: 1, basis: 'igdb_developer_heuristic' });
    expect(leadOf(r).roles.find((x) => x.companyId === 2)!.role).toBe('co_developer');
  });

  it('does not treat a company as a port house below the thresholds', () => {
    const fewPorts = portGames.slice(0, 2);
    const r = merge(withPortHouse({ games: [...fewPorts, game(1, [row(10, 2, { developer: true }), row(11, 1, { developer: true })])] }));
    expect(leadOf(r)).toMatchObject({ lead: 2, basis: 'igdb_first_developer' });
    const mostlyDeveloper = [...portGames, ...[200, 201, 202, 203, 204].map((id) => game(id, [row(id, 2, { developer: true })], { totalRatingCount: 1 }))];
    const r2 = merge(withPortHouse({ games: [...mostlyDeveloper, game(1, [row(10, 2, { developer: true }), row(11, 1, { developer: true })])] }));
    expect(leadOf(r2)).toMatchObject({ lead: 2, basis: 'igdb_first_developer' });
  });

  it('keeps candidates in the game country of origin, using the IGDB country, else the Wikidata company country', () => {
    const r = merge(input({
      companies: [company(1, 'A', { country: US }), company(2, 'B', { country: JP }), company(3, 'C')],
      games: [
        game(1, [row(10, 1, { developer: true }), row(11, 2, { developer: true })]),
        game(2, [row(12, 1, { developer: true }), row(13, 3, { developer: true })]),
      ],
      wikidataGames: [wdGame(1, [], { countryOfOrigin: 'JP' }), wdGame(2, [], { countryOfOrigin: 'JP' })],
      wikidataCompanies: [wdCompany(3, { country: 'JP' })],
    }));
    expect(leadOf(r, 1)).toMatchObject({ lead: 2, basis: 'igdb_developer_heuristic' });
    expect(leadOf(r, 2)).toMatchObject({ lead: 3, basis: 'igdb_developer_heuristic' });
  });

  it('applies a filter only if it leaves a candidate, and ties go to the lowest row id', () => {
    const r = merge(input({
      companies: [company(1, 'A', { country: US }), company(2, 'B', { country: US }), company(3, 'C', { country: JP })],
      games: [
        game(1, [row(20, 1, { developer: true }), row(10, 2, { developer: true })]),
        game(2, [row(30, 1, { developer: true }), row(31, 2, { developer: true }), row(32, 3, { developer: true })]),
      ],
      wikidataGames: [wdGame(1, [], { countryOfOrigin: 'FR' }), wdGame(2, [], { countryOfOrigin: 'US' })],
    }));
    expect(leadOf(r, 1)).toMatchObject({ lead: 2, basis: 'igdb_first_developer' });
    expect(leadOf(r, 2)).toMatchObject({ lead: 1, basis: 'igdb_first_developer' });
  });

  it('Wikidata still comes before the heuristic', () => {
    const r = merge(withPortHouse({
      wikidataGames: [wdGame(1, ['Port House'])],
    }));
    expect(leadOf(r)).toMatchObject({ lead: 2, basis: 'igdb_developer_confirmed_by_wikidata' });
  });

  it('reports the most popular low-confidence leads with the other candidates, capped at 150', () => {
    const companies = [company(1, 'A'), company(2, 'B')];
    const games = Array.from({ length: 160 }, (_, i) =>
      game(i + 1, [row(i * 2 + 1, 1, { developer: true }), row(i * 2 + 2, 2, { developer: true })], { totalRatingCount: 1000 - i }),
    );
    const r = merge(input({ companies, games }));
    const list = r.report.lowConfidenceLeads;
    expect(list).toHaveLength(150);
    expect(list[0]).toEqual({ gameId: 1, name: 'Game 1', companyId: 1, company: 'A', others: [{ companyId: 2, name: 'B' }] });
    expect(list[149]!.gameId).toBe(150);
    expect(merge(withPortHouse()).report.lowConfidenceLeads).toEqual([]);
  });
});

describe('country conflicts (round 4, item 3)', () => {
  const g = [game(1, [row(10, 1, { developer: true })])];
  const hq = { qid: 'Q9', label: 'Horsham', lat: -36.72, lng: 142.2 };

  it('rejects a Wikidata place in another country, resolving the hq country from the coordinates', () => {
    const r = merge(input({
      companies: [company(1, 'The Creative Assembly', { country: GB })],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq, country: null, inception: 1987 })],
      resolveCountry: () => 'AU',
    }));
    expect(r.companies[0]).toMatchObject({ country: 'GB', city: null, precision: 'country', locationBasis: 'country', founded: 1987 });
    expect(r.report.countryMismatches).toEqual([
      { companyId: 1, name: 'The Creative Assembly', wikidataQid: 'Q1', wikidataCountry: 'AU', igdbCountry: 'GB', wikidataCity: 'Horsham' },
    ]);
  });

  it('uses the record country when it has one, and keeps the place when the countries agree', () => {
    const differ = merge(input({
      companies: [company(1, 'A', { country: GB })],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq, country: 'AU', matchedBy: 'external_id' })],
      resolveCountry: () => 'GB',
    }));
    expect(differ.companies[0]!.precision).toBe('country');
    const agree = merge(input({
      companies: [company(1, 'A', { country: GB })],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq: { ...hq, label: 'Horsham UK', lat: 51.06, lng: -0.33 }, country: null })],
      resolveCountry: () => 'GB',
    }));
    expect(agree.companies[0]).toMatchObject({ city: 'Horsham UK', precision: 'city', locationBasis: 'headquarters' });
    expect(agree.report.countryMismatches).toEqual([]);
  });

  it('does not reject anything when IGDB has no country', () => {
    const r = merge(input({
      companies: [company(1, 'A')],
      games: g,
      wikidataCompanies: [wdCompany(1, { hq, country: 'AU' })],
      resolveCountry: () => 'GB',
    }));
    expect(r.companies[0]).toMatchObject({ country: 'AU', precision: 'city' });
  });
});

describe('divisions inherit the parent city (round 4, item 4)', () => {
  const parentHq = { qid: 'Q9', label: 'Osaka', lat: 34.68, lng: 135.51 };
  function build(childName: string, over: { childCountry?: number | null; parentCountry?: number } = {}, parentName = 'Capcom') {
    return merge(input({
      companies: [
        company(1, parentName, { country: over.parentCountry ?? JP }),
        company(2, childName, { parent: 1, country: over.childCountry === undefined ? JP : over.childCountry }),
      ],
      games: [game(1, [row(10, 2, { developer: true }), row(11, 1, { publisher: true })])],
      wikidataCompanies: [wdCompany(1, { hq: parentHq, country: 'JP' })],
    }));
  }
  const child = (r: ReturnType<typeof merge>) => r.companies.find((c) => c.id === 2)!;

  it('inherits city, coordinates and source from the parent', () => {
    const r = build('Capcom Production Studio 1');
    expect(child(r)).toMatchObject({
      city: 'Osaka', lat: 34.68, lng: 135.51, precision: 'city', locationBasis: 'parent',
      locationSource: { source: 'wikidata', id: 'Q1' }, country: 'JP',
    });
    expect(r.report.cityFromParent).toEqual([
      { companyId: 2, name: 'Capcom Production Studio 1', parentId: 1, parentName: 'Capcom', city: 'Osaka' },
    ]);
  });

  it('accepts the other markers', () => {
    for (const name of [
      'Capcom Development Division', 'Capcom 1st Production Department', 'Capcom R&D 2', 'Capcom EPD', 'Capcom Production Group No. 3',
      'Capcom CS2', 'Capcom AM1', 'Capcom Software Development', 'Capcom Studio No. 4', 'Capcom Team', 'Capcom Dept',
    ]) {
      expect(child(build(name)).locationBasis, name).toBe('parent');
    }
  });

  it('needs a marker, a shared first word, the same country and a known country', () => {
    expect(child(build('Capcom Tiburon')).precision).toBe('country');
    expect(child(build('Square Production Studio 1')).precision).toBe('country');
    expect(child(build('Capcom Production Studio 1', { childCountry: US })).precision).toBe('country');
    expect(child(build('Capcom Production Studio 1', { childCountry: null })).precision).toBe('none');
  });

  it('does not chain more than one level', () => {
    const r = merge(input({
      companies: [
        company(1, 'Nintendo', { country: JP }),
        company(2, 'Nintendo EPD', { parent: 1, country: JP }),
        company(3, 'Nintendo EPD Production Group No. 3', { parent: 2, country: JP }),
      ],
      games: [game(1, [row(10, 2, { developer: true }), row(11, 3, { publisher: true }), row(12, 1, { publisher: true })])],
      wikidataCompanies: [wdCompany(1, { hq: parentHq, country: 'JP' })],
    }));
    expect(r.companies.find((c) => c.id === 2)!.locationBasis).toBe('parent');
    expect(r.companies.find((c) => c.id === 3)!.precision).toBe('country');
  });

  it('works when the parent is not in the output itself', () => {
    const r = merge(input({
      companies: [company(1, 'Capcom', { country: JP }), company(2, 'Capcom Production Studio 1', { parent: 1, country: JP })],
      games: [game(1, [row(10, 2, { developer: true })])],
      wikidataCompanies: [wdCompany(1, { hq: parentHq, country: 'JP' })],
    }));
    expect(r.companies).toHaveLength(1);
    expect(r.companies[0]).toMatchObject({ city: 'Osaka', parentId: null, locationBasis: 'parent' });
  });
});

describe('locationBasis (round 4, item 5)', () => {
  it('records how each location was found', () => {
    const hq = (label: string) => ({ qid: 'Q9', label, lat: 10, lng: 20 });
    const r = merge(input({
      companies: [
        company(1, 'Fixed'),
        company(2, 'Headquartered', { country: JP }),
        company(3, 'Located In', { country: JP }),
        company(4, 'Formed', { country: JP }),
        company(5, 'Country Only', { country: JP }),
        company(6, 'From Games'),
        company(7, 'Nowhere'),
      ],
      games: [
        ...[1, 2, 3, 4, 5, 6, 7].map((id) => game(id, [row(id, id, { developer: true })])),
      ],
      locationCorrections: [{ name: 'Fixed', city: 'Lyon', country: 'FR', lat: 45.7, lng: 4.8, evidenceUrl: 'https://e' }],
      wikidataCompanies: [
        wdCompany(2, { hq: hq('A'), country: 'JP' }),
        wdCompany(3, { hq: hq('B'), country: 'JP', hqBasis: 'located_in' }),
        wdCompany(4, { hq: hq('C'), country: 'JP', hqBasis: 'formation' }),
      ],
      wikidataGames: [wdGame(6, [], { countryOfOrigin: 'DE' })],
    }));
    const basis = Object.fromEntries(r.companies.map((c) => [c.name, c.locationBasis]));
    expect(basis).toEqual({
      Fixed: 'correction',
      Headquartered: 'headquarters',
      'Located In': 'located_in',
      Formed: 'formation',
      'Country Only': 'country',
      'From Games': 'games_origin',
      Nowhere: null,
    });
  });
});

describe('Steam ids (round 4, item 7)', () => {
  const comps = [company(1, 'A')];
  const g = (id: number, ids: number[], popularity: number) =>
    game(id, [row(id, 1, { developer: true })], { steamAppId: ids[0] ?? null, steamAppIds: ids, totalRatingCount: popularity });

  it('gives a contested id to the game that lists it first, then the shorter list, then the more popular game', () => {
    const r = merge(input({ companies: comps, games: [g(1, [10, 20], 100), g(2, [10], 50), g(3, [30], 5), g(4, [30], 9)] }));
    expect(r.steam).toEqual({ '10': 2, '20': 1, '30': 4 });
    expect(r.report.steamIdsContested).toBe(2);
    const steamOf = (id: number) => r.details[r.games.findIndex((x) => x.id === id)]!.steamAppId;
    expect(steamOf(1)).toBe(20);
    expect(steamOf(2)).toBe(10);
    expect(steamOf(3)).toBeNull();
    expect(steamOf(4)).toBe(30);
  });

  it('prefers the earlier list position over list size', () => {
    const r = merge(input({ companies: comps, games: [g(1, [5, 10], 100), g(2, [10], 50)] }));
    expect(r.steam['10']).toBe(2);
    const r2 = merge(input({ companies: comps, games: [g(1, [10, 5], 100), g(2, [5, 6, 7, 10], 50)] }));
    expect(r2.steam['10']).toBe(1);
  });

  it('lists every id of a game and handles old stage files without steamAppIds', () => {
    const old = game(3, [row(3, 1, { developer: true })], { steamAppId: 77 });
    delete (old as { steamAppIds?: number[] }).steamAppIds;
    const r = merge(input({ companies: comps, games: [g(1, [1, 2, 3], 10), old] }));
    expect(r.steam).toEqual({ '1': 1, '2': 1, '3': 1, '77': 3 });
    expect(r.details.find((d) => d.id === 3)!.steamAppId).toBe(77);
  });

  it('only assigns ids of games that are kept', () => {
    const r = merge(input({ companies: comps, games: [g(1, [1], 100), g(2, [2], 1)], gameLimit: 1 }));
    expect(r.steam).toEqual({ '1': 1 });
  });
});
