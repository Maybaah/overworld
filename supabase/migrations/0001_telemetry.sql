create schema if not exists overworld_private;
revoke all on schema overworld_private from public;

create table if not exists public.event_sessions (
  sid           text primary key,
  first_at      timestamptz not null default now(),
  last_at       timestamptz not null default now(),
  device        text,
  country       text,
  ref_host      text,
  utm           text,
  entry         text,
  app_version   text,
  types         text[] not null default '{}',
  n             int not null default 0,
  rolled        boolean not null default false
);

create table if not exists public.events (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  sid           text not null,
  type          text not null,
  props         jsonb not null default '{}'::jsonb
);

create table if not exists public.event_hours (
  hour          timestamptz not null,
  type          text not null,
  dim           text not null default '',
  val           text not null default '',
  n             bigint not null default 0,
  primary key (hour, type, dim, val)
);

create table if not exists overworld_private.state (
  id             smallint primary key check (id = 1),
  rolled_through timestamptz not null,
  maint_at       timestamptz not null
);
insert into overworld_private.state (id, rolled_through, maint_at)
values (1, date_trunc('hour', now()), '-infinity')
on conflict (id) do nothing;

create table if not exists overworld_private.admins (
  email text primary key check (email = lower(email))
);

create index if not exists events_created_at_idx     on public.events (created_at);
create index if not exists events_sid_created_at_idx on public.events (sid, created_at);
create index if not exists event_sessions_open_idx   on public.event_sessions (last_at) where not rolled;
create index if not exists event_sessions_last_idx   on public.event_sessions (last_at);

alter table public.event_sessions        enable row level security;
alter table public.events                enable row level security;
alter table public.event_hours           enable row level security;
alter table overworld_private.state      enable row level security;
alter table overworld_private.admins     enable row level security;

revoke all on table public.event_sessions, public.events, public.event_hours from public, anon, authenticated;
revoke all on table overworld_private.state, overworld_private.admins from public, anon, authenticated;
revoke all on sequence public.events_id_seq from public, anon, authenticated;

create or replace function overworld_private.clean_text(s text, max_len int)
returns text
language sql immutable
set search_path = public
as $$
  select nullif(left(btrim(regexp_replace(s, '[[:cntrl:][:space:]]+', ' ', 'g')), max_len), '')
$$;

create or replace function overworld_private.jint(j jsonb, k text, lo bigint, hi bigint)
returns bigint
language sql immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(j -> k) = 'number' and (j ->> k)::numeric between lo and hi
    then trunc((j ->> k)::numeric)::bigint
  end
$$;

create or replace function overworld_private.jenum(j jsonb, k text, allowed text[])
returns text
language sql immutable
set search_path = public
as $$
  select case when jsonb_typeof(j -> k) = 'string' and (j ->> k) = any(allowed) then j ->> k end
$$;

create or replace function overworld_private.jmatch(j jsonb, k text, re text, max_len int)
returns text
language sql immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(j -> k) = 'string' and char_length(j ->> k) <= max_len and (j ->> k) ~ re
    then j ->> k
  end
$$;

create or replace function overworld_private.clean_msg(s text)
returns text
language sql immutable
set search_path = public
as $$
  select overworld_private.clean_text(
    regexp_replace(regexp_replace(left(s, 400), '[a-z][a-z0-9+.-]*://\S+', '[url]', 'gi'), '-?\d+\.\d+', '#', 'g'),
    200)
$$;

create or replace function overworld_private.ready_bucket(ms bigint)
returns text
language sql immutable
set search_path = public
as $$
  select case
    when ms is null then null
    when ms < 2000 then '0-2 s'
    when ms < 4000 then '2-4 s'
    when ms < 8000 then '4-8 s'
    when ms < 16000 then '8-16 s'
    else '16 s+'
  end
$$;

create or replace function overworld_private.event_props(p_type text, p jsonb)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then p := '{}'::jsonb; end if;
  case p_type
    when 'game_open', 'search' then
      v := jsonb_build_object(
        'game',  overworld_private.jint(p, 'game', 1, 2147483647),
        'title', overworld_private.clean_text(p ->> 'title', 120));
      if v ->> 'game' is null then return null; end if;
    when 'place_open' then
      v := jsonb_build_object(
        'level', overworld_private.jenum(p, 'level', array['country', 'city', 'company']),
        'label', overworld_private.clean_text(p ->> 'label', 120));
      if v ->> 'level' is null then return null; end if;
    when 'mode' then
      v := jsonb_build_object('mode', overworld_private.jenum(p, 'mode', array['explore', 'guess', 'myglobe', 'insights']));
      if v ->> 'mode' is null then return null; end if;
    when 'year_play' then
      v := jsonb_build_object('year', overworld_private.jint(p, 'year', 1900, 2200));
    when 'share' then
      v := jsonb_build_object(
        'action', overworld_private.jenum(p, 'action', array['copy_link', 'download', 'native']),
        'kind',   overworld_private.jenum(p, 'kind', array['game', 'myglobe', 'guess']));
      if v ->> 'action' is null then return null; end if;
    when 'myglobe' then
      v := jsonb_build_object(
        'result', overworld_private.jenum(p, 'result', array[
          'ok', 'sample', 'invalid_profile', 'profile_not_found', 'private_profile', 'steam_unavailable',
          'rate_limited', 'not_configured', 'network', 'data_unavailable']),
        'games',  overworld_private.jint(p, 'games', 0, 1000000));
      if v ->> 'result' is null then return null; end if;
    when 'insights_tab' then
      v := jsonb_build_object('tab', overworld_private.jmatch(p, 'tab', '^[a-z-]{1,30}$', 30));
      if v ->> 'tab' is null then return null; end if;
    when 'ready' then
      v := jsonb_build_object('ms', overworld_private.jint(p, 'ms', 0, 600000));
      if v ->> 'ms' is null then return null; end if;
    when 'error' then
      v := jsonb_build_object(
        'where', overworld_private.jenum(p, 'where', array['window', 'promise']),
        'msg',   overworld_private.clean_msg(p ->> 'msg'));
      if v ->> 'msg' is null then return null; end if;
    else
      return null;
  end case;
  return jsonb_strip_nulls(v);
end
$$;

create or replace function overworld_private.event_agg(p_from timestamptz, p_to timestamptz)
returns table (hour timestamptz, type text, dim text, val text, n bigint)
language sql stable
set search_path = public
as $$
  with e as (
    select date_trunc('hour', ev.created_at) as hour, ev.type, ev.props
    from public.events ev
    where ev.created_at >= p_from and ev.created_at < p_to
  )
  select e.hour, e.type, '', '', count(*) from e group by 1, 2
  union all
  select e.hour, e.type, 'title', e.props ->> 'title', count(*)
    from e where e.type in ('game_open', 'search') and e.props ? 'title' group by 1, 2, 4
  union all
  select e.hour, 'place_open', e.props ->> 'level', e.props ->> 'label', count(*)
    from e where e.type = 'place_open' and e.props ? 'label' group by 1, 3, 4
  union all
  select e.hour, 'mode', 'mode', e.props ->> 'mode', count(*) from e where e.type = 'mode' group by 1, 4
  union all
  select e.hour, 'share', 'action', e.props ->> 'action', count(*) from e where e.type = 'share' group by 1, 4
  union all
  select e.hour, 'share', 'kind', e.props ->> 'kind', count(*)
    from e where e.type = 'share' and e.props ? 'kind' group by 1, 4
  union all
  select e.hour, 'myglobe', 'result', e.props ->> 'result', count(*) from e where e.type = 'myglobe' group by 1, 4
  union all
  select e.hour, 'insights_tab', 'tab', e.props ->> 'tab', count(*) from e where e.type = 'insights_tab' group by 1, 4
  union all
  select e.hour, 'ready', 'bucket', overworld_private.ready_bucket((e.props ->> 'ms')::bigint), count(*)
    from e where e.type = 'ready' group by 1, 4
$$;

create or replace function overworld_private.session_agg(p_sids text[])
returns table (hour timestamptz, type text, dim text, val text, n bigint)
language sql stable
set search_path = public
as $$
  with s as (
    select date_trunc('hour', es.first_at) as hour, es.*
    from public.event_sessions es
    where es.sid = any(p_sids)
  )
  select s.hour, 'session', '', '', count(*) from s group by 1
  union all
  select s.hour, 'session', 'device', s.device, count(*) from s where s.device is not null group by 1, 4
  union all
  select s.hour, 'session', 'country', s.country, count(*) from s where s.country is not null group by 1, 4
  union all
  select s.hour, 'session', 'ref', s.ref_host, count(*) from s where s.ref_host is not null group by 1, 4
  union all
  select s.hour, 'session', 'utm', s.utm, count(*) from s where s.utm is not null group by 1, 4
  union all
  select s.hour, 'session', 'entry', s.entry, count(*) from s where s.entry is not null group by 1, 4
  union all
  select s.hour, 'reach', 'type', t, count(*) from s, unnest(s.types) as t group by 1, 4
$$;

create or replace function overworld_private.maintain()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_through timestamptz;
  v_to      timestamptz := date_trunc('hour', now() - interval '15 minutes');
  v_sids    text[];
begin
  if not pg_try_advisory_xact_lock(hashtext('overworld.events.maintain')) then return; end if;
  select rolled_through into v_through from overworld_private.state where id = 1 for update;

  if v_to > v_through then
    insert into public.event_hours (hour, type, dim, val, n)
    select a.hour, a.type, a.dim, a.val, a.n from overworld_private.event_agg(v_through, v_to) a
    on conflict (hour, type, dim, val) do update set n = public.event_hours.n + excluded.n;
    v_through := v_to;
  end if;

  with done as (
    update public.event_sessions set rolled = true
    where not rolled and last_at < now() - interval '30 minutes'
    returning sid
  )
  select coalesce(array_agg(sid), '{}') into v_sids from done;

  if cardinality(v_sids) > 0 then
    insert into public.event_hours (hour, type, dim, val, n)
    select a.hour, a.type, a.dim, a.val, a.n from overworld_private.session_agg(v_sids) a
    on conflict (hour, type, dim, val) do update set n = public.event_hours.n + excluded.n;
  end if;

  delete from public.events where created_at < least(v_through, now() - interval '48 hours');
  delete from public.event_sessions where rolled and last_at < now() - interval '48 hours';
  update overworld_private.state set rolled_through = v_through, maint_at = now() where id = 1;
end
$$;

create or replace function public.log_events(batch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid    text;
  v_ctx    jsonb;
  v_events jsonb;
  v_count  int;
  v_ses    public.event_sessions;
  v_known  boolean;
  v_room   int;
  v_added  int := 0;
  v_types  text[] := '{}';
  ev       jsonb;
  v_type   text;
  v_props  jsonb;
  v_dt     bigint;
begin
  if batch is null or jsonb_typeof(batch) <> 'object' or octet_length(batch::text) > 16384 then
    raise exception 'invalid batch' using errcode = '22023';
  end if;
  v_sid := batch ->> 'sid';
  if jsonb_typeof(batch -> 'sid') <> 'string' or v_sid !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'invalid session' using errcode = '22023';
  end if;
  v_events := batch -> 'events';
  if jsonb_typeof(v_events) <> 'array' then raise exception 'invalid events' using errcode = '22023'; end if;
  v_count := jsonb_array_length(v_events);
  if v_count = 0 then return; end if;
  if v_count > 50 then raise exception 'too many events' using errcode = '22023'; end if;
  v_ctx := case when jsonb_typeof(batch -> 'ctx') = 'object' then batch -> 'ctx' else '{}'::jsonb end;

  select * into v_ses from public.event_sessions where sid = v_sid;
  v_known := found;
  if v_known and v_ses.n >= 2000 then return; end if;
  v_room := 120 - (select count(*) from public.events where sid = v_sid and created_at > now() - interval '1 minute')::int;
  if v_room <= 0 then return; end if;
  if (select count(*) from public.events where created_at > now() - interval '1 minute') >= 20000 then return; end if;

  if not v_known then
    insert into public.event_sessions (sid, device, country, ref_host, utm, entry, app_version)
    values (
      v_sid,
      overworld_private.jenum(v_ctx, 'device', array['phone', 'tablet', 'desktop']),
      overworld_private.jmatch(v_ctx, 'country', '^[a-z]{2}$', 2),
      lower(overworld_private.jmatch(v_ctx, 'ref', '^[A-Za-z0-9.-]{1,100}$', 100)),
      nullif(concat_ws(' / ',
        overworld_private.clean_text(v_ctx ->> 'utm_source', 40),
        overworld_private.clean_text(v_ctx ->> 'utm_medium', 40),
        overworld_private.clean_text(v_ctx ->> 'utm_campaign', 60)), ''),
      overworld_private.jenum(v_ctx, 'entry', array['landing', 'game', 'place', 'mode', 'share']),
      overworld_private.jmatch(v_ctx, 'v', '^[A-Za-z0-9._-]{1,24}$', 24))
    on conflict (sid) do nothing;
  end if;

  for ev in select value from jsonb_array_elements(v_events) loop
    exit when v_added >= v_room;
    continue when jsonb_typeof(ev) <> 'object' or jsonb_typeof(ev -> 'type') <> 'string';
    v_type := ev ->> 'type';
    v_props := overworld_private.event_props(v_type, ev -> 'p');
    continue when v_props is null;
    v_dt := coalesce(overworld_private.jint(ev, 'dt', 0, 600000), 0);
    insert into public.events (created_at, sid, type, props)
    values (now() - make_interval(secs => v_dt / 1000.0), v_sid, v_type, v_props);
    v_added := v_added + 1;
    if not v_type = any(v_types) then v_types := v_types || v_type; end if;
  end loop;

  update public.event_sessions
  set last_at = now(),
      n = n + v_added,
      types = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(types || v_types) t)
  where sid = v_sid;

  if (select maint_at from overworld_private.state where id = 1) < now() - interval '10 minutes' then
    perform overworld_private.maintain();
  end if;
end
$$;

create or replace function overworld_private.is_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.role() = 'authenticated'
    and exists (select 1 from overworld_private.admins a where a.email = lower(auth.jwt() ->> 'email')),
    false)
$$;

create or replace function public.admin_stats(p_range text default '7d')
returns jsonb
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
declare
  v_now     timestamptz := now();
  v_hour    timestamptz := date_trunc('hour', now());
  v_from    timestamptz;
  v_hourly  boolean;
  v_through timestamptz;
  v_maint   timestamptz;
  v_open    text[];
  v_out     jsonb;
begin
  if not overworld_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_range is null or p_range not in ('24h', '7d', '30d', 'all') then p_range := '7d'; end if;
  perform overworld_private.maintain();
  select rolled_through, maint_at into v_through, v_maint from overworld_private.state where id = 1;

  v_from := case p_range
    when '24h' then v_hour - interval '23 hours'
    when '7d'  then date_trunc('day', v_now) - interval '6 days'
    when '30d' then date_trunc('day', v_now) - interval '29 days'
    else coalesce(
      (select min(h.hour) from public.event_hours h),
      (select min(s.first_at) from public.event_sessions s),
      v_hour)
  end;
  if p_range = 'all' then v_from := date_trunc('day', v_from); end if;
  v_hourly := p_range in ('24h', '7d');

  select coalesce(array_agg(sid), '{}') into v_open
  from public.event_sessions where not rolled and first_at >= v_from;

  create temp table if not exists _agg (hour timestamptz, type text, dim text, val text, n bigint) on commit drop;
  truncate _agg;
  insert into _agg select h.hour, h.type, h.dim, h.val, h.n from public.event_hours h where h.hour >= v_from;
  insert into _agg select * from overworld_private.event_agg(greatest(v_through, v_from), v_now + interval '1 minute');
  insert into _agg select * from overworld_private.session_agg(v_open);

  with
  tot as (select type, sum(n)::bigint n from _agg where dim = '' group by type),
  top as (
    select type, dim, val, sum(n)::bigint n,
           row_number() over (partition by type, dim order by sum(n) desc, val) rk
    from _agg where dim <> '' and val is not null group by type, dim, val
  ),
  buckets as (
    select b from generate_series(
      case when v_hourly then v_from else date_trunc('day', v_from) end,
      case when v_hourly then v_hour else date_trunc('day', v_now) end,
      case when v_hourly then interval '1 hour' else interval '1 day' end) b
  ),
  per as (
    select case when v_hourly then hour else date_trunc('day', hour) end b,
           sum(n) filter (where type = 'session') se,
           sum(n) filter (where type = 'game_open') go,
           sum(n) filter (where type = 'search') sr,
           sum(n) filter (where type = 'share') sh,
           sum(n) filter (where type = 'myglobe') mg
    from _agg where dim = '' group by 1
  ),
  series as (
    select k.b, coalesce(p.se, 0) se, coalesce(p.go, 0) go, coalesce(p.sr, 0) sr, coalesce(p.sh, 0) sh, coalesce(p.mg, 0) mg
    from buckets k left join per p on p.b = k.b
  )
  select jsonb_build_object(
    'range', p_range,
    'generatedAt', (extract(epoch from v_now) * 1000)::bigint,
    'from', (extract(epoch from v_from) * 1000)::bigint,
    'bucket', case when v_hourly then 'hour' else 'day' end,
    'totals', coalesce((select jsonb_object_agg(type, n) from tot), '{}'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_array((extract(epoch from b) * 1000)::bigint, se, go, sr, sh, mg) order by b)
      from series), '[]'::jsonb),
    'top', coalesce((
      select jsonb_object_agg(k, rows) from (
        select type || '.' || dim k, jsonb_agg(jsonb_build_array(val, n) order by rk) rows
        from top where rk <= 20 group by type, dim
      ) t), '{}'::jsonb),
    'recentErrors', coalesce((
      select jsonb_agg(jsonb_build_object(
               't', (extract(epoch from r.created_at) * 1000)::bigint,
               'where', r.props ->> 'where',
               'msg', r.props ->> 'msg') order by r.created_at desc)
      from (
        select * from public.events
        where type = 'error' and created_at >= v_from
        order by created_at desc limit 30
      ) r), '[]'::jsonb),
    'rolledThrough', (extract(epoch from v_through) * 1000)::bigint,
    'maintAt', case when v_maint = '-infinity' then null else (extract(epoch from v_maint) * 1000)::bigint end
  ) into v_out;
  return v_out;
end
$$;

revoke all on all functions in schema overworld_private from public, anon, authenticated;
revoke all on function public.log_events(jsonb) from public, anon, authenticated;
revoke all on function public.admin_stats(text) from public, anon, authenticated;
grant execute on function public.log_events(jsonb) to anon, authenticated;
grant execute on function public.admin_stats(text) to authenticated;
