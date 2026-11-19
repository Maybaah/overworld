import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface PipelineConfig {
  root: string;
  stageDir: string;
  httpCacheDir: string;
  outDir: string;
  reportDir: string;
  curatedDir: string;
  twitchClientId: string | null;
  twitchClientSecret: string | null;
  mobygamesApiKey: string | null;
  rawgApiKey: string | null;
  wikidataUserAgent: string;
  gameLimit: number;
  mobyLimit: number;
  refresh: boolean;
  only: string[] | null;
}

function flag(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): PipelineConfig {
  loadDotenv({ path: path.join(ROOT, '.env') });
  const contact = env('WIKIDATA_USER_AGENT_CONTACT');
  const limit = Number(flag(argv, 'limit') ?? env('GAME_LIMIT') ?? 100000);
  const mobyLimit = Number(flag(argv, 'moby-limit') ?? env('MOBY_LIMIT') ?? 10000);
  if (!Number.isInteger(limit) || limit <= 0) throw new Error(`Invalid game limit: ${limit}`);
  return {
    root: ROOT,
    stageDir: path.join(ROOT, 'pipeline', '.cache', 'stage'),
    httpCacheDir: path.join(ROOT, 'pipeline', '.cache', 'http'),
    outDir: path.join(ROOT, 'web', 'public', 'data'),
    reportDir: path.join(ROOT, 'reports'),
    curatedDir: path.join(ROOT, 'pipeline', 'data'),
    twitchClientId: env('TWITCH_CLIENT_ID'),
    twitchClientSecret: env('TWITCH_CLIENT_SECRET'),
    mobygamesApiKey: env('MOBYGAMES_API_KEY'),
    rawgApiKey: env('RAWG_API_KEY'),
    wikidataUserAgent: `overworld-pipeline/0.1 (${contact ?? 'no contact set; see WIKIDATA_USER_AGENT_CONTACT'})`,
    gameLimit: limit,
    mobyLimit: Number.isInteger(mobyLimit) && mobyLimit > 0 ? mobyLimit : 10000,
    refresh: argv.includes('--refresh'),
    only: flag(argv, 'only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
  };
}
