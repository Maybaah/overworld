import { parseSteamInput } from '../src/myglobe/steamInput';

export interface SteamEnv {
  STEAM_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

export interface SteamDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const UPSTREAM = 'https://api.steampowered.com';
const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;
const MAX_TRACKED = 5000;
const MAX_CACHED = 2000;

interface OwnedResult {
  steamId: string;
  games: { appId: number; minutes: number }[];
}

class UpstreamError extends Error {
  constructor(readonly kind: 'unavailable' | 'rate_limited') {
    super(kind);
  }
}

const ownedCache = new Map<string, { at: number; value: OwnedResult }>();
const vanityCache = new Map<string, { at: number; id: string | null }>();
const hits = new Map<string, number[]>();

export function resetSteamProxyState(): void {
  ownedCache.clear();
  vanityCache.clear();
  hits.clear();
}

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHED) map.delete(map.keys().next().value!);
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    forwarded ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function limited(address: string, now: number): boolean {
  const recent = (hits.get(address) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(address, recent);
    return true;
  }
  recent.push(now);
  hits.set(address, recent);
  if (hits.size > MAX_TRACKED) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function corsHeaders(request: Request, env: SteamEnv): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
}

async function upstreamJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (res.status === 429) throw new UpstreamError('rate_limited');
    if (!res.ok) throw new UpstreamError('unavailable');
    return await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError('unavailable');
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

async function resolveVanity(name: string, key: string, fetchImpl: typeof fetch, now: number): Promise<string | null> {
  const cacheKey = name.toLowerCase();
  const cached = vanityCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_MS) return cached.id;
  const params = new URLSearchParams({ key, vanityurl: name });
  const body = await upstreamJson(`${UPSTREAM}/ISteamUser/ResolveVanityURL/v1/?${params}`, fetchImpl);
  const r = isRecord(body) ? body.response : undefined;
  if (!isRecord(r)) throw new UpstreamError('unavailable');
  if (r.success === 42) {
    remember(vanityCache, cacheKey, { at: now, id: null });
    return null;
  }
  if (r.success === 1 && typeof r.steamid === 'string' && /^7656119\d{10}$/.test(r.steamid)) {
    remember(vanityCache, cacheKey, { at: now, id: r.steamid });
    return r.steamid;
  }
  throw new UpstreamError('unavailable');
}

async function fetchOwned(steamId: string, key: string, fetchImpl: typeof fetch): Promise<OwnedResult | null> {
  const params = new URLSearchParams({
    key,
    steamid: steamId,
    include_played_free_games: '1',
    format: 'json',
  });
  const body = await upstreamJson(`${UPSTREAM}/IPlayerService/GetOwnedGames/v1/?${params}`, fetchImpl);
  const r = isRecord(body) ? body.response : undefined;
  if (!isRecord(r)) throw new UpstreamError('unavailable');
  if (Object.keys(r).length === 0) return null;
  const raw = Array.isArray(r.games) ? r.games : [];
  const games: OwnedResult['games'] = [];
  for (const g of raw) {
    if (!isRecord(g) || typeof g.appid !== 'number' || !Number.isInteger(g.appid)) continue;
    const minutes = typeof g.playtime_forever === 'number' && g.playtime_forever > 0 ? Math.floor(g.playtime_forever) : 0;
    games.push({ appId: g.appid, minutes });
  }
  return { steamId, games };
}

export async function handleSteamRequest(request: Request, env: SteamEnv, deps: SteamDeps = {}): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = (deps.now ?? Date.now)();
  const cors = corsHeaders(request, env);

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return respond(400, { error: 'bad_request' });
  }
  if (url.pathname !== '/api/steam/owned') return respond(404, { error: 'not_found' }, cors);

  if (request.method === 'OPTIONS') {
    if (Object.keys(cors).length === 0) return respond(405, { error: 'method_not_allowed' });
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' },
    });
  }
  if (request.method !== 'GET') return respond(405, { error: 'method_not_allowed' }, { ...cors, allow: 'GET, OPTIONS' });

  if (limited(clientAddress(request), now)) {
    return respond(429, { error: 'rate_limited' }, { ...cors, 'retry-after': '60' });
  }

  const key = env.STEAM_API_KEY?.trim();
  if (!key) return respond(503, { error: 'not_configured' }, cors);

  const input = parseSteamInput(url.searchParams.get('profile') ?? '');
  if (input.kind === 'invalid') return respond(400, { error: 'invalid_profile', reason: input.reason }, cors);

  try {
    let steamId: string;
    if (input.kind === 'steamid') steamId = input.id;
    else {
      const resolved = await resolveVanity(input.name, key, fetchImpl, now);
      if (resolved === null) return respond(404, { error: 'profile_not_found' }, cors);
      steamId = resolved;
    }

    const cached = ownedCache.get(steamId);
    if (cached && now - cached.at < CACHE_MS) return respond(200, cached.value, cors);

    const owned = await fetchOwned(steamId, key, fetchImpl);
    if (owned === null) return respond(403, { error: 'private_profile' }, cors);
    remember(ownedCache, steamId, { at: now, value: owned });
    return respond(200, owned, cors);
  } catch (err) {
    if (err instanceof UpstreamError && err.kind === 'rate_limited') {
      return respond(429, { error: 'rate_limited' }, cors);
    }
    return respond(502, { error: 'steam_unavailable' }, cors);
  }
}
