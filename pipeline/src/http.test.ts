import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttp } from './http';

const T0 = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function recorder() {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  return { sleeps, sleep };
}

function ok(body = 'ok'): Response {
  return new Response(body, { status: 200 });
}

describe('createHttp', () => {
  it('spaces request starts by at least minIntervalMs', async () => {
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi.fn(async () => ok()) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 100, maxConcurrent: 10, fetchImpl, sleep });

    await Promise.all([1, 2, 3, 4].map(() => http.request('https://example.test/a')));

    expect(sleeps.sort((a, b) => a - b)).toEqual([100, 200, 300]);
  });

  it('does not wait when enough time has passed', async () => {
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi.fn(async () => ok()) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 100, maxConcurrent: 1, fetchImpl, sleep });

    await http.request('https://example.test/a');
    vi.setSystemTime(T0 + 1000);
    await http.request('https://example.test/a');

    expect(sleeps).toEqual([]);
  });

  it('never has more than maxConcurrent requests open', async () => {
    let open = 0;
    let peak = 0;
    const fetchImpl = (async () => {
      open++;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 5));
      open--;
      return ok();
    }) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 2, fetchImpl, sleep: async () => {} });

    const results = await Promise.all(Array.from({ length: 7 }, () => http.request('https://example.test/a')));

    expect(results).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it('retries on 429 and honours Retry-After seconds', async () => {
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(ok('fine')) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    const res = await http.request('https://example.test/a');

    expect(await res.text()).toBe('fine');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
  });

  it('retries on 500 with exponential backoff and jitter', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(ok()) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    const res = await http.request('https://example.test/a');

    expect(res.status).toBe(200);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('applies jitter within half to full backoff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(ok()) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    await http.request('https://example.test/a');

    expect(sleeps).toEqual([500]);
  });

  it('retries on network errors', async () => {
    const { sleep } = recorder();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok()) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    const res = await http.request('https://example.test/a');

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry other 4xx and returns the response', async () => {
    const { sleeps, sleep } = recorder();
    const fetchImpl = vi.fn(async () => new Response('bad field', { status: 400 })) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    const res = await http.request('https://example.test/a');

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('bad field');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('gives up after the last retry with status, clean URL and truncated body', async () => {
    const { sleep } = recorder();
    const longBody = 'x'.repeat(1000);
    const fetchImpl = vi.fn(async () => new Response(longBody, { status: 503 })) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, retries: 2, fetchImpl, sleep });

    const error = await http.request('https://example.test/path?api_key=SECRET123').catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(message).toContain('503');
    expect(message).toContain('https://example.test/path');
    expect(message).not.toContain('SECRET123');
    expect(message).toContain('x'.repeat(300));
    expect(message).not.toContain('x'.repeat(301));
  });

  it('defaults to 5 retries', async () => {
    const { sleep } = recorder();
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, fetchImpl, sleep });

    await expect(http.request('https://example.test/a')).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('throws after the last retry on persistent network errors', async () => {
    const { sleep } = recorder();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, retries: 1, fetchImpl, sleep });

    await expect(http.request('https://example.test/a?token=abc')).rejects.toThrow(/fetch failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends the configured user agent unless the caller set one', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('user-agent') ?? '');
      return ok();
    }) as unknown as typeof fetch;
    const http = createHttp({ minIntervalMs: 0, maxConcurrent: 1, userAgent: 'overworld/1', fetchImpl });

    await http.request('https://example.test/a');
    await http.request('https://example.test/a', { headers: { 'User-Agent': 'custom' } });

    expect(seen).toEqual(['overworld/1', 'custom']);
  });
});
