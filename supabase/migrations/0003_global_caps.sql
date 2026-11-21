create index if not exists event_sessions_first_idx on public.event_sessions (first_at);

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
  if not v_known then
    if (select count(*) from public.event_sessions where first_at > now() - interval '1 minute') >= 300 then return; end if;
    if pg_database_size(current_database()) > 300 * 1024 * 1024 then return; end if;
  end if;
  if v_known and v_ses.n >= 2000 then return; end if;
  v_room := 120 - (select count(*) from public.events where sid = v_sid and created_at > now() - interval '1 minute')::int;
  if v_room <= 0 then return; end if;
  if (select count(*) from public.events where created_at > now() - interval '1 minute') >= 3000 then return; end if;

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

revoke all on function public.log_events(jsonb) from public, anon, authenticated;
grant execute on function public.log_events(jsonb) to service_role;
