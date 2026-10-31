-- Cola de push: reclamar lotes de forma segura con varios workers concurrentes
create or replace function public.claim_notifications(p_limit int default 500)
returns table (id bigint, user_id uuid, title text, body text, data jsonb, kind text)
language sql security definer set search_path = public as $$
  update notifications n
     set attempts = n.attempts + 1, sent_at = now()
   where n.id in (
     select x.id from notifications x
      where x.sent_at is null and x.attempts < 5 and x.created_at > now() - interval '6 hours'
      order by x.id
      limit p_limit
      for update skip locked)
  returning n.id, n.user_id, n.title, n.body, n.data, n.kind;
$$;

create or replace function public.release_notifications(p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  update notifications set sent_at = null where id = any (p_ids);
$$;

revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.release_notifications(bigint[]) from public, anon, authenticated;

-- Insignia (badge) del ícono: notificaciones sin leer
create or replace function public.unread_count(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = p_user and read_at is null;
$$;
revoke execute on function public.unread_count(uuid) from public, anon, authenticated;

-- Competencias en ventana en vivo (para sync-live)
create or replace function public.live_window()
returns table (league_id text, starts_at timestamptz, event_external_id text)
language sql stable security definer set search_path = public as $$
  select c.league_id, c.starts_at, e.external_id
  from competitions c join events e on e.id = c.event_id
  where e.source = 'espn'
    and (c.status in ('live', 'delayed')
         or (c.status = 'scheduled' and c.starts_at between now() - interval '3 hours' and now() + interval '20 minutes'));
$$;
revoke execute on function public.live_window() from public, anon, authenticated;
