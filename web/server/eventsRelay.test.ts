import { describe, expect, it, vi } from 'vitest';
import { handleEventsRequest, relayBody } from './eventsRelay';

const SID = 'sid_aaaaaaaaaaaaaaaa';
const ENV = { SUPABASE_URL: 'https://db.example/', SUPABASE_PUBLISHABLE_KEY: 'pk_test' };

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://overworld.example/api/e', { method: 'POST', body, headers });
}

describe('relayBody', () => {
  it('rebuilds the batch and takes the country only from the edge', () => {
    const raw = JSON.stringify({ sid: SID, ctx: { device: 'phone', country: 'us' }, events: [{ type: 'mode' }], extra: 1 });
    expect(JSON.parse(relayBody(raw, 'DE')!)).toEqual({ batch: { sid: SID, ctx: { device: 'phone', country: 'de' }, events: [{ type: 'mode' }] } });
    expect(JSON.parse(relayBody(raw, 'XX')!).batch.ctx).toEqual({ device: 'phone' });
  });

  it('refuses malformed bodies', () => {
    expect(relayBody('nope', null)).toBeNull();
    expect(relayBody(JSON.stringify({ sid: 'short', events: [{}] }), null)).toBeNull();
    expect(relayBody(JSON.stringify({ sid: SID, events: [] }), null)).toBeNull();
  });
});

describe('handleEventsRequest', () => {
  const body = JSON.stringify({ sid: SID, events: [{ type: 'mode', p: { mode: 'explore' } }] });

  it('forwards a valid batch to the log_events RPC with the publishable key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const res = await handleEventsRequest(post(body, { 'cf-ipcountry': 'JP' }), ENV, fetcher);
    expect(res.status).toBe(204);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://db.example/rest/v1/rpc/log_events');
    expect(init.headers.apikey).toBe('pk_test');
    expect(JSON.parse(init.body).batch.ctx).toEqual({ country: 'jp' });
  });

  it('does nothing when Supabase is not configured or the origin is not listed', async () => {
    const fetcher = vi.fn();
    expect((await handleEventsRequest(post(body), {}, fetcher)).status).toBe(204);
    const listed = { ...ENV, TELEMETRY_HOSTS: 'overworld.example' };
    await handleEventsRequest(post(body, { origin: 'https://evil.example' }), listed, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response(null));
    await handleEventsRequest(post(body, { origin: 'https://overworld.example' }), listed, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('answers 405 to other methods and 413 to large bodies', async () => {
    expect((await handleEventsRequest(new Request('https://x.example/api/e'), ENV)).status).toBe(405);
    expect((await handleEventsRequest(post('x'.repeat(20_000)), ENV, vi.fn())).status).toBe(413);
  });

  it('still answers 204 when the database is down', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('down'));
    expect((await handleEventsRequest(post(body), ENV, fetcher)).status).toBe(204);
  });
});
