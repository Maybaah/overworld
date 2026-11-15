import path from 'node:path';
import { existsSync } from 'node:fs';
import { createHttp } from '../http';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawPopulation } from '../raw';
import { readJson, writeJson } from '../stageio';

const ENDPOINT = 'https://query.wikidata.org/sparql';

type Binding = Record<string, { type: string; value: string } | undefined>;

export interface PopulationDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export interface PopulationStageResult {
  countries: number;
  skipped: boolean;
}

export const POPULATION_QUERY = `SELECT ?country ?code ?pop ?year WHERE {
  ?country wdt:P297 ?code .
  ?country p:P1082 ?st .
  ?st a wikibase:BestRank ;
      ps:P1082 ?pop .
  OPTIONAL { ?st pq:P585 ?time . BIND(YEAR(?time) AS ?year) }
}`;

export function parsePopulation(bindings: Binding[], retrieved: string): RawPopulation {
  const countries: RawPopulation['countries'] = {};
  for (const b of bindings) {
    const code = b.code?.value;
    const population = Number(b.pop?.value);
    const qid = /\/(Q\d+)$/.exec(b.country?.value ?? '')?.[1];
    if (!code || !/^[A-Z]{2}$/.test(code) || !qid || !Number.isFinite(population) || population <= 0) continue;
    const yearValue = b.year ? Number(b.year.value) : NaN;
    const year = Number.isInteger(yearValue) ? yearValue : null;
    const prev = countries[code];
    if (!prev || (year ?? -Infinity) > (prev.year ?? -Infinity)) {
      countries[code] = { population: Math.round(population), year, qid };
    }
  }
  return { retrieved, countries };
}

export async function runPopulationStage(
  config: PipelineConfig,
  deps: PopulationDeps = {},
): Promise<PopulationStageResult> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const file = path.join(config.stageDir, STAGE_FILES.population);

  if (!config.refresh && existsSync(file)) {
    const existing = await readJson<RawPopulation>(file);
    const n = Object.keys(existing.countries).length;
    log(`population: stage file exists, skipping (${n} countries)`);
    return { countries: n, skipped: true };
  }

  const http = createHttp({
    minIntervalMs: 1000,
    maxConcurrent: 1,
    userAgent: config.wikidataUserAgent,
    retries: 2,
    timeoutMs: 90_000,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  const res = await http.request(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/sparql-results+json',
    },
    body: new URLSearchParams({ query: POPULATION_QUERY }).toString(),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  const raw = parsePopulation(json.results?.bindings ?? [], new Date().toISOString().slice(0, 10));
  await writeJson(file, raw);
  const n = Object.keys(raw.countries).length;
  log(`population: ${n} countries`);
  return { countries: n, skipped: false };
}
