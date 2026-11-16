import path from 'node:path';
import { createHttp, type Http } from '../http';
import type { PipelineConfig } from '../config';
import { STAGE_FILES, type RawSteamApp } from '../raw';
import { readJsonIfExists, writeJson } from '../stageio';

const API = 'https://steamspy.com/api.php';
// SteamSpy allows one "all" request per minute.
const MIN_INTERVAL_MS = 61_000;
export const OWNERS_FLOOR = 20_000;
export const REVIEWS_FLOOR = 125;
// Below the 20,000-owner band a page is still read while it holds this many apps with enough reviews.
const MIN_QUALIFYING_PER_PAGE = 10;
const MAX_PAGES = 400;

export interface SteamSpyDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

interface SpyRow {
  appid?: number;
  name?: string;
  positive?: number;
  negative?: number;
  owners?: string;
}

// "20,000 .. 50,000" -> [20000, 50000]
export function parseOwners(band: string | undefined): [number, number] {
  const nums = (band ?? '').split('..').map((s) => Number(s.replace(/[^0-9]/g, '')));
  return [Number.isFinite(nums[0]) ? nums[0]! : 0, Number.isFinite(nums[1]) ? nums[1]! : 0];
}

export function qualifies(app: Pick<RawSteamApp, 'ownersLow' | 'reviews'>): boolean {
  return app.ownersLow >= OWNERS_FLOOR || app.reviews >= REVIEWS_FLOOR;
}

export async function runSteamSpyStage(
  config: PipelineConfig,
  deps: SteamSpyDeps = {},
): Promise<{ apps: number; pages: number; skipped: boolean }> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const outFile = path.join(config.stageDir, STAGE_FILES.steamspy);
  const cacheDir = path.join(config.httpCacheDir, 'steamspy');
  const http: Http = createHttp({ minIntervalMs: MIN_INTERVAL_MS, maxConcurrent: 1, fetchImpl: deps.fetchImpl, sleep: deps.sleep, userAgent: config.wikidataUserAgent });

  const apps = new Map<number, RawSteamApp>();
  let page = 0;
  for (; page < MAX_PAGES; page++) {
    const file = path.join(cacheDir, `page-${page}.json`);
    let rows = config.refresh ? null : await readJsonIfExists<Record<string, SpyRow>>(file);
    if (!rows) {
      const res = await http.request(`${API}?request=all&page=${page}`);
      if (!res.ok) throw new Error(`SteamSpy page ${page}: HTTP ${res.status}`);
      rows = (await res.json()) as Record<string, SpyRow>;
      await writeJson(file, rows);
    }
    const list = Object.values(rows);
    if (list.length === 0) break;
    let qualifying = 0;
    let anyHighBand = false;
    for (const r of list) {
      if (typeof r.appid !== 'number') continue;
      const [low, high] = parseOwners(r.owners);
      const app: RawSteamApp = {
        appid: r.appid,
        name: r.name ?? '',
        reviews: (r.positive ?? 0) + (r.negative ?? 0),
        positive: r.positive ?? 0,
        ownersLow: low,
        ownersHigh: high,
      };
      if (low >= OWNERS_FLOOR) anyHighBand = true;
      if (!qualifies(app)) continue;
      qualifying++;
      apps.set(app.appid, app);
    }
    log(`steamspy: page ${page}, ${qualifying} qualifying, ${apps.size} total`);
    if (!anyHighBand && qualifying < MIN_QUALIFYING_PER_PAGE) {
      page++;
      break;
    }
  }
  const out = [...apps.values()].sort((a, b) => b.reviews - a.reviews || a.appid - b.appid);
  await writeJson(outFile, out);
  log(`steamspy: ${out.length} apps with ${OWNERS_FLOOR}+ owners or ${REVIEWS_FLOOR}+ reviews from ${page} pages`);
  return { apps: out.length, pages: page, skipped: false };
}
