revoke all on function public.log_events(jsonb) from public, anon, authenticated;
grant execute on function public.log_events(jsonb) to service_role;
