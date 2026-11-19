export interface EventsEnv {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  TELEMETRY_HOSTS?: string;
}

const MAX_BYTES = 16_384;
const SID_RE = /^[A-Za-z0-9_-]{16,32}$/;

export function relayBody(raw: string, country: string | null): string | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { sid, ctx, events } = v as Record<string, unknown>;
  if (typeof sid !== 'string' || !SID_RE.test(sid)) return null;
  if (!Array.isArray(events) || events.length === 0 || events.length > 50) return null;
  const c: Record<string, unknown> = ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? { ...(ctx as Record<string, unknown>) } : {};
  delete c.country;
  const cc = country?.trim().toLowerCase();
  if (cc && /^[a-z]{2}$/.test(cc) && cc !== 'xx' && cc !== 't1') c.country = cc;
  return JSON.stringify({ batch: { sid, ctx: c, events } });
}

function hostAllowed(request: Request, hosts: string | undefined): boolean {
  const list = (hosts ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return false;
  try {
    return list.includes(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function handleEventsRequest(request: Request, env: EventsEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const done = (status = 204) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !hostAllowed(request, env.TELEMETRY_HOSTS)) return done();
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return done(413);
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BYTES) return done(413);
  const body = raw ? relayBody(raw, request.headers.get('cf-ipcountry')) : null;
  if (!body) return done();
  try {
    await fetcher(`${url}/rest/v1/rpc/log_events`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return done();
  }
  return done();
}
