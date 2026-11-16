import { DETAIL_CHUNK_SIZE, ROLE_TYPES, detailChunkOf } from '@shared';
import type { Company, CompanyGamesFile, DataMeta, GameDetail, GameSummary, RoleType } from '@shared';

export interface CoreData {
  meta: DataMeta;
  companies: Company[];
  games: GameSummary[];
}

function dataBase(): string {
  return (import.meta.env.VITE_DATA_BASE ?? '/data').replace(/\/+$/, '');
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${dataBase()}/${path}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
  }
  return (await res.json()) as T;
}

export function chunkOf(position: number, chunkSize: number): number {
  return chunkSize === DETAIL_CHUNK_SIZE ? detailChunkOf(position) : Math.floor(position / chunkSize);
}

let corePromise: Promise<CoreData> | null = null;
let positions: Map<number, number> | null = null;
const chunks = new Map<number, Promise<GameDetail[]>>();
let companyGamesPromise: Promise<Map<number, CompanyGameEntry[]>> | null = null;

export function resetLoader(): void {
  corePromise = null;
  positions = null;
  chunks.clear();
  companyGamesPromise = null;
}

export function loadCore(): Promise<CoreData> {
  if (!corePromise) {
    const promise = Promise.all([
      fetchJson<DataMeta>('meta.json'),
      fetchJson<Company[]>('companies.json'),
      fetchJson<GameSummary[]>('games.json'),
    ]).then(([meta, companies, games]) => ({ meta, companies, games }));
    corePromise = promise;
    promise.catch(() => {
      if (corePromise === promise) corePromise = null;
    });
  }
  return corePromise;
}

function loadChunk(n: number): Promise<GameDetail[]> {
  let promise = chunks.get(n);
  if (!promise) {
    const created = fetchJson<GameDetail[]>(`details/${n}.json`);
    promise = created;
    chunks.set(n, created);
    created.catch(() => {
      if (chunks.get(n) === created) chunks.delete(n);
    });
  }
  return promise;
}

export async function loadGameDetail(gameId: number): Promise<GameDetail> {
  const { meta, games } = await loadCore();
  if (!positions) positions = new Map(games.map((g, i) => [g.id, i]));
  const position = positions.get(gameId);
  if (position === undefined) throw new Error(`Unknown game id ${gameId}`);
  const size = meta.detailChunkSize;
  const n = chunkOf(position, size);
  const chunk = await loadChunk(n);
  const guess = chunk[position - n * size];
  const detail = guess?.id === gameId ? guess : chunk.find((d) => d.id === gameId);
  if (!detail) throw new Error(`Game ${gameId} missing from details/${n}.json`);
  return detail;
}

export interface CompanyGameEntry {
  gameId: number;
  role: RoleType;
}

export function loadCompanyGames(): Promise<Map<number, CompanyGameEntry[]>> {
  if (!companyGamesPromise) {
    const promise = fetchJson<CompanyGamesFile>('company-games.json').then((file) => {
      const map = new Map<number, CompanyGameEntry[]>();
      for (const [id, flat] of Object.entries(file)) {
        const entries: CompanyGameEntry[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) {
          const role = ROLE_TYPES[flat[i + 1]!];
          if (role !== undefined) entries.push({ gameId: flat[i]!, role });
        }
        map.set(Number(id), entries);
      }
      return map;
    });
    companyGamesPromise = promise;
    promise.catch(() => {
      if (companyGamesPromise === promise) companyGamesPromise = null;
    });
  }
  return companyGamesPromise;
}

let steamMapPromise: Promise<Record<string, number>> | null = null;

export function resetSteamMapCache(): void {
  steamMapPromise = null;
}

export function loadSteamMap(): Promise<Record<string, number>> {
  if (!steamMapPromise) {
    const promise = fetchJson<Record<string, number>>('steam.json');
    steamMapPromise = promise;
    promise.catch(() => {
      if (steamMapPromise === promise) steamMapPromise = null;
    });
  }
  return steamMapPromise;
}
