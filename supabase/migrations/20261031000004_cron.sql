-- =====================================================================
--  Programación de sincronizaciones (pg_cron + pg_net → Edge Functions)
--
--  Antes de aplicar en producción guarda dos secretos en Vault:
--    select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--    select vault.create_secret('<un-secreto-largo-aleatorio>', 'cron_secret');
--  y define el mismo CRON_SECRET en los secrets de las Edge Functions:
--    supabase secrets set CRON_SECRET=<el-mismo-secreto>
-- =====================================================================

create extension if not exists pg_cron;

create or replace function public.call_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null then
    raise warning 'Falta el secreto project_url en Vault';
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_secret, '')),
    body := p_body,
    timeout_milliseconds := 60000);
end $$;
revoke execute on function public.call_edge_function(text, jsonb) from public, anon, authenticated;

-- ¿Hay algo en vivo o por empezar? (evita gastar llamadas cuando no hay juegos)
create or replace function public.has_live_window() returns boolean
language sql stable as $$
  select exists (
    select 1 from competitions
    where status in ('live', 'delayed')
       or (status = 'scheduled' and starts_at between now() - interval '3 hours' and now() + interval '20 minutes')
  );
$$;

-- Marcadores en vivo: cada 20 segundos, solo si hay ventana activa
select cron.schedule('sync-live', '20 seconds',
  $$ select public.call_edge_function('sync-live') where public.has_live_window() $$);

-- Calendario: próximos 45 días y últimos 2, cada 3 horas
select cron.schedule('sync-schedule', '7 */3 * * *',
  $$ select public.call_edge_function('sync-schedule', '{"daysBack":2,"daysAhead":45}') $$);

-- Equipos, rosters (fotos), clasificaciones: diario 09:15 UTC (02:15 UTC-7)
select cron.schedule('sync-teams', '15 9 * * *',
  $$ select public.call_edge_function('sync-teams') $$);

-- Momios de casas de apuestas (The Odds API): cada 30 minutos
-- (la función omite ligas sin juegos en las próximas 36 h para cuidar la cuota)
select cron.schedule('sync-odds', '*/30 * * * *',
  $$ select public.call_edge_function('sync-odds') $$);

-- Box (TheSportsDB): cada 6 horas
select cron.schedule('sync-boxing', '23 */6 * * *',
  $$ select public.call_edge_function('sync-boxing') $$);

-- Red de seguridad de la cola push: cada minuto
select cron.schedule('send-push', '* * * * *',
  $$ select public.call_edge_function('send-push') where exists (select 1 from public.notifications where sent_at is null and attempts < 5) $$);

-- Limpieza: notificaciones > 60 días, historial de sync > 14 días
select cron.schedule('cleanup', '41 10 * * *', $$
  delete from public.notifications where created_at < now() - interval '60 days';
  delete from public.sync_runs where started_at < now() - interval '14 days';
$$);
