// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSteamRequest, resetSteamProxyState } from './steamProxy';

const KEY = 'SECRETKEY1234567890ABCDEF';
const ID = '76561198000000001';
const env = { STEAM_API_KEY: KEY };

function req(profile: string | null, init: RequestInit = {}): Request {
  const q = profile === null ? '' : `?profile=${encodeURIComponent(profile)}`;
  return new Request(`https://overworld.test/api/steam/owned${q}`, init);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

type Upstream = (url: string) => Response | Promise<Response>;

function fakeFetch(handler: Upstream) {
  return vi.fn(async (input: RequestInfo | URL) => handler(String(input))) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const ownedOk: Upstream = (url) => {
  if (url.includes('GetOwnedGames')) {
    return json({
      response: {
        game_count: 3,
        games: [
          { appid: 10, playtime_forever: 120, name: 'leak', img_icon_url: 'x' },
          { appid: 20 },
          { appid: 'bad' },
        ],
      },
    });
  }
  return json({ response: { success: 1, steamid: ID } });
};

async function bodyAndHeaders(res: Response): Promise<string> {
  const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${headers}\n${await res.clone().text()}`;
}

beforeEach(() => {
  resetSteamProxyState();
});

describe('handleSteamRequest', () => {
  it('returns 503 when no key is configured', async () => {
    const f = fakeFetch(ownedOk);
    for (const e of [{}, { STEAM_API_KEY: '' }, { STEAM_API_KEY: '  ' }]) {
      const res = await handleSteamRequest(req(ID), e, { fetchImpl: f });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'not_configured' });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid input', async () => {
    const f = fakeFetch(ownedOk);
    for (const p of ['', 'bad name!', 'https://example.com/x']) {
      const res = await handleSteamRequest(req(p), env, { fetchImpl: f });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid_profile');
      expect(typeof body.reason).toBe('string');
    }
    expect((await handleSteamRequest(req(null), env, { fetchImpl: f })).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns owned games for a SteamID64 and passes nothing else through', async () => {
    const f = fakeFetch(ownedOk);
    const res = await handleSteamRequest(req(ID), env, { fetchImpl: f });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      steamId: ID,
      games: [
        { appId: 10, minutes: 120 },
        { appId: 20, minutes: 0 },
      ],
    });
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(url.searchParams.get('steamid')).toBe(ID);
    expect(url.searchParams.get('include_played_free_games')).toBe('1');
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('accepts a profile URL with an id', async () => {
    const res = await handleSteamRequest(req(`https://steamcommunity.com/profiles/${ID}/`), env, { fetchImpl: fakeFetch(ownedOk) });
    expect(res.status).toBe(200);
  });

  it('resolves a vanity name first', async () => {
    const f = fakeFetch(ownedOk);
    const res = await handleSteamRequest(req('https://steamcommunity.com/id/gabe'), env, { fetchImpl: f });
    expect(res.status).toBe(200);
    expect((await res.json()).steamId).toBe(ID);
    const first = new URL(String(f.mock.calls[0]![0]));
    expect(first.origin + first.pathname).toBe('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
    expect(first.searchParams.get('vanityurl')).toBe('gabe');
    expect(first.searchParams.get('key')).toBe(KEY);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('returns 404 when the vanity name does not exist', async () => {
    const f = fakeFetch(() => json({ response: { success: 42, message: 'No match' } }));
    const res = await handleSteamRequest(req('nobody-here'), env, { fetchImpl: f });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'profile_not_found' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for a private profile (empty response object)', async () => {
    const res = await handleSteamRequest(req(ID), env, { fetchImpl: fakeFetch(() => json({ response: {} })) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'private_profile' });
  });

  it('returns an empty list for a public profile with no games', async () => {
    const res = await handleSteamRequest(req(ID), env, { fetchImpl: fakeFetch(() => json({ response: { game_count: 0 } })) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ steamId: ID, games: [] });
  });

  it('returns 502 on upstream failures, bad bodies and timeouts', async () => {
    const cases: Upstream[] = [
      () => json({}, 500),
      () => json({}, 403),
      () => new Response('<html>nope</html>', { status: 200 }),
      () => json({ nope: true }),
      () => {
        throw new TypeError('network down');
      },
    ];
    for (const c of cases) {
      resetSteamProxyState();
      const res = await handleSteamRequest(req(ID), env, { fetchImpl: fakeFetch(c) });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'steam_unavailable' });
    }
  });

  it('times out after 8 seconds', async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn((_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      ) as unknown as typeof fetch;
      const pending = handleSteamRequest(req(ID), env, { fetchImpl: f });
      await vi.advanceTimersByTimeAsync(8001);
      const res = await pending;
      expect(res.status).toBe(502);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps Steam 429 to 429', async () => {
    const res = await handleSteamRequest(req(ID), env, { fetchImpl: fakeFetch(() => json({}, 429)) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });

  it('caches per steam id for 10 minutes', async () => {
    let t = 1_000_000;
    const f = fakeFetch(ownedOk);
    const deps = { fetchImpl: f, now: () => t };
    expect((await handleSteamRequest(req(ID, { headers: { 'x-forwarded-for': '1.1.1.1' } }), env, deps)).status).toBe(200);
    t += 9 * 60 * 1000;
    const again = await handleSteamRequest(req(ID, { headers: { 'x-forwarded-for': '1.1.1.1' } }), env, deps);
    expect(again.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
    t += 2 * 60 * 1000;
    await handleSteamRequest(req(ID, { headers: { 'x-forwarded-for': '1.1.1.1' } }), env, deps);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 2000 profiles in the cache, dropping the oldest', async () => {
    const f = fakeFetch(ownedOk);
    const id = (n: number) => `765611980${String(n).padStart(8, '0')}`;
    for (let n = 0; n <= 2000; n++) {
      await handleSteamRequest(req(id(n), { headers: { 'x-forwarded-for': `9.9.${n >> 8}.${n & 255}` } }), env, { fetchImpl: f });
    }
    expect(f).toHaveBeenCalledTimes(2001);
    await handleSteamRequest(req(id(2000)), env, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2001);
    await handleSteamRequest(req(id(0)), env, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2002);
  });

  it('does not cache failures', async () => {
    const f = fakeFetch(() => json({}, 500));
    await handleSteamRequest(req(ID), env, { fetchImpl: f });
    await handleSteamRequest(req(ID), env, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('rate limits 20 requests per minute per client address', async () => {
    let t = 5_000_000;
    const f = fakeFetch(ownedOk);
    const deps = { fetchImpl: f, now: () => t };
    const from = (ip: string) => req(ID, { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
    for (let i = 0; i < 20; i++) {
      expect((await handleSteamRequest(from('2.2.2.2'), env, deps)).status).toBe(200);
    }
    const blocked = await handleSteamRequest(from('2.2.2.2'), env, deps);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: 'rate_limited' });
    expect((await handleSteamRequest(from('3.3.3.3'), env, deps)).status).toBe(200);
    t += 61_000;
    expect((await handleSteamRequest(from('2.2.2.2'), env, deps)).status).toBe(200);
  });

  it('rejects other routes and methods', async () => {
    const f = fakeFetch(ownedOk);
    const other = await handleSteamRequest(new Request('https://overworld.test/api/steam/other'), env, { fetchImpl: f });
    expect(other.status).toBe(404);
    const post = await handleSteamRequest(req(ID, { method: 'POST' }), env, { fetchImpl: f });
    expect(post.status).toBe(405);
    expect(f).not.toHaveBeenCalled();
  });

  describe('key secrecy', () => {
    it('never appears in any response, including upstream bodies that echo the url', async () => {
      const echo: Upstream = (url) => json({ error: `bad request for ${url}`, url }, 500);
      const echoOk: Upstream = (url) => json({ response: { success: 42, echo: url } });
      const echoPrivate: Upstream = (url) => json({ response: {}, echo: url });
      const echo429: Upstream = (url) => new Response(`slow down ${url}`, { status: 429 });
      const throwing: Upstream = (url) => {
        throw new Error(`fetch failed ${url}`);
      };
      const profiles = [ID, 'gabelogannewell', 'https://steamcommunity.com/id/gabe', 'bad name!', ''];
      const upstreams = [echo, echoOk, echoPrivate, echo429, throwing, ownedOk];
      const seen: string[] = [];
      for (const up of upstreams) {
        for (const p of profiles) {
          resetSteamProxyState();
          const res = await handleSteamRequest(req(p), env, { fetchImpl: fakeFetch(up) });
          seen.push(await bodyAndHeaders(res));
        }
      }
      resetSteamProxyState();
      seen.push(await bodyAndHeaders(await handleSteamRequest(req(ID), {}, {})));
      seen.push(await bodyAndHeaders(await handleSteamRequest(req(ID, { method: 'POST' }), env, {})));
      seen.push(await bodyAndHeaders(await handleSteamRequest(new Request('https://overworld.test/x'), env, {})));
      expect(seen.length).toBeGreaterThan(30);
      for (const s of seen) expect(s).not.toContain(KEY);
    });

    it('is never logged', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
      await handleSteamRequest(req(ID), env, { fetchImpl: fakeFetch(() => json({}, 500)) });
      for (const s of spies) {
        expect(JSON.stringify(s.mock.calls)).not.toContain(KEY);
        s.mockRestore();
      }
    });
  });

  describe('CORS', () => {
    const f = () => fakeFetch(ownedOk);

    it('sends no CORS headers by default', async () => {
      const res = await handleSteamRequest(req(ID, { headers: { origin: 'https://other.test' } }), env, { fetchImpl: f() });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('allows exactly the configured origin', async () => {
      const e = { ...env, ALLOWED_ORIGIN: 'https://site.test' };
      const ok = await handleSteamRequest(req(ID, { headers: { origin: 'https://site.test' } }), e, { fetchImpl: f() });
      expect(ok.headers.get('access-control-allow-origin')).toBe('https://site.test');
      expect(ok.headers.get('vary')).toBe('Origin');
      const no = await handleSteamRequest(req(ID, { headers: { origin: 'https://evil.test' } }), e, { fetchImpl: f() });
      expect(no.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('answers preflight only for the allowed origin', async () => {
      const e = { ...env, ALLOWED_ORIGIN: 'https://site.test' };
      const ok = await handleSteamRequest(req(ID, { method: 'OPTIONS', headers: { origin: 'https://site.test' } }), e);
      expect(ok.status).toBe(204);
      expect(ok.headers.get('access-control-allow-origin')).toBe('https://site.test');
      const no = await handleSteamRequest(req(ID, { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }), e);
      expect(no.status).toBe(405);
      expect(no.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
