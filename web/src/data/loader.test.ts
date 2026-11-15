import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDetail } from '@shared';
import { chunkOf, loadCore, loadGameDetail, resetLoader } from './loader';
import { company, game } from './testData';

const CHUNK = 250;
const games = Array.from({ length: 600 }, (_, i) => game(5000 + i, { leadCompanyId: 1 }));
const meta = { detailChunkSize: CHUNK, detailChunks: 3, counts: { games: 600, companies: 1 } };

function chunkFile(n: number): GameDetail[] {
  return games.slice(n * CHUNK, (n + 1) * CHUNK).map((g) => ({
    id: g.id,
    leadBasis: 'igdb_single_developer',
    platforms: [],
    screenshots: [],
    steamAppId: null,
    roles: [],
    sources: [],
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Not Found' });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetLoader();
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/meta.json')) return json(meta);
    if (url.endsWith('/companies.json')) return json([company(1)]);
    if (url.endsWith('/games.json')) return json(games);
    const m = /details\/(\d+)\.json$/.exec(url);
    if (m) return json(chunkFile(Number(m[1])));
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chunkOf', () => {
  it('maps positions to chunks', () => {
    expect(chunkOf(0, 250)).toBe(0);
    expect(chunkOf(249, 250)).toBe(0);
    expect(chunkOf(250, 250)).toBe(1);
    expect(chunkOf(599, 250)).toBe(2);
    expect(chunkOf(199, 100)).toBe(1);
  });
});

describe('loadCore', () => {
  it('fetches the three core files from the data base', async () => {
    const core = await loadCore();
    expect(core.games).toHaveLength(600);
    expect(core.companies).toHaveLength(1);
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/data/companies.json',
      '/data/games.json',
      '/data/meta.json',
    ]);
  });

  it('starts all fetches before any resolves', async () => {
    const started: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      started.push(url);
      await Promise.resolve();
      return json(url.endsWith('games.json') ? games : url.endsWith('meta.json') ? meta : []);
    });
    const p = loadCore();
    expect(started).toHaveLength(3);
    await p;
  });

  it('reports HTTP failures with the url and status', async () => {
    fetchMock.mockImplementation(async () => json({}, 404));
    await expect(loadCore()).rejects.toThrow(/\/data\/\w+\.json: HTTP 404/);
  });

  it('retries after a failure', async () => {
    fetchMock.mockImplementationOnce(async () => json({}, 500));
    await expect(loadCore()).rejects.toThrow(/HTTP 500/);
    await expect(loadCore()).resolves.toBeDefined();
  });
});

describe('loadGameDetail', () => {
  it('loads the chunk that holds the game', async () => {
    const detail = await loadGameDetail(5000 + 300);
    expect(detail.id).toBe(5300);
    const detailCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.includes('/details/'));
    expect(detailCalls).toEqual(['/data/details/1.json']);
  });

  it('caches chunks across calls', async () => {
    await loadGameDetail(5001);
    await loadGameDetail(5002);
    await loadGameDetail(5249);
    const detailCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/details/'));
    expect(detailCalls).toHaveLength(1);
  });

  it('fetches each chunk once for concurrent calls', async () => {
    const results = await Promise.all([loadGameDetail(5010), loadGameDetail(5011), loadGameDetail(5012), loadGameDetail(5500)]);
    expect(results.map((r) => r.id)).toEqual([5010, 5011, 5012, 5500]);
    const detailCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.includes('/details/'));
    expect(detailCalls.sort()).toEqual(['/data/details/0.json', '/data/details/2.json']);
  });

  it('rejects unknown games', async () => {
    await expect(loadGameDetail(1)).rejects.toThrow(/Unknown game id 1/);
  });

  it('reports chunk HTTP errors and allows a retry', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/details/')) return json({}, 404);
      if (url.endsWith('/meta.json')) return json(meta);
      if (url.endsWith('/companies.json')) return json([]);
      return json(games);
    });
    await expect(loadGameDetail(5000)).rejects.toThrow(/details\/0\.json: HTTP 404/);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/details/')) return json(chunkFile(0));
      if (url.endsWith('/meta.json')) return json(meta);
      if (url.endsWith('/companies.json')) return json([]);
      return json(games);
    });
    await expect(loadGameDetail(5000)).resolves.toMatchObject({ id: 5000 });
  });
});
