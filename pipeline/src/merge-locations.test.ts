import { describe, expect, it } from 'vitest';
import { merge } from './merge';
import { company, game, input, row, wdCompany, wdGame } from './test-factories';

describe('merge: city naming (1)', () => {
  it('passes the Wikidata label through resolveCity and keeps the coordinates', () => {
    const calls: [string, number, number][] = [];
    const r = merge(input({
      companies: [company(1, 'A', { country: 392 })],
      games: [game(1, [row(10, 1, { developer: true })])],
      wikidataCompanies: [wdCompany(1, { hq: { qid: 'Q1', label: 'Shinagawa-ku', lat: 35.61, lng: 139.73 }, country: 'JP' })],
      resolveCity: (label, lat, lng) => {
        calls.push([label, lat, lng]);
        return 'Tokyo';
      },
    }));
    expect(calls).toEqual([['Shinagawa-ku', 35.61, 139.73]]);
    expect(r.companies[0]).toMatchObject({ city: 'Tokyo', lat: 35.61, lng: 139.73, precision: 'city' });
  });
});

describe('merge: manual location corrections (2)', () => {
  const fix = { name: 'Alpha Games', city: 'Lyon', country: 'FR', lat: 45.76, lng: 4.83, evidenceUrl: 'https://e/alpha' };
  const base = () => input({
    companies: [company(1, 'Alpha Games Inc.', { country: 392 }), company(2, 'Beta')],
    games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })])],
    wikidataCompanies: [wdCompany(1, { hq: { qid: 'Q1', label: 'Kyoto', lat: 35, lng: 135.7 }, country: 'JP' })],
    resolveCity: () => 'RENAMED',
  });

  it('wins over every other source, matched by normalized name, with no city renaming', () => {
    const r = merge({ ...base(), locationCorrections: [fix] });
    expect(r.companies[0]).toMatchObject({
      country: 'FR', city: 'Lyon', lat: 45.76, lng: 4.83, precision: 'city',
      locationSource: { source: 'curated', id: 'alpha games', url: 'https://e/alpha' },
    });
    expect(r.companies[0]!.sources.map((s) => s.source)).toEqual(['igdb', 'wikidata', 'curated']);
    expect(r.report.unusedLocationCorrections).toEqual([]);
    expect(r.report.companiesByPrecision).toEqual({ city: 1, country: 0, none: 1 });
  });

  it('matches by igdbCompanyId and applies to a company with no other location', () => {
    const r = merge({ ...base(), locationCorrections: [{ ...fix, name: 'whatever', igdbCompanyId: 2 }] });
    expect(r.companies[1]).toMatchObject({ city: 'Lyon', precision: 'city' });
    expect(r.companies[0]!.city).toBe('RENAMED');
  });

  it('reports unused corrections, including ones with invalid coordinates', () => {
    const r = merge({
      ...base(),
      locationCorrections: [
        { ...fix, name: 'Nobody Studio' },
        { ...fix, name: 'Beta', lat: 0, lng: 0 },
        { ...fix, name: 'Nope', igdbCompanyId: 999 },
      ],
    });
    expect(r.report.unusedLocationCorrections).toEqual([
      { name: 'Nobody Studio', igdbCompanyId: null },
      { name: 'Beta', igdbCompanyId: null },
      { name: 'Nope', igdbCompanyId: 999 },
    ]);
    expect(r.companies[1]!.precision).toBe('none');
  });
});

describe('merge: country from the games a company leads (3)', () => {
  const comps = [company(1, 'Lead Co'), company(2, 'Other')];

  it('uses the country when all led games with a Wikidata country agree, sourced from the most popular game', () => {
    const r = merge(input({
      companies: comps,
      games: [
        game(1, [row(10, 1, { developer: true })], { totalRatingCount: 5 }),
        game(2, [row(11, 1, { developer: true })], { totalRatingCount: 9 }),
        game(3, [row(12, 1, { developer: true })], { totalRatingCount: 1 }),
      ],
      wikidataGames: [wdGame(1, [], { countryOfOrigin: 'PL' }), wdGame(2, [], { countryOfOrigin: 'PL' })],
    }));
    const c = r.companies[0]!;
    expect(c).toMatchObject({ country: 'PL', city: null, precision: 'country' });
    expect(c.locationSource).toEqual({ source: 'wikidata', id: 'Q92', url: 'https://www.wikidata.org/wiki/Q92' });
    expect(c.lat).not.toBeNull();
    expect(r.report.countryFromGames).toBe(1);
  });

  it('does nothing when the games disagree, when no game has a country, or when the company leads nothing', () => {
    const r = merge(input({
      companies: comps,
      games: [
        game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })], { totalRatingCount: 5 }),
        game(2, [row(12, 1, { developer: true })], { totalRatingCount: 9 }),
      ],
      wikidataGames: [wdGame(1, [], { countryOfOrigin: 'PL' }), wdGame(2, [], { countryOfOrigin: 'DE' })],
    }));
    expect(r.companies[0]!.precision).toBe('none');
    expect(r.companies[1]).toMatchObject({ precision: 'none', country: null });
    expect(r.report.countryFromGames).toBe(0);
    const noCountry = merge(input({
      companies: comps,
      games: [game(1, [row(10, 1, { developer: true }), row(11, 2, { publisher: true })])],
      wikidataGames: [wdGame(1, [])],
    }));
    expect(noCountry.report.countryFromGames).toBe(0);
  });

  it('does not override a country from IGDB', () => {
    const r = merge(input({
      companies: [company(1, 'Lead Co', { country: 392 })],
      games: [game(1, [row(10, 1, { developer: true })])],
      wikidataGames: [wdGame(1, [], { countryOfOrigin: 'PL' })],
    }));
    expect(r.companies[0]).toMatchObject({ country: 'JP', locationSource: { source: 'igdb' } });
    expect(r.report.countryFromGames).toBe(0);
  });
});

describe('merge: rescuing games with no IGDB developer (4)', () => {
  it('accepts a Wikidata developer linked to a company that is not involved in the game', () => {
    const r = merge(input({
      companies: [company(1, 'Sony Pub'), company(2, 'Santa Monica Studio')],
      games: [game(1, [row(10, 1, { publisher: true })])],
      wikidataCompanies: [wdCompany(2, { qid: 'Q222' })],
      wikidataGames: [wdGame(1, [], { developers: [{ qid: 'Q000', label: 'Unlinked' }, { qid: 'Q222', label: 'Santa Monica Studio' }] })],
    }));
    expect(r.report.droppedGames).toEqual([]);
    expect(r.games[0]!.leadCompanyId).toBe(2);
    expect(r.details[0]!.leadBasis).toBe('wikidata_developer');
    const lead = r.details[0]!.roles.find((x) => x.role === 'lead_developer')!;
    expect(lead.companyId).toBe(2);
    expect(lead.source).toEqual({ source: 'wikidata', id: 'Q91', url: 'https://www.wikidata.org/wiki/Q91' });
    expect(r.companies.map((c) => c.id)).toEqual([1, 2]);
  });

  it('first qualifying Wikidata developer wins', () => {
    const r = merge(input({
      companies: [company(1, 'Pub'), company(2, 'Dev A'), company(3, 'Dev B')],
      games: [game(1, [row(10, 1, { publisher: true })])],
      wikidataCompanies: [wdCompany(2, { qid: 'Q2' }), wdCompany(3, { qid: 'Q3' })],
      wikidataGames: [wdGame(1, [], { developers: [{ qid: 'Q3', label: 'b' }, { qid: 'Q2', label: 'a' }] })],
    }));
    expect(r.games[0]!.leadCompanyId).toBe(3);
  });

  it('prefers an involved company, and still drops games with no usable developer', () => {
    const r = merge(input({
      companies: [company(1, 'Pub'), company(2, 'Involved Dev'), company(3, 'Outside')],
      games: [
        game(1, [row(10, 2, { supporting: true })], { totalRatingCount: 9 }),
        game(2, [row(11, 1, { publisher: true })], { totalRatingCount: 5 }),
        game(3, [], { totalRatingCount: 1 }),
      ],
      wikidataCompanies: [wdCompany(2, { qid: 'Q2' }), wdCompany(3, { qid: 'Q3' })],
      wikidataGames: [
        wdGame(1, [], { developers: [{ qid: 'Q3', label: 'Outside' }, { qid: 'Q2', label: 'Involved Dev' }] }),
        wdGame(2, [], { developers: [{ qid: 'QX', label: 'Nobody' }] }),
      ],
    }));
    expect(r.games.map((g) => [g.id, g.leadCompanyId])).toEqual([[1, 2]]);
    expect(r.report.droppedGames.map((d) => d.id)).toEqual([2, 3]);
    expect(r.report.droppedGames[1]!.reason).toBe('no involved companies');
  });
});

describe('merge: lead studios without a city (5)', () => {
  it('lists lead studios that are not city precision, by led games', () => {
    const r = merge(input({
      companies: [company(1, 'Has City'), company(2, 'Country Only', { country: 840 }), company(3, 'Nowhere'), company(4, 'Pub')],
      games: [
        game(1, [row(1, 1, { developer: true }), row(2, 4, { publisher: true })]),
        game(2, [row(3, 2, { developer: true })]),
        game(3, [row(4, 2, { developer: true })]),
        game(4, [row(5, 3, { developer: true })]),
      ],
      wikidataCompanies: [wdCompany(1, { hq: { qid: 'Q1', label: 'Kyoto', lat: 35, lng: 135.7 }, country: 'JP' })],
    }));
    expect(r.report.leadStudiosWithoutCity).toEqual([
      { companyId: 2, name: 'Country Only', precision: 'country', country: 'US', ledGames: 2 },
      { companyId: 3, name: 'Nowhere', precision: 'none', country: null, ledGames: 1 },
    ]);
  });

  it('is capped at 100 entries', () => {
    const companies = Array.from({ length: 120 }, (_, i) => company(i + 1, `C${i + 1}`));
    const games = companies.map((c) => game(c.id, [row(c.id, c.id, { developer: true })]));
    expect(merge(input({ companies, games })).report.leadStudiosWithoutCity).toHaveLength(100);
  });
});
