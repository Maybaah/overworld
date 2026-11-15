import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type PipelineConfig } from './config';
import { emit } from './emit';
import { merge, type Specialty } from './merge';
import { STAGE_FILES } from './raw';
import type {
  RawPopulation,
  RawIgdbCompany,
  RawIgdbGame,
  RawIgdbGenre,
  RawMobyGame,
  RawWikidataCompany,
  RawWikidataGame,
} from './raw';
import { readJson, readJsonIfExists } from './stageio';
import { runIgdbStage } from './stages/igdb';
import { runMobygamesStage } from './stages/mobygames';
import { runPopulationStage } from './stages/population';
import { runWikidataStage } from './stages/wikidata';
import { parseValidateArgs, runValidation } from './validate';

export const STAGE_NAMES = ['igdb', 'wikidata', 'population', 'mobygames', 'merge', 'validate'] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export type StageFn = (config: PipelineConfig) => Promise<unknown> | unknown;
export type StageMap = Record<StageName, StageFn>;

export async function runMergeStage(config: PipelineConfig): Promise<Record<string, number>> {
  const file = (name: string) => path.join(config.stageDir, name);
  const need = async <T>(name: string): Promise<T> => {
    try {
      return await readJson<T>(file(name));
    } catch (e) {
      throw new Error(`cannot read ${file(name)} (run the igdb stage first): ${(e as Error).message}`);
    }
  };
  const games = await need<RawIgdbGame[]>(STAGE_FILES.igdbGames);
  const companies = await need<RawIgdbCompany[]>(STAGE_FILES.igdbCompanies);
  const genres = await need<RawIgdbGenre[]>(STAGE_FILES.igdbGenres);
  const wikidataGames = (await readJsonIfExists<RawWikidataGame[]>(file(STAGE_FILES.wikidataGames))) ?? [];
  const wikidataCompanies = (await readJsonIfExists<RawWikidataCompany[]>(file(STAGE_FILES.wikidataCompanies))) ?? [];
  const moby = await readJsonIfExists<RawMobyGame[]>(file(STAGE_FILES.mobygames));
  const population = await readJsonIfExists<RawPopulation>(file(STAGE_FILES.population));
  const specialties = (await readJsonIfExists<Specialty[]>(path.join(config.curatedDir, 'company-specialties.json'))) ?? [];

  const result = merge({
    games, companies, genres, wikidataGames, wikidataCompanies, moby, specialties,
    gameLimit: config.gameLimit,
    now: new Date(),
  });
  await emit(result, config, population);
  return {
    games: result.games.length,
    companies: result.companies.length,
    roles: result.meta.counts.roles,
    dropped: result.report.droppedGames.length,
  };
}

export function runValidateStage(config: PipelineConfig, argv: string[] = process.argv.slice(2)): { ok: boolean; failedChecks: number } {
  const result = runValidation({ outDir: config.outDir, reportDir: config.reportDir, ...parseValidateArgs(argv) });
  const failedChecks = result.checks.filter((c) => !c.passed).length;
  if (!result.ok) throw new Error(`validation failed: ${failedChecks} check(s) failed, see reports/validation.md`);
  return { ok: true, failedChecks };
}

export const defaultStages: StageMap = {
  igdb: runIgdbStage,
  wikidata: runWikidataStage,
  population: runPopulationStage,
  mobygames: runMobygamesStage,
  merge: runMergeStage,
  validate: (config) => runValidateStage(config),
};

function describeResult(result: unknown): string {
  if (result && typeof result === 'object') {
    return Object.entries(result as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
  }
  return '';
}

export async function runPipeline(config: PipelineConfig, stages: StageMap = defaultStages): Promise<void> {
  const unknown = (config.only ?? []).filter((s) => !(STAGE_NAMES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    throw new Error(`unknown stage(s): ${unknown.join(', ')}. Valid stages: ${STAGE_NAMES.join(', ')}`);
  }
  const selected = STAGE_NAMES.filter((s) => config.only === null || config.only.includes(s));

  for (const name of selected) {
    if (name === 'mobygames' && config.mobygamesApiKey === null) {
      console.log('[mobygames] no MOBYGAMES_API_KEY set, stage skipped');
      continue;
    }
    console.log(`[${name}] start`);
    const started = Date.now();
    let result: unknown;
    try {
      result = await stages[name](config);
    } catch (e) {
      throw new Error(`stage "${name}" failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const counts = describeResult(result);
    console.log(`[${name}] done in ${seconds}s${counts ? ` (${counts})` : ''}`);
  }
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  try {
    await runPipeline(loadConfig());
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
