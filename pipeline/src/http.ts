export interface HttpOptions {
  minIntervalMs: number;
  maxConcurrent: number;
  userAgent?: string;
  retries?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface Http {
  request(url: string, init?: RequestInit): Promise<Response>;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url.split(/[?#]/)[0] ?? '';
  }
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

export function createHttp(options: HttpOptions): Http {
  const { minIntervalMs, maxConcurrent, userAgent, retries = 5, timeoutMs = 60_000 } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  let active = 0;
  const waiters: Array<() => void> = [];
  let lastSlot = -Infinity;

  async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  }

  function release(): void {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }

  async function attemptOnce(url: string, init: RequestInit | undefined): Promise<Response> {
    await acquire();
    try {
      const now = Date.now();
      const slot = Math.max(now, lastSlot + minIntervalMs);
      lastSlot = slot;
      if (slot > now) await sleep(slot - now);

      const headers = new Headers(init?.headers);
      if (userAgent && !headers.has('user-agent')) headers.set('user-agent', userAgent);
      const controller = new AbortController();
      const signal = init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { ...init, headers, signal });
        const body = await res.arrayBuffer();
        return new Response(NULL_BODY_STATUSES.has(res.status) ? null : body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      } finally {
        clearTimeout(timer);
      }
    } finally {
      release();
    }
  }

  async function request(url: string, init?: RequestInit): Promise<Response> {
    const safeUrl = redactUrl(url);
    for (let attempt = 0; ; attempt++) {
      let failure: string;
      let retryAfterMs: number | null = null;
      let cause: unknown;
      try {
        const res = await attemptOnce(url, init);
        if (!isRetryableStatus(res.status)) return res;
        retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        const body = (await res.text()).slice(0, 300);
        failure = `HTTP ${res.status} ${body}`;
      } catch (err) {
        cause = err;
        failure = `network error: ${err instanceof Error ? err.message : String(err)}`;
      }

      if (attempt >= retries) {
        throw new Error(`Request to ${safeUrl} failed after ${attempt + 1} attempts: ${failure}`, { cause });
      }

      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
      const jittered = backoff / 2 + (Math.random() * backoff) / 2;
      await sleep(retryAfterMs ?? jittered);
    }
  }

  return { request };
}
