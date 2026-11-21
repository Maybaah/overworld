import { describe, expect, it } from 'vitest';
import worker, { type WorkerEnv } from './worker';

function limiter(success: boolean) {
  const keys: string[] = [];
  return { keys, limit: async ({ key }: { key: string }) => (keys.push(key), { success }) };
}

const ip = { 'cf-connecting-ip': '203.0.113.7' };

describe('worker rate limits', () => {
  it('blocks the Steam proxy when the per-IP limit is spent', async () => {
    const l = limiter(false);
    const res = await worker.fetch(new Request('https://x.test/api/steam/owned?profile=gabe', { headers: ip }), { STEAM_LIMITER: l } as WorkerEnv);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(l.keys).toEqual(['203.0.113.7']);
  });

  it('blocks event batches when the per-IP limit is spent', async () => {
    const res = await worker.fetch(new Request('https://x.test/api/e', { method: 'POST', body: '{}', headers: ip }), { EVENTS_LIMITER: limiter(false) } as WorkerEnv);
    expect(res.status).toBe(429);
  });

  it('passes through under the limit and without a binding', async () => {
    const env = { STEAM_LIMITER: limiter(true) } as WorkerEnv;
    expect((await worker.fetch(new Request('https://x.test/api/steam/owned?profile=gabe', { headers: ip }), env)).status).toBe(503);
    expect((await worker.fetch(new Request('https://x.test/api/steam/owned?profile=gabe', { headers: ip }), {} as WorkerEnv)).status).toBe(503);
  });

  it('lets requests through when the limiter itself fails', async () => {
    const broken = { limit: async () => { throw new Error('down'); } };
    const res = await worker.fetch(new Request('https://x.test/api/steam/owned?profile=gabe', { headers: ip }), { STEAM_LIMITER: broken } as WorkerEnv);
    expect(res.status).toBe(503);
  });
});
