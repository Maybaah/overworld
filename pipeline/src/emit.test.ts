import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DETAIL_CHUNK_SIZE } from '../../shared/model';
import { emit } from './emit';
import { merge } from './merge';
import { company, game, input, row } from './test-factories';

let dir: string;
let cfg: { outDir: string; reportDir: string };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'emit-'));
  cfg = { outDir: join(dir, 'data'), reportDir: join(dir, 'reports') };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function big(n: number) {
  const games = Array.from({ length: n }, (_, i) =>
    game(i + 1, [row(i + 1, (i % 3) + 1, { developer: true })], {
      totalRatingCount: n - i,
      steamAppId: i % 2 === 0 ? 1000 + i : null,
    }),
  );
  return merge(input({ companies: [company(1, 'A'), company(2, 'B'), company(3, 'C')], games }));
}

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name), `${rel}${e.name}/`);
      else out[`${rel}${e.name}`] = readFileSync(join(d, e.name), 'utf8');
    }
  };
  walk(root, '');
  return out;
}

describe('emit', () => {
  it('writes all files and chunks details in games order', async () => {
    const n = DETAIL_CHUNK_SIZE * 2 + 5;
    const result = big(n);
    await emit(result, cfg);
    expect(readdirSync(cfg.outDir).sort()).toEqual(['companies.json', 'company-games.json', 'details', 'flows.json', 'games.json', 'meta.json', 'stats.json', 'steam.json']);
    expect(readdirSync(join(cfg.outDir, 'details')).sort()).toEqual(['0.json', '1.json', '2.json']);
    const chunk = (i: number) => JSON.parse(readFileSync(join(cfg.outDir, 'details', `${i}.json`), 'utf8'));
    expect(chunk(0)).toHaveLength(DETAIL_CHUNK_SIZE);
    expect(chunk(2)).toHaveLength(5);
    expect([...chunk(0), ...chunk(1), ...chunk(2)].map((d: { id: number }) => d.id)).toEqual(result.games.map((g) => g.id));
    const meta = JSON.parse(readFileSync(join(cfg.outDir, 'meta.json'), 'utf8'));
    expect(meta.detailChunks).toBe(3);
    const steam = JSON.parse(readFileSync(join(cfg.outDir, 'steam.json'), 'utf8'));
    expect(steam['1000']).toBe(1);
    expect(steam['1002']).toBe(3);
    expect(Object.keys(steam)).toHaveLength(Math.ceil(n / 2));
  });

  it('writes company-games, stats and flows, using the population when given', async () => {
    await emit(big(6), cfg, { retrieved: '2026-01-01', countries: { JP: { population: 1_000_000, year: 2024, qid: 'Q17' } } });
    const cg = JSON.parse(readFileSync(join(cfg.outDir, 'company-games.json'), 'utf8'));
    expect(Object.keys(cg)).toEqual(['1', '2', '3']);
    expect(cg['1']).toEqual([1, 0, 4, 0]);
    const stats = JSON.parse(readFileSync(join(cfg.outDir, 'stats.json'), 'utf8'));
    expect(stats.populationSource.retrieved).toBe('2026-01-01');
    expect(JSON.parse(readFileSync(join(cfg.outDir, 'flows.json'), 'utf8'))).toEqual({ flows: [] });
  });

  it('writes compact data files and a pretty report', async () => {
    await emit(big(3), cfg);
    expect(readFileSync(join(cfg.outDir, 'games.json'), 'utf8')).not.toContain('\n');
    expect(readFileSync(join(cfg.reportDir, 'merge-report.json'), 'utf8')).toContain('\n  "droppedGames"');
  });

  it('removes stale detail chunks from an earlier larger run', async () => {
    await emit(big(DETAIL_CHUNK_SIZE * 3), cfg);
    expect(readdirSync(join(cfg.outDir, 'details'))).toHaveLength(3);
    writeFileSync(join(cfg.outDir, 'details', 'notes.txt'), 'keep');
    await emit(big(10), cfg);
    expect(readdirSync(join(cfg.outDir, 'details')).sort()).toEqual(['0.json', 'notes.txt']);
  });

  it('is byte-identical on a second run, and sorts companies by id', async () => {
    const result = big(DETAIL_CHUNK_SIZE + 10);
    result.companies.reverse();
    await emit(result, cfg);
    const first = snapshot(dir);
    await emit(result, cfg);
    expect(snapshot(dir)).toEqual(first);
    const companies = JSON.parse(first['data/companies.json']!);
    expect(companies.map((c: { id: number }) => c.id)).toEqual([1, 2, 3]);
  });
});
