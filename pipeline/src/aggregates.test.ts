import { describe, expect, it } from 'vitest';
import { ROLE_TYPES } from '../../shared/model';
import { buildAggregates, buildCompanyGames, buildFlows, buildStats } from './aggregates';
import { merge } from './merge';
import type { RawPopulation } from './raw';
import { company, game, input, row } from './test-factories';

const JP = 392;
const US = 840;
const PL = 616;

function scenario() {
  return merge(input({
    companies: [
      company(1, 'Dev JP', { country: JP }),
      company(2, 'Dev US', { country: US }),
      company(3, 'Loc PL', { country: PL }),
      company(4, 'Pub Nowhere', { parent: 5 }),
      company(5, 'Big Pub', { country: US }),
    ],
    games: [
      game(1, [row(10, 1, { developer: true }), row(11, 5, { publisher: true }), row(12, 3, { supporting: true })], {
        totalRatingCount: 100, genres: [1, 32], firstReleaseDate: Date.UTC(2000, 0, 1) / 1000,
      }),
      game(2, [row(13, 2, { developer: true }), row(14, 4, { publisher: true }), row(15, 3, { supporting: true }), row(16, 1, { porting: true })], {
        totalRatingCount: 90, genres: [1], firstReleaseDate: Date.UTC(2000, 5, 1) / 1000,
      }),
      game(3, [row(17, 1, { developer: true }), row(18, 4, { publisher: true })], {
        totalRatingCount: 80, genres: [2], firstReleaseDate: null,
      }),
      game(4, [row(19, 4, { developer: true })], { totalRatingCount: 70, genres: [2], firstReleaseDate: Date.UTC(2001, 0, 1) / 1000 }),
    ],
    specialties: [{ igdbCompanyId: 3, name: 'Loc PL', specialty: 'localization', evidenceUrl: 'https://e/loc' }],
  }));
}

const population: RawPopulation = {
  retrieved: '2026-05-01',
  countries: { JP: { population: 124_000_000, year: 2024, qid: 'Q17' }, US: { population: 0, year: null, qid: 'Q30' } },
};

describe('buildCompanyGames', () => {
  it('lists [gameId, roleIndex] pairs per company in games order and includes every company', () => {
    const r = scenario();
    const cg = buildCompanyGames(r);
    expect(Object.keys(cg)).toEqual(r.companies.map((c) => String(c.id)));
    const idx = (role: (typeof ROLE_TYPES)[number]) => ROLE_TYPES.indexOf(role);
    expect(cg['1']).toEqual([1, idx('lead_developer'), 2, idx('port'), 3, idx('lead_developer')]);
    expect(cg['3']).toEqual([1, idx('localization'), 2, idx('localization')]);
  });

  it('lists a role once per game even when it appears on several platforms', () => {
    const r = scenario();
    r.details[0]!.roles.push({ ...r.details[0]!.roles.find((x) => x.role === 'publisher')!, platform: 'PC' });
    expect(buildCompanyGames(r)['5']).toEqual([1, ROLE_TYPES.indexOf('publisher')]);
  });
});

describe('buildFlows', () => {
  it('counts non-lead roles from the lead country to the company country, never lead_developer', () => {
    const { flows } = buildFlows(scenario());
    expect(flows.some((f) => f.role === 'lead_developer')).toBe(false);
    const find = (role: string, from: string, to: string) => flows.find((f) => f.role === role && f.from === from && f.to === to);
    expect(find('localization', 'JP', 'PL')).toEqual({ role: 'localization', from: 'JP', to: 'PL', games: 1, examples: [1] });
    expect(find('localization', 'US', 'PL')).toMatchObject({ games: 1, examples: [2] });
    expect(find('publisher', 'JP', 'US')).toMatchObject({ games: 1, examples: [1] });
    expect(find('port', 'US', 'JP')).toMatchObject({ games: 1, examples: [2] });
    expect(flows.some((f) => f.to === undefined || f.from === undefined)).toBe(false);
  });

  it('skips companies without a country, counts same-country pairs, and sorts', () => {
    const r = scenario();
    const { flows } = buildFlows(r);
    expect(flows.find((f) => f.role === 'publisher' && f.to === 'JP')).toBeUndefined();
    for (let i = 1; i < flows.length; i++) expect(flows[i - 1]!.games).toBeGreaterThanOrEqual(flows[i]!.games);
    const same = merge(input({
      companies: [company(1, 'A', { country: JP }), company(2, 'B', { country: JP })],
      games: [game(1, [row(1, 1, { developer: true }), row(2, 2, { publisher: true })])],
    }));
    expect(buildFlows(same).flows).toEqual([{ role: 'publisher', from: 'JP', to: 'JP', games: 1, examples: [1] }]);
  });

  it('counts a game once per (role, from, to) and keeps the 3 most popular examples', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      game(i + 1, [row(i * 10 + 1, 1, { developer: true }), row(i * 10 + 2, 2, { publisher: true }), row(i * 10 + 3, 3, { publisher: true })], {
        totalRatingCount: 50 - i,
      }),
    );
    const r = merge(input({
      companies: [company(1, 'A', { country: JP }), company(2, 'B', { country: US }), company(3, 'C', { country: US })],
      games,
    }));
    expect(buildFlows(r).flows).toEqual([{ role: 'publisher', from: 'JP', to: 'US', games: 5, examples: [1, 2, 3] }]);
  });
});

describe('buildStats', () => {
  it('computes country stats with region, population and per-million rounding', () => {
    const s = buildStats(scenario(), population);
    const jp = s.countries.find((c) => c.code === 'JP')!;
    expect(jp).toMatchObject({ region: 'Asia', subregion: 'Eastern Asia', population: 124_000_000, studios: 1, gamesLed: 2 });
    expect(jp.gamesPerMillion).toBe(0.02);
    expect(jp.genres).toEqual({ '1': 1, '2': 1, '32': 1 });
    const us = s.countries.find((c) => c.code === 'US')!;
    expect(us).toMatchObject({ gamesLed: 1, population: 0, gamesPerMillion: null, studios: 2 });
    const pl = s.countries.find((c) => c.code === 'PL')!;
    expect(pl).toMatchObject({ gamesLed: 0, population: null, gamesPerMillion: null });
    expect(s.countries.map((c) => c.gamesLed)).toEqual([2, 1, 0]);
  });

  it('gamesLed counts only games whose lead has a country', () => {
    const s = buildStats(scenario(), null);
    expect(s.countries.reduce((a, c) => a + c.gamesLed, 0)).toBe(3);
  });

  it('groups genres by region', () => {
    const s = buildStats(scenario(), null);
    expect(s.regions.find((r) => r.region === 'Asia')).toEqual({ region: 'Asia', gamesLed: 2, genres: { '1': 1, '2': 1, '32': 1 } });
    expect(s.regions.find((r) => r.region === 'Americas')!.gamesLed).toBe(1);
  });

  it('counts years, skipping null, with overlapping indie and major publisher counts', () => {
    const s = buildStats(scenario(), null);
    expect(s.years).toEqual([
      { year: 2000, total: 2, indie: 1, majorPublisher: 2 },
      { year: 2001, total: 1, indie: 0, majorPublisher: 0 },
    ]);
  });

  it('picks the top 25 publishers, ties by lower id, and counts parents of major publishers', () => {
    const companies = [company(1, 'Dev', { country: JP })];
    const games = [];
    let n = 0;
    for (let p = 100; p < 125; p++) companies.push(company(p, `Pub ${p}`));
    for (let p = 100; p < 125; p++) {
      for (let k = 0; k < 2; k++) {
        n++;
        games.push(game(n, [row(n * 10, 1, { developer: true }), row(n * 10 + 1, p, { publisher: true })], { totalRatingCount: 1000 - n }));
      }
    }
    companies.push(company(125, 'Small Pub'), company(200, 'Child Of 100', { parent: 100 }), company(201, 'Child Of 125', { parent: 125 }));
    games.push(game(900, [row(1, 1, { developer: true }), row(2, 200, { publisher: true })], { totalRatingCount: 5 }));
    games.push(game(901, [row(3, 1, { developer: true }), row(4, 201, { publisher: true })], { totalRatingCount: 4 }));
    games.push(game(902, [row(5, 1, { developer: true }), row(6, 125, { publisher: true })], { totalRatingCount: 3 }));
    const s = buildStats(merge(input({ companies, games })), null);
    expect(s.majorPublishers).toHaveLength(25);
    expect(s.majorPublishers[0]).toEqual({ companyId: 100, name: 'Pub 100', games: 2 });
    expect(s.majorPublishers.some((m) => m.companyId === 125)).toBe(false);
    const year = s.years.find((y) => y.year === 2010)!;
    expect(year.total).toBe(53);
    expect(year.majorPublisher).toBe(51);
  });

  it('records the population source', () => {
    expect(buildStats(scenario(), population).populationSource).toEqual({
      name: 'Wikidata', url: 'https://www.wikidata.org', licence: 'CC0 1.0', retrieved: '2026-05-01',
    });
    expect(buildStats(scenario(), null).populationSource.retrieved).toBe('');
  });

  it('buildAggregates bundles all three', () => {
    const a = buildAggregates(scenario(), null);
    expect(Object.keys(a).sort()).toEqual(['companyGames', 'flows', 'stats']);
  });
});
