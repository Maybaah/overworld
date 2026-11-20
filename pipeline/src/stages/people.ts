import path from 'node:path';
import { existsSync } from 'node:fs';
import type { PersonRole } from '../../../shared/model';
import { createHttp } from '../http';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawWikidataGame, type RawWikidataPeople } from '../raw';
import { readJson, writeJson } from '../stageio';
import { runBatched } from './wikidata';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH_SIZE = 300;
const BATCH_FLOOR = 20;

export const PERSON_PROPERTIES: Record<string, PersonRole> = {
  P170: 'creator',
  P57: 'director',
  P162: 'producer',
  P287: 'designer',
  P58: 'writer',
  P3174: 'artist',
  P943: 'programmer',
  P86: 'composer',
  P5028: 'sound',
};

type Binding = Record<string, { type: string; value: string } | undefined>;

export interface PeopleDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export function buildPeopleQuery(qids: string[]): string {
  return `SELECT ?game ?prop ?person ?personLabel WHERE {
  VALUES ?game { ${qids.map((q) => `wd:${q}`).join(' ')} }
  VALUES ?prop { ${Object.keys(PERSON_PROPERTIES).map((p) => `wdt:${p}`).join(' ')} }
  ?game ?prop ?person .
  ?person wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const qidOf = (v: string | undefined) => (v ? /\/(Q\d+)$/.exec(v)?.[1] ?? null : null);
const propOf = (v: string | undefined) => (v ? /\/(P\d+)$/.exec(v)?.[1] ?? null : null);

export function parsePeople(rows: Binding[]): RawWikidataPeople[] {
  const byGame = new Map<string, Map<string, RawWikidataPeople['people'][number]>>();
  for (const b of rows) {
    const game = qidOf(b.game?.value);
    const person = qidOf(b.person?.value);
    const prop = propOf(b.prop?.value);
    const name = b.personLabel?.value;
    const role = prop ? PERSON_PROPERTIES[prop] : undefined;
    if (!game || !person || !role || !name || /^Q\d+$/.test(name)) continue;
    let people = byGame.get(game);
    if (!people) byGame.set(game, (people = new Map()));
    people.set(`${role}:${person}`, { qid: person, name, role });
  }
  return [...byGame]
    .map(([qid, people]) => ({ qid, people: [...people.values()].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

export async function runPeopleStage(config: PipelineConfig, deps: PeopleDeps = {}): Promise<{ games: number; people: number; skipped: boolean }> {
  const log = deps.log ?? ((msg: string) => console.log(msg));
  const out = path.join(config.stageDir, STAGE_FILES.wikidataPeople);
  if (!config.refresh && existsSync(out)) {
    const cached = await readJson<RawWikidataPeople[]>(out);
    log(`people: stage file exists, skipping (${cached.length} games)`);
    return { games: cached.length, people: cached.reduce((n, g) => n + g.people.length, 0), skipped: true };
  }
  const gamesFile = path.join(config.stageDir, STAGE_FILES.wikidataGames);
  if (!existsSync(gamesFile)) throw new Error(`People stage needs the Wikidata stage output, but ${gamesFile} is missing. Run the wikidata stage first.`);
  const qids = [...new Set((await readJson<RawWikidataGame[]>(gamesFile)).map((g) => g.qid))].sort();

  const http = createHttp({
    minIntervalMs: 1000,
    maxConcurrent: 1,
    userAgent: config.wikidataUserAgent,
    retries: 2,
    timeoutMs: 90_000,
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  let failed = 0;
  const rows = await runBatched(
    qids,
    BATCH_SIZE,
    BATCH_FLOOR,
    async (batch) => {
      const res = await http.request(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' },
        body: new URLSearchParams({ query: buildPeopleQuery(batch) }).toString(),
      });
      if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { results?: { bindings?: Binding[] } };
      return json.results?.bindings ?? [];
    },
    (batch, err) => {
      failed++;
      log(`people: batch of ${batch.length} failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  );
  const games = parsePeople(rows);
  await writeJson(out, games);
  const people = games.reduce((n, g) => n + g.people.length, 0);
  log(`people: ${games.length} of ${qids.length} games have key people (${people} credits), ${failed} failed batches`);
  return { games: games.length, people, skipped: false };
}
