import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DETAIL_CHUNK_SIZE } from '../../shared/model';
import type { MergeResult } from './merge';
import type { PipelineConfig } from './config';
import { writeJson } from './stageio';

export async function emit(
  result: MergeResult,
  config: Pick<PipelineConfig, 'outDir' | 'reportDir'>,
): Promise<void> {
  const { outDir, reportDir } = config;
  const detailsDir = path.join(outDir, 'details');
  await mkdir(detailsDir, { recursive: true });

  const chunks = Math.ceil(result.details.length / DETAIL_CHUNK_SIZE);
  for (let n = 0; n < chunks; n++) {
    const slice = result.details.slice(n * DETAIL_CHUNK_SIZE, (n + 1) * DETAIL_CHUNK_SIZE);
    await writeJson(path.join(detailsDir, `${n}.json`), slice);
  }
  for (const f of await readdir(detailsDir)) {
    const m = /^(\d+)\.json(\.tmp)?$/.exec(f);
    if (m && (m[2] || Number(m[1]) >= chunks)) await rm(path.join(detailsDir, f), { force: true });
  }

  const steam: Record<number, number> = {};
  for (const [i, d] of result.details.entries()) {
    if (d.steamAppId !== null && steam[d.steamAppId] === undefined) steam[d.steamAppId] = result.games[i]!.id;
  }

  const companies = [...result.companies].sort((a, b) => a.id - b.id);
  await writeJson(path.join(outDir, 'meta.json'), result.meta);
  await writeJson(path.join(outDir, 'companies.json'), companies);
  await writeJson(path.join(outDir, 'games.json'), result.games);
  await writeJson(path.join(outDir, 'steam.json'), steam);
  await writeJson(path.join(reportDir, 'merge-report.json'), result.report, true);
}
