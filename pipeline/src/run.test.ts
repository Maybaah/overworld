import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PipelineConfig } from './config';
import { runMergeStage, runPipeline, runValidateStage, STAGE_NAMES, type StageMap } from './run';
import { STAGE_FILES } from './raw';
import { syntheticInput } from './test-factories';

let dir: string;
let logs: string[];

function config(over: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    root: dir,
    stageDir: join(dir, 'stage'),
    httpCacheDir: join(dir, 'http'),
    outDir: join(dir, 'out'),
    reportDir: join(dir, 'reports'),
    curatedDir: join(dir, 'curated'),
    twitchClientId: null,
    twitchClientSecret: null,
    mobygamesApiKey: 'key',
    rawgApiKey: null,
    wikidataUserAgent: 'test',
    gameLimit: 100,
    mobyLimit: 10000,
    refresh: false,
    only: null,
    ...over,
  };
}

function stubs(calls: string[], over: Partial<StageMap> = {}): StageMap {
  const mk = (name: string) => () => {
    calls.push(name);
    return { games: 3 };
  };
  return { steamspy: mk('steamspy'), rawg: mk('rawg'), igdb: mk('igdb'), wikidata: mk('wikidata'), population: mk('population'), mobygames: mk('mobygames'), merge: mk('merge'), validate: mk('validate'), ...over };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'run-'));
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((m: unknown) => void logs.push(String(m)));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('runPipeline', () => {
  it('runs the stages in order and logs start and end lines with counts and seconds', async () => {
    const calls: string[] = [];
    await runPipeline(config(), stubs(calls));
    expect(calls).toEqual(['steamspy', 'rawg', 'igdb', 'wikidata', 'population', 'mobygames', 'merge', 'validate']);
    expect(logs).toContain('[igdb] start');
    expect(logs.find((l) => l.startsWith('[merge] done'))).toMatch(/^\[merge\] done in \d+\.\ds \(games=3\)$/);
  });

  it('--only limits the stages and keeps the pipeline order', async () => {
    const calls: string[] = [];
    await runPipeline(config({ only: ['validate', 'igdb'] }), stubs(calls));
    expect(calls).toEqual(['igdb', 'validate']);
  });

  it('rejects unknown stage names', async () => {
    await expect(runPipeline(config({ only: ['nope'] }), stubs([]))).rejects.toThrow(/unknown stage.*nope/);
  });

  it('skips MobyGames with a log line when there is no API key', async () => {
    const calls: string[] = [];
    await runPipeline(config({ mobygamesApiKey: null }), stubs(calls));
    expect(calls).toEqual(['steamspy', 'rawg', 'igdb', 'wikidata', 'population', 'merge', 'validate']);
    expect(logs.some((l) => l.startsWith('[mobygames]') && /skipped/.test(l))).toBe(true);
  });

  it('stops at the first failing stage with a clear message', async () => {
    const calls: string[] = [];
    const stages = stubs(calls, {
      wikidata: () => {
        throw new Error('boom');
      },
    });
    await expect(runPipeline(config(), stages)).rejects.toThrow('stage "wikidata" failed: boom');
    expect(calls).toEqual(['steamspy', 'rawg', 'igdb']);
  });

  it('exposes the five stages', () => {
    expect([...STAGE_NAMES]).toEqual(['steamspy', 'rawg', 'igdb', 'wikidata', 'population', 'mobygames', 'merge', 'validate']);
  });
});

describe('merge and validate stages', () => {
  function writeStage(name: string, data: unknown) {
    mkdirSync(join(dir, 'stage'), { recursive: true });
    writeFileSync(join(dir, 'stage', name), JSON.stringify(data));
  }

  it('merge works with the Wikidata, MobyGames and specialties files absent, then validate passes', async () => {
    const i = syntheticInput(30);
    writeStage(STAGE_FILES.igdbGames, i.games);
    writeStage(STAGE_FILES.igdbCompanies, i.companies);
    writeStage(STAGE_FILES.igdbGenres, i.genres);
    const cfg = config();
    const counts = await runMergeStage(cfg);
    expect(counts.games).toBe(30);
    expect(existsSync(join(cfg.outDir, 'stats.json'))).toBe(true);
    expect(existsSync(join(cfg.outDir, 'meta.json'))).toBe(true);
    expect(existsSync(join(cfg.reportDir, 'merge-report.json'))).toBe(true);
    expect(runValidateStage(cfg, ['--sample=3'])).toEqual({ ok: true, failedChecks: 0 });
    expect(existsSync(join(cfg.reportDir, 'spot-check.md'))).toBe(true);
  });

  it('merge explains a missing IGDB stage file', async () => {
    await expect(runMergeStage(config())).rejects.toThrow(/igdb stage first/);
  });

  it('validate stage throws when validation fails', () => {
    expect(() => runValidateStage(config(), [])).toThrow(/validation failed/);
  });
});
