import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export type Range = '24h' | '7d' | '30d' | 'all';
export const RANGES: Range[] = ['24h', '7d', '30d', 'all'];

export type Ranked = [string, number][];

export type SeriesRow = [number, number, number, number, number, number];

export interface AdminStats {
  range: Range;
  generatedAt: number;
  from: number;
  bucket: 'hour' | 'day';
  totals: Record<string, number>;
  series: SeriesRow[];
  top: Record<string, Ranked>;
  recentErrors: { t: number; where?: string; msg?: string }[];
  rolledThrough: number | null;
  maintAt: number | null;
}

export type StatsResult = { ok: true; stats: AdminStats } | { ok: false; denied: boolean; message: string };

const NOT_CONFIGURED = 'Supabase is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.';

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'overworld-admin' } }) : null;
  return client;
}

export function adminUrl(): string {
  return `${location.origin}${location.pathname}`;
}

export async function currentSession(): Promise<Session | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function onSessionChange(fn: (session: Session | null) => void): () => void {
  const sb = supabase();
  if (!sb) return () => undefined;
  const { data } = sb.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return NOT_CONFIGURED;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: adminUrl(), shouldCreateUser: false } });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

export function takeAuthError(): string | null {
  for (const p of [new URLSearchParams(location.hash.replace(/^#/, '')), new URLSearchParams(location.search)]) {
    const desc = p.get('error_description') ?? p.get('error');
    if (!desc) continue;
    history.replaceState(null, '', location.pathname);
    if (p.get('error_code') === 'otp_expired') return 'That sign-in link was already used or has expired. Send a new one.';
    return desc.replace(/\+/g, ' ');
  }
  return null;
}

export async function fetchStats(range: Range): Promise<StatsResult> {
  const sb = supabase();
  if (!sb) return { ok: false, denied: false, message: NOT_CONFIGURED };
  const { data, error } = await sb.rpc('admin_stats', { p_range: range });
  if (error) return { ok: false, denied: error.code === '42501' || /not allowed|permission/i.test(error.message), message: error.message };
  const stats = parseStats(data);
  return stats ? { ok: true, stats } : { ok: false, denied: false, message: 'Unexpected response from admin_stats.' };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseStats(v: unknown): AdminStats | null {
  if (!isObj(v) || !RANGES.includes(v.range as Range)) return null;
  const totals = isObj(v.totals) ? Object.fromEntries(Object.entries(v.totals).map(([k, x]) => [k, num(x)])) : {};
  const top: Record<string, Ranked> = {};
  if (isObj(v.top)) {
    for (const [k, rows] of Object.entries(v.top)) {
      if (!Array.isArray(rows)) continue;
      top[k] = rows.filter((r): r is [string, number] => Array.isArray(r) && typeof r[0] === 'string').map((r) => [r[0], num(r[1])]);
    }
  }
  const series = Array.isArray(v.series)
    ? v.series.filter(Array.isArray).map((s: unknown[]) => [num(s[0]), num(s[1]), num(s[2]), num(s[3]), num(s[4]), num(s[5])] as SeriesRow)
    : [];
  const recentErrors = Array.isArray(v.recentErrors)
    ? v.recentErrors.filter(isObj).map((e) => ({
        t: num(e.t),
        where: typeof e.where === 'string' ? e.where : undefined,
        msg: typeof e.msg === 'string' ? e.msg : undefined,
      }))
    : [];
  return {
    range: v.range as Range,
    generatedAt: num(v.generatedAt),
    from: num(v.from),
    bucket: v.bucket === 'day' ? 'day' : 'hour',
    totals,
    series,
    top,
    recentErrors,
    rolledThrough: numOrNull(v.rolledThrough),
    maintAt: numOrNull(v.maintAt),
  };
}
