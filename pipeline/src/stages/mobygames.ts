import type { PipelineConfig } from '../config';

export async function runMobygamesStage(_config: PipelineConfig): Promise<{ skipped: boolean }> {
  console.log('mobygames: stage not implemented yet, skipped');
  return { skipped: true };
}
