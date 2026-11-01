-- Web Push (iPhone/web) + notificación de prueba

-- Secretos de la aplicación (llaves VAPID). Sin políticas: solo service_role (Edge Functions) las lee.
create table if not exists public.app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Notificación de prueba para el usuario que la pide (botón en Perfil)
create or replace function public.send_test_notification() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Debes iniciar sesión'; end if;
  -- máximo 1 prueba cada 10 segundos por usuario
  if exists (select 1 from notifications where user_id = v_uid and kind = 'test' and created_at > now() - interval '10 seconds') then
    raise exception 'Espera unos segundos antes de pedir otra prueba';
  end if;
  insert into notifications (user_id, kind, title, body, data, dedupe_key)
  values (v_uid, 'test', '🔔 Prueba de notificación', 'Si ves esto, las notificaciones funcionan ✅',
          jsonb_build_object('route', '/notifications'), 'test:' || v_uid || ':' || extract(epoch from clock_timestamp()));
end $$;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;
