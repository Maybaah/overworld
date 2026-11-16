import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface PipelineConfig {
  root: string;
  stageDir: string; // intermediate stage files (git-ignored)
  httpCacheDir: string; // raw HTTP response cache (git-ignored)
  outDir: string; // web/public/data
  reportDir: string; // reports/
  curatedDir: string; // pipeline/data, hand-maintained inputs
  twitchClientId: string | null;
  twitchClientSecret: string | null;
  mobygamesApiKey: string | null;
  wikidataUserAgent: string;
  gameLimit: number;
  mobyLimit: number; // MobyGames is rate limited to 720 requests an hour, so it covers only the most played games
  refresh: boolean; // ignore existing stage files and fetch again
  only: string[] | null; // run only these stages
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
    wikidataUserAgent: `overworld-pipeline/0.1 (${contact ?? 'no contact set; see WIKIDATA_USER_AGENT_CONTACT'})`,
    gameLimit: limit,
    mobyLimit: Number.isInteger(mobyLimit) && mobyLimit > 0 ? mobyLimit : 10000,
    refresh: argv.includes('--refresh'),
    only: flag(argv, 'only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
  };
}
