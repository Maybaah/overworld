import { handleEventsRequest, type EventsEnv } from './eventsRelay';
import { handleSteamRequest, type SteamEnv } from './steamProxy';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface WorkerEnv extends SteamEnv, EventsEnv {
  STEAM_LIMITER?: RateLimiter;
  EVENTS_LIMITER?: RateLimiter;
}

async function allowed(limiter: RateLimiter | undefined, request: Request): Promise<boolean> {
  if (!limiter) return true;
  const ip = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
  try {
    return (await limiter.limit({ key: ip })).success;
  } catch {
    return true;
  }
}

function tooMany(): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/e') {
      if (!(await allowed(env.EVENTS_LIMITER, request))) return new Response(null, { status: 429, headers: { 'retry-after': '60' } });
      return handleEventsRequest(request, env);
    }
    if (pathname === '/api/steam/owned' && request.method === 'GET' && !(await allowed(env.STEAM_LIMITER, request))) return tooMany();
    return handleSteamRequest(request, env);
  },
};
