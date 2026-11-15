import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineConfig } from '../config';
import { parsePopulation, POPULATION_QUERY, runPopulationStage } from './population';

let dir: string;
const sleep = async () => {};

function config(over: Partial<PipelineConfig> = {}): PipelineConfig {
  return { stageDir: dir, refresh: false, wikidataUserAgent: 'test-agent/1.0 (contact)', ...over } as PipelineConfig;
}

const b = (qid: string, code: string, pop: string, year?: string) => ({
  country: { type: 'uri', value: `http://www.wikidata.org/entity/${qid}` },
  code: { type: 'literal', value: code },
  pop: { type: 'literal', value: pop },
  ...(year ? { year: { type: 'literal', value: year } } : {}),
});

function fakeFetch(bindings: unknown[], calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ results: { bindings } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pop-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('parsePopulation', () => {
  it('keeps the most recent year per country and ignores bad rows', () => {
    const raw = parsePopulation(
      [
        b('Q17', 'JP', '120000000', '2015'),
        b('Q17', 'JP', '124000000.0', '2024'),
        b('Q17', 'JP', '1', '2000'),
        b('Q36', 'PL', '37500000'),
        b('Q36', 'PL', '37000000', '2020'),
        b('Q1', 'XXX', '5'),
        b('Q2', 'ZZ', 'abc'),
        b('Q3', 'ZY', '0'),
      ],
      '2026-05-01',
    );
    expect(raw.retrieved).toBe('2026-05-01');
    expect(raw.countries).toEqual({
      JP: { population: 124_000_000, year: 2024, qid: 'Q17' },
      PL: { population: 37_000_000, year: 2020, qid: 'Q36' },
    });
  });
});

describe('runPopulationStage', () => {
  it('sends one SPARQL POST with the user agent and writes the stage file', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const logs: string[] = [];
    const result = await runPopulationStage(config(), {
      fetchImpl: fakeFetch([b('Q17', 'JP', '124000000', '2024'), b('Q30', 'US', '340000000', '2024')], calls),
      sleep,
      log: (m) => logs.push(m),
    });
    expect(result).toEqual({ countries: 2, skipped: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://query.wikidata.org/sparql');
    const init = calls[0]!.init!;
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('accept')).toBe('application/sparql-results+json');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(headers.get('user-agent')).toBe('test-agent/1.0 (contact)');
    expect(new URLSearchParams(String(init.body)).get('query')).toBe(POPULATION_QUERY);
    expect(POPULATION_QUERY).toMatch(/P297/);
    expect(POPULATION_QUERY).toMatch(/P1082/);
    expect(POPULATION_QUERY).toMatch(/P585/);
    const file = JSON.parse(readFileSync(join(dir, 'population.json'), 'utf8'));
    expect(file.countries.JP).toEqual({ population: 124_000_000, year: 2024, qid: 'Q17' });
    expect(file.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('skips when the file exists and refresh is off, and refetches with refresh', async () => {
    await runPopulationStage(config(), { fetchImpl: fakeFetch([b('Q17', 'JP', '1')]), sleep, log: () => {} });
    const calls: { url: string }[] = [];
    const skipped = await runPopulationStage(config(), { fetchImpl: fakeFetch([], calls), sleep, log: () => {} });
    expect(skipped).toEqual({ countries: 1, skipped: true });
    expect(calls).toHaveLength(0);
    const again = await runPopulationStage(config({ refresh: true }), {
      fetchImpl: fakeFetch([b('Q17', 'JP', '2'), b('Q30', 'US', '3')], calls),
      sleep,
      log: () => {},
    });
    expect(again.countries).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it('fails clearly on an HTTP error and writes nothing', async () => {
    const failing = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
    await expect(runPopulationStage(config(), { fetchImpl: failing, sleep, log: () => {} })).rejects.toThrow(/HTTP 400/);
    expect(existsSync(join(dir, 'population.json'))).toBe(false);
  });
});
