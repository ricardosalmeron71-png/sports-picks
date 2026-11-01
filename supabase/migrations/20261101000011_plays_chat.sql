-- Notificaciones de jugadas clave (NFL) y de mensajes del chat

-- Preferencias nuevas
alter table public.profiles add column if not exists notify_plays boolean not null default true;
alter table public.profiles add column if not exists notify_chat  boolean not null default true;

-- ---------------------------------------------------------------------
-- Jugadas clave de un juego (touchdown, gol de campo, safety, 2 puntos, intercepción, fumble)
-- ---------------------------------------------------------------------
create table if not exists public.game_events (
  id             bigint generated always as identity primary key,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  external_id    text not null,
  kind           text not null check (kind in ('touchdown', 'field_goal', 'safety', 'two_point', 'interception', 'fumble')),
  team_id        uuid references public.teams(id) on delete set null,   -- equipo beneficiado
  description    text,
  period         int,
  clock          text,
  away_score     int,
  home_score     int,
  occurred_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (competition_id, external_id)
);
create index if not exists game_events_comp_idx on public.game_events(competition_id, occurred_at);
alter table public.game_events enable row level security;
create policy "jugadas lectura publica" on public.game_events for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.game_events;

-- enqueue_notification: ahora respeta también las preferencias de jugadas y chat
create or replace function public.enqueue_notification(
  p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb, p_dedupe text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  pr profiles;
begin
  select * into pr from profiles where id = p_user;
  if not found then return; end if;
  if (p_kind = 'game_start' and not pr.notify_game_start)
     or (p_kind = 'final' and not pr.notify_final)
     or (p_kind = 'lead_change' and not pr.notify_lead_change)
     or (p_kind = 'pick_result' and not pr.notify_pick_result)
     or (p_kind = 'group' and not pr.notify_group)
     or (p_kind = 'play' and not pr.notify_plays)
     or (p_kind = 'chat' and not pr.notify_chat) then
    return;
  end if;
  insert into notifications (user_id, kind, title, body, data, dedupe_key)
  values (p_user, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe)
  on conflict do nothing;
end $$;
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb, text) from public, anon, authenticated;

-- Aviso por cada jugada clave nueva (solo si ocurrió hace menos de 10 min: al "ponerse al día"
-- con un juego ya empezado no se manda una avalancha de jugadas viejas)
create or replace function public.on_game_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  comp competitions;
  ab text; away_ab text; home_ab text;
  v_title text; v_body text; v_q text; aud record;
begin
  if new.occurred_at is not null and new.occurred_at < now() - interval '10 minutes' then return null; end if;
  select * into comp from competitions where id = new.competition_id;
  select abbreviation into ab from teams where id = new.team_id;
  select max(t.abbreviation) filter (where c.home_away = 'away'), max(t.abbreviation) filter (where c.home_away = 'home')
    into away_ab, home_ab
  from competitors c join teams t on t.id = c.team_id where c.competition_id = new.competition_id;

  v_title := case new.kind
    when 'touchdown'    then '🏈 ¡TOUCHDOWN ' || coalesce(ab, '') || '!'
    when 'field_goal'   then '🦵 ¡Gol de campo ' || coalesce(ab, '') || '!'
    when 'safety'       then '🛡️ ¡Safety ' || coalesce(ab, '') || '!'
    when 'two_point'    then '✌️ Conversión de 2 puntos ' || coalesce(ab, '')
    when 'interception' then '🧤 ¡Intercepción de ' || coalesce(ab, '') || '!'
    when 'fumble'       then '💥 ¡Fumble! Recupera ' || coalesce(ab, '')
  end;
  v_q := case when new.period is null then '' when new.period > 4 then 'TE' else 'Q' || new.period end
         || coalesce(' ' || new.clock, '');
  v_body := coalesce(away_ab, '') || ' ' || coalesce(new.away_score::text, '-') || ' – ' || coalesce(home_ab, '') || ' '
            || coalesce(new.home_score::text, '-') || ' · ' || v_q || E'\n' || left(coalesce(new.description, ''), 110);

  for aud in select * from competition_audience(new.competition_id) loop
    perform enqueue_notification(aud.user_id, 'play', v_title, v_body,
      jsonb_build_object('route', '/event/' || comp.event_id, 'competitionId', comp.id),
      'play:' || new.competition_id || ':' || new.external_id);
  end loop;
  return null;
end $$;

drop trigger if exists game_events_notify on public.game_events;
create trigger game_events_notify after insert on public.game_events
for each row execute function public.on_game_event();

-- ---------------------------------------------------------------------
-- Mensajes del chat → notificación a los demás miembros del grupo
-- ---------------------------------------------------------------------
create or replace function public.notify_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g groups;
  sender text;
begin
  select * into g from groups where id = new.group_id;
  select coalesce(display_name, username, 'Alguien') into sender from profiles where id = new.user_id;
  insert into notifications (user_id, kind, title, body, data, dedupe_key)
  select m.user_id, 'chat', '💬 ' || g.name, coalesce(sender, 'Alguien') || ': ' || left(new.body, 120),
         jsonb_build_object('route', '/group/' || g.id, 'tag', 'chat-' || g.id),
         'chat:' || new.id
  from group_members m
  join profiles p on p.id = m.user_id
  where m.group_id = new.group_id
    and m.user_id is distinct from new.user_id
    and p.notify_chat
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists group_messages_notify on public.group_messages;
create trigger group_messages_notify after insert on public.group_messages
for each row execute function public.notify_chat_message();
