export type EventType =
  | 'game_open'
  | 'search'
  | 'place_open'
  | 'mode'
  | 'year_play'
  | 'share'
  | 'myglobe'
  | 'insights_tab'
  | 'ready'
  | 'error';

export type Props = Record<string, string | number | boolean | undefined>;

export interface Queued {
  type: EventType;
  t: number;
  p: Props;
}

export interface TelemetryEnv {
  endpoint?: string;
  hosts?: string;
  hostname?: string;
  dev?: boolean;
  webdriver?: boolean;
  doNotTrack?: boolean;
  optedOut?: boolean;
}

export const OPT_OUT_KEY = 'overworld.noanalytics';
const OPT_OUT_RE = /[?&]noanalytics=1(?:&|$)/;
const SID_KEY = 'overworld.sid';
const SID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const MAX_BATCH = 50;
const MAX_QUEUE = 200;
const FLUSH_MS = 5000;

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$|\.(localhost|test|local)$/i;

export function telemetryAllowed(env: TelemetryEnv): boolean {
  if (!env.endpoint || env.dev || env.webdriver || env.doNotTrack || env.optedOut) return false;
  const host = (env.hostname ?? '').toLowerCase();
  if (!host || LOCAL_HOST.test(host)) return false;
  const hosts = (env.hosts ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length === 0 || hosts.includes(host);
}

export function deviceClass(w: number, h: number, coarse: boolean): 'phone' | 'tablet' | 'desktop' {
  const short = Math.min(w, h);
  if (coarse) return short < 600 ? 'phone' : 'tablet';
  return short < 500 ? 'phone' : 'desktop';
}

export function referrerHost(referrer: string, ownHost: string): string | undefined {
  try {
    if (!referrer) return undefined;
    const strip = (h: string) => h.toLowerCase().replace(/^www\./, '');
    const h = strip(new URL(referrer).hostname);
    if (!h || h === strip(ownHost)) return undefined;
    return /^[a-z0-9.-]{1,100}$/.test(h) ? h : undefined;
  } catch {
    return undefined;
  }
}

export function utmOf(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = new URLSearchParams(search);
  for (const [k, max] of [
    ['utm_source', 40],
    ['utm_medium', 40],
    ['utm_campaign', 60],
  ] as const) {
    const v = q.get(k)?.trim();
    if (v) out[k] = clip(v, max);
  }
  return out;
}

export function entryOf(search: string): 'landing' | 'game' | 'place' | 'mode' {
  const q = new URLSearchParams(search);
  if (q.has('game')) return 'game';
  if (q.has('place')) return 'place';
  const mode = q.get('mode');
  return mode && mode !== 'explore' ? 'mode' : 'landing';
}

export function scrubMessage(msg: unknown): string | undefined {
  if (msg == null) return undefined;
  const s = String(msg)
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')
    .replace(/-?\d+\.\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? clip(s, 200) : undefined;
}

function clip(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length > max ? cps.slice(0, max).join('') : s;
}

export function buildBatches(events: Queued[], now: number, sid: string, ctx: Record<string, string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < events.length; i += MAX_BATCH) {
    const chunk = events.slice(i, i + MAX_BATCH).map((e) => {
      const ev: Record<string, unknown> = { type: e.type, dt: Math.min(600_000, Math.max(0, now - e.t)) };
      if (Object.keys(e.p).length) ev.p = e.p;
      return ev;
    });
    out.push(JSON.stringify({ sid, ctx, events: chunk }));
  }
  return out;
}

function randomId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(bytes, (b) => abc[b & 63]).join('');
}

function sessionId(): string {
  try {
    const have = sessionStorage.getItem(SID_KEY);
    if (have && SID_RE.test(have)) return have;
    const id = randomId();
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    return (memorySid ??= randomId());
  }
}

type Sender = (url: string, body: string, beacon: boolean) => void;

let memorySid: string | undefined;
let allowed: boolean | undefined;
let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let ctx: Record<string, string> | undefined;
let sender: Sender = defaultSender;
let env: TelemetryEnv | undefined;

function readOptOut(search: string): boolean {
  try {
    if (OPT_OUT_RE.test(search)) sessionStorage.setItem(OPT_OUT_KEY, '1');
    return sessionStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return OPT_OUT_RE.test(search);
  }
}

export function browserEnv(): TelemetryEnv {
  const vars = import.meta.env as Record<string, string | boolean | undefined>;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return {
    endpoint: typeof vars.VITE_EVENTS_URL === 'string' ? vars.VITE_EVENTS_URL.trim() : undefined,
    hosts: typeof vars.VITE_TELEMETRY_HOSTS === 'string' ? vars.VITE_TELEMETRY_HOSTS : undefined,
    hostname: location.hostname,
    dev: vars.DEV === true,
    webdriver: nav.webdriver === true,
    doNotTrack: nav.doNotTrack === '1' || nav.globalPrivacyControl === true,
    optedOut: readOptOut(location.search),
  };
}

export function configure(next: TelemetryEnv, context: Record<string, string>): boolean {
  env = next;
  ctx = context;
  allowed = telemetryAllowed(next);
  return allowed;
}

export function track(type: EventType, p: Props = {}): void {
  try {
    if (!allowed) return;
    if (queue.length >= MAX_QUEUE) return;
    const clean: Props = {};
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
      clean[k] = v;
    }
    queue.push({ type, t: Date.now(), p: clean });
    if (queue.length >= 20) flush(false);
    else timer ??= setTimeout(() => flush(false), FLUSH_MS);
  } catch {
    return;
  }
}

export function flush(beacon: boolean): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (!queue.length || !env?.endpoint) return;
  const events = queue;
  queue = [];
  try {
    for (const body of buildBatches(events, Date.now(), sessionId(), ctx ?? {})) sender(env.endpoint, body, beacon);
  } catch {
    return;
  }
}

function defaultSender(url: string, body: string, beacon: boolean): void {
  if (beacon && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
  void fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => undefined);
}

export function resetForTests(opts: { allowed?: boolean; sender?: Sender; endpoint?: string } = {}): { queue: () => Queued[] } {
  allowed = opts.allowed;
  sender = opts.sender ?? defaultSender;
  env = { endpoint: opts.endpoint ?? '/api/e' };
  ctx = { device: 'desktop' };
  queue = [];
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  return { queue: () => queue };
}
