import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('./migrations/', import.meta.url));
const migrations = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(dir + f, 'utf8'));

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
`;

const SID = 'tab_aaaaaaaaaaaaaaaa';

let db: PGlite;

async function log(batch: unknown) {
  await db.query('select public.log_events($1::jsonb)', [JSON.stringify(batch)]);
}

async function as(role: string, email?: string) {
  await db.exec(`select set_config('test.role', '${role}', false), set_config('test.jwt', '${email ? JSON.stringify({ email }) : ''}', false)`);
}

async function stats(range = '7d'): Promise<Record<string, any>> {
  const r = await db.query<{ s: Record<string, any> }>('select public.admin_stats($1) as s', [range]);
  return r.rows[0]!.s;
}

async function rows<T>(sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const m of migrations) await db.exec(m);
  await db.exec(`insert into overworld_private.admins (email) values ('admin@example.com')`);
});

describe('log_events', () => {
  it('keeps only the allow-listed fields of known events', async () => {
    await log({
      sid: SID,
      ctx: { device: 'desktop', ref: 'News.Ycombinator.com', entry: 'game', v: 'abc123', utm_source: 'x', country: 'de', extra: 'no' },
      events: [
        { type: 'game_open', p: { game: 959, title: 'Half-Life', secret: 'drop me' } },
        { type: 'mode', p: { mode: 'insights' } },
        { type: 'mode', p: { mode: 'hacking' } },
        { type: 'unknown', p: {} },
        { type: 'share', p: { action: 'copy_link', kind: 'game' } },
        { type: 'error', p: { where: 'window', msg: 'failed at https://evil.example/x?lat=51.5 and 12.25' } },
      ],
    });
    const events = await rows<{ type: string; props: Record<string, unknown> }>('select type, props from public.events order by id');
    expect(events).toEqual([
      { type: 'game_open', props: { game: 959, title: 'Half-Life' } },
      { type: 'mode', props: { mode: 'insights' } },
      { type: 'share', props: { action: 'copy_link', kind: 'game' } },
      { type: 'error', props: { where: 'window', msg: 'failed at [url] and #' } },
    ]);
    const [session] = await rows<Record<string, unknown>>('select device, country, ref_host, utm, entry, app_version, n, types from public.event_sessions');
    expect(session).toEqual({
      device: 'desktop',
      country: 'de',
      ref_host: 'news.ycombinator.com',
      utm: 'x',
      entry: 'game',
      app_version: 'abc123',
      n: 4,
      types: ['error', 'game_open', 'mode', 'share'],
    });
  });

  it('rejects malformed batches', async () => {
    await expect(log({ sid: 'short', events: [{ type: 'mode', p: { mode: 'explore' } }] })).rejects.toThrow(/invalid session/);
    await expect(log({ sid: SID, events: 'nope' })).rejects.toThrow(/invalid events/);
    await expect(log({ sid: SID, events: Array.from({ length: 51 }, () => ({ type: 'ready', p: { ms: 1 } })) })).rejects.toThrow(/too many/);
  });

  it('can be called by the relay only, not with the public key', async () => {
    const batch = JSON.stringify({ sid: SID, events: [{ type: 'mode', p: { mode: 'explore' } }] });
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await expect(db.query('select public.log_events($1::jsonb)', [batch])).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query('select public.log_events($1::jsonb)', [batch]);
    await db.exec('reset role');
    const [{ n }] = await rows<{ n: number }>('select count(*)::int as n from public.events');
    expect(n).toBe(1);
  });

  it('caps a tab at 120 events a minute', async () => {
    const batch = { sid: SID, events: Array.from({ length: 50 }, () => ({ type: 'ready', p: { ms: 900 } })) };
    for (let i = 0; i < 3; i++) await log(batch);
    const [{ n }] = await rows<{ n: number }>('select count(*)::int as n from public.events');
    expect(n).toBe(120);
  });
});

describe('admin_stats', () => {
  it('refuses anyone who is not a listed admin', async () => {
    await as('anon');
    await expect(stats()).rejects.toThrow(/not allowed/);
    await as('authenticated', 'someone@example.com');
    await expect(stats()).rejects.toThrow(/not allowed/);
  });

  it('counts live events and open tabs', async () => {
    await log({ sid: SID, ctx: { device: 'phone' }, events: [{ type: 'game_open', p: { game: 1, title: 'Tetris' } }, { type: 'ready', p: { ms: 3100 } }] });
    await log({ sid: 'tab_bbbbbbbbbbbbbbbb', events: [{ type: 'game_open', p: { game: 1, title: 'Tetris' } }] });
    await as('authenticated', 'Admin@Example.com');
    const s = await stats('24h');
    expect(s.totals).toMatchObject({ session: 2, game_open: 2, ready: 1 });
    expect(s.top['game_open.title']).toEqual([['Tetris', 2]]);
    expect(s.top['session.device']).toEqual([['phone', 1]]);
    expect(s.top['ready.bucket']).toEqual([['2-4 s', 1]]);
    expect(s.top['reach.type']).toEqual([['game_open', 2], ['ready', 1]]);
    expect(s.series).toHaveLength(24);
    expect(s.bucket).toBe('hour');
  });

  it('rolls closed hours and idle tabs once, without counting them twice', async () => {
    await log({ sid: SID, ctx: { device: 'desktop' }, events: [{ type: 'search', p: { game: 7, title: 'Doom' } }, { type: 'search', p: { game: 7, title: 'Doom' } }] });
    await db.exec(`
      update public.events set created_at = date_trunc('hour', now()) - interval '3 hours';
      update public.event_sessions set first_at = date_trunc('hour', now()) - interval '3 hours', last_at = now() - interval '2 hours';
      update overworld_private.state set rolled_through = date_trunc('hour', now()) - interval '5 hours', maint_at = '-infinity';
    `);
    await as('authenticated', 'admin@example.com');
    const first = await stats('24h');
    const second = await stats('24h');
    expect(first.totals).toMatchObject({ session: 1, search: 2 });
    expect(second.totals).toEqual(first.totals);
    const hours = await rows<{ type: string; dim: string; n: number }>(`select type, dim, n::int as n from public.event_hours where dim in ('', 'title') order by type, dim`);
    expect(hours).toEqual([
      { type: 'search', dim: '', n: 2 },
      { type: 'search', dim: 'title', n: 2 },
      { type: 'session', dim: '', n: 1 },
    ]);
    const [{ rolled }] = await rows<{ rolled: boolean }>('select rolled from public.event_sessions');
    expect(rolled).toBe(true);
  });

  it('prunes raw events after 48 hours but keeps their counts', async () => {
    await log({ sid: SID, events: [{ type: 'mode', p: { mode: 'myglobe' } }] });
    await db.exec(`
      update public.events set created_at = now() - interval '3 days';
      update public.event_sessions set first_at = now() - interval '3 days', last_at = now() - interval '3 days';
      update overworld_private.state set rolled_through = date_trunc('hour', now()) - interval '4 days';
    `);
    await as('authenticated', 'admin@example.com');
    const s = await stats('7d');
    expect(s.totals).toMatchObject({ session: 1, mode: 1 });
    const [{ n }] = await rows<{ n: number }>('select (select count(*) from public.events) + (select count(*) from public.event_sessions) as n');
    expect(Number(n)).toBe(0);
    expect(s.bucket).toBe('hour');
    expect(s.series).toHaveLength(6 * 24 + new Date().getUTCHours() + 1);
  });
});
