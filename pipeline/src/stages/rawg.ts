import path from 'node:path';
import { createHttp, type Http } from '../http';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawRawgGame } from '../raw';
import { readJsonIfExists, writeJson } from '../stageio';

const API = 'https://api.rawg.io/api/games';
const PAGE_SIZE = 40;
// Games are read most-added first until "added" drops below this; calibration later decides what counts.
export const RAWG_ADDED_FLOOR = 12;
const MAX_PAGES = 3000;

export interface RawgDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

interface RawgRow {
  id?: number;
  slug?: string;
  name?: string;
  released?: string | null;
  added?: number;
  ratings_count?: number;
}

export async function runRawgStage(
  config: PipelineConfig,
  deps: RawgDeps = {},
): Promise<{ games: number; pages: number; skipped: boolean }> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const key = config.rawgApiKey;
  if (!key) {
    log('rawg: no RAWG_API_KEY set, skipped');
    return { games: 0, pages: 0, skipped: true };
  }
  const cacheDir = path.join(config.httpCacheDir, 'rawg');
  const http: Http = createHttp({ minIntervalMs: 250, maxConcurrent: 2, fetchImpl: deps.fetchImpl, sleep: deps.sleep, userAgent: config.wikidataUserAgent });
  const games = new Map<number, RawRawgGame>();
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const file = path.join(cacheDir, `page-${page}.json`);
    let rows = config.refresh ? null : await readJsonIfExists<RawgRow[]>(file);
    if (!rows) {
      const qs = new URLSearchParams({ key, ordering: '-added', page_size: String(PAGE_SIZE), page: String(page) });
      const res = await http.request(`${API}?${qs.toString()}`);
      if (res.status === 404) break;
      if (res.status === 401 || res.status === 403) throw new Error(`RAWG rejected the API key: HTTP ${res.status}`);
      if (!res.ok) throw new Error(`RAWG page ${page}: HTTP ${res.status}`);
      const body = (await res.json()) as { results?: RawgRow[] };
      rows = body.results ?? [];
      await writeJson(file, rows);
    }
    if (rows.length === 0) break;
    let low = Infinity;
    for (const r of rows) {
      if (typeof r.id !== 'number') continue;
      const added = r.added ?? 0;
      low = Math.min(low, added);
      if (added < RAWG_ADDED_FLOOR) continue;
      games.set(r.id, {
        id: r.id,
        slug: r.slug ?? '',
        name: r.name ?? '',
        year: r.released ? Number(r.released.slice(0, 4)) || null : null,
        added,
        ratingsCount: r.ratings_count ?? 0,
      });
    }
    if (page % 50 === 0) log(`rawg: page ${page}, ${games.size} games, lowest added ${low}`);
    if (low < RAWG_ADDED_FLOOR) break;
  }
  const out = [...games.values()].sort((a, b) => b.added - a.added || a.id - b.id);
  await writeJson(path.join(config.stageDir, STAGE_FILES.rawg), out);
  log(`rawg: ${out.length} games with ${RAWG_ADDED_FLOOR}+ adds from ${page} pages`);
  return { games: out.length, pages: page, skipped: false };
}
