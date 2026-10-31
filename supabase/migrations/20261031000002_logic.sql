-- =====================================================================
--  Lógica de negocio en la base de datos:
--   · helpers de seguridad
--   · bloqueo de picks al iniciar el juego
--   · calificación automática de picks
--   · cola de notificaciones (push) disparada por cambios en vivo
--   · RPCs para grupos, comparativos y tendencias
-- =====================================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger teams_touch before update on public.teams for each row execute function public.touch_updated_at();
create trigger athletes_touch before update on public.athletes for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger competitions_touch before update on public.competitions for each row execute function public.touch_updated_at();
create trigger competitors_touch before update on public.competitors for each row execute function public.touch_updated_at();
create trigger picks_touch before update on public.picks for each row execute function public.touch_updated_at();

create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function public.is_group_admin(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = p_group and user_id = auth.uid() and role in ('owner', 'admin'));
$$;

create or replace function public.competition_started(p_competition uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status <> 'scheduled' or starts_at <= now()
                   from competitions where id = p_competition), true);
$$;

-- Título legible de una competencia: "BUF vs BAL" o "Volkanovski vs Evloev"
create or replace function public.competition_title(p_competition uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(coalesce(t.abbreviation, a.short_name, a.display_name, t.display_name), ' vs '
                             order by case c.home_away when 'away' then 0 when 'home' then 1 else 2 end, c.order_index), '')
  from competitors c
  left join teams t on t.id = c.team_id
  left join athletes a on a.id = c.athlete_id
  where c.competition_id = p_competition
    and (select count(*) from competitors x where x.competition_id = p_competition) <= 2;
$$;

create or replace function public.competition_scoreline(p_competition uuid) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(coalesce(t.abbreviation, a.short_name, a.display_name) || ' ' || coalesce(trim_scale(c.score)::text, '-'), ' · '
                    order by case c.home_away when 'away' then 0 when 'home' then 1 else 2 end, c.order_index)
  from competitors c
  left join teams t on t.id = c.team_id
  left join athletes a on a.id = c.athlete_id
  where c.competition_id = p_competition;
$$;

-- ---------------------------------------------------------------------
-- Perfiles: creación automática al registrarse
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user'), '[^a-zA-Z0-9_]', '', 'g');
begin
  if char_length(base) < 3 then base := base || 'fan'; end if;
  insert into profiles (id, username, display_name, avatar_url)
  values (new.id,
          left(base, 18) || '_' || substr(md5(new.id::text), 1, 4),
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Grupos: el creador entra como owner
-- ---------------------------------------------------------------------
create or replace function public.handle_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger on_group_created after insert on public.groups
for each row execute function public.handle_new_group();

create or replace function public.join_group(p_invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  g groups;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into g from groups where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'Código de invitación inválido'; end if;

  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;

  -- avisa a los demás miembros
  insert into notifications (user_id, kind, title, body, data, dedupe_key)
  select m.user_id, 'group', g.name,
         coalesce((select display_name from profiles where id = auth.uid()), 'Alguien') || ' se unió al grupo 🙌',
         jsonb_build_object('route', '/group/' || g.id),
         'join:' || g.id || ':' || auth.uid()
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = g.id and m.user_id <> auth.uid() and p.notify_group
  on conflict do nothing;

  return g.id;
end $$;

-- ---------------------------------------------------------------------
-- Picks: validación y bloqueo
-- ---------------------------------------------------------------------
-- IMPORTANTE: security invoker, para que current_user refleje el rol real que escribe
-- (authenticated desde la app; postgres/service_role desde la calificación).
create or replace function public.validate_pick() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  comp competitions;
  g groups;
begin
  -- La calificación (security definer / service role) puede escribir libremente.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.user_id <> auth.uid() then raise exception 'Solo puedes hacer tus propios picks'; end if;

  select * into comp from competitions where id = new.competition_id;
  if not found then raise exception 'Competencia no encontrada'; end if;
  if comp.status <> 'scheduled' or comp.starts_at <= now() then
    raise exception 'El evento ya comenzó: los picks están cerrados 🔒';
  end if;

  select * into g from groups where id = new.group_id;
  if not exists (select 1 from group_members where group_id = new.group_id and user_id = auth.uid()) then
    raise exception 'No perteneces a este grupo';
  end if;
  if cardinality(g.leagues) > 0 and not (comp.league_id = any (g.leagues)) then
    raise exception 'Esta liga no está habilitada en el grupo';
  end if;

  if new.pick_type in ('winner', 'spread', 'method', 'podium') then
    if new.selection_competitor_id is null or not exists (
      select 1 from competitors where id = new.selection_competitor_id and competition_id = new.competition_id) then
      raise exception 'Selección inválida';
    end if;
  end if;
  if new.pick_type = 'total' and coalesce(new.selection_value, '') not in ('over', 'under') then
    raise exception 'Para totales elige over/under';
  end if;
  if new.pick_type in ('spread', 'total') and new.line is null then
    raise exception 'Este pick requiere una línea';
  end if;
  if new.pick_type = 'method' and coalesce(new.selection_value, '') not in ('KO/TKO', 'Submission', 'Decision') then
    raise exception 'Método inválido (KO/TKO, Submission, Decision)';
  end if;

  -- El usuario nunca fija su propio resultado
  new.status := 'pending';
  new.points := 0;
  new.graded_at := null;
  return new;
end $$;

create trigger picks_validate before insert or update on public.picks
for each row execute function public.validate_pick();

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
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
     or (p_kind = 'group' and not pr.notify_group) then
    return;
  end if;
  insert into notifications (user_id, kind, title, body, data, dedupe_key)
  values (p_user, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_dedupe)
  on conflict do nothing;
end $$;

-- Usuarios interesados en una competencia: tienen pick o siguen a un equipo/atleta participante
create or replace function public.competition_audience(p_competition uuid)
returns table (user_id uuid, has_pick boolean)
language sql stable security definer set search_path = public as $$
  select u.user_id, bool_or(u.has_pick)
  from (
    select p.user_id, true as has_pick from picks p where p.competition_id = p_competition
    union all
    select f.user_id, false from favorites f
    join competitors c on c.competition_id = p_competition and (c.team_id = f.team_id or c.athlete_id = f.athlete_id)
    join profiles pr on pr.id = f.user_id and pr.notify_favorites
  ) u
  group by u.user_id;
$$;

-- Envía la cola al Edge Function `send-push` inmediatamente (pg_net, asíncrono).
-- Requiere secretos en Vault: 'project_url' y 'cron_secret'. Si no existen, el cron lo envía.
create or replace function public.kick_push_sender() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
    if v_url is not null then
      perform net.http_post(
        url := v_url || '/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_secret, '')),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000);
    end if;
  exception when others then
    -- nunca romper la transacción por la notificación
    raise warning 'kick_push_sender: %', sqlerrm;
  end;
  return null;
end $$;

create trigger notifications_kick after insert on public.notifications
for each statement execute function public.kick_push_sender();

-- ---------------------------------------------------------------------
-- Calificación de picks
-- ---------------------------------------------------------------------
create or replace function public.american_to_profit(p_price int) returns numeric
language sql immutable as $$
  select case
    when p_price is null then 100.0 / 110
    when p_price > 0 then p_price / 100.0
    else 100.0 / abs(p_price)
  end;
$$;

create or replace function public.grade_competition(p_competition uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  comp competitions;
  pk record;
  sel competitors;
  opp competitors;
  total_score numeric;
  any_winner boolean;
  v_status pick_status;
  v_points numeric;
  v_scoring jsonb;
  v_base numeric;
  v_method text;
  n int := 0;
begin
  select * into comp from competitions where id = p_competition;
  if comp.status not in ('final', 'canceled', 'postponed') then return 0; end if;

  select bool_or(is_winner) into any_winner from competitors where competition_id = p_competition;
  select sum(score) into total_score from competitors where competition_id = p_competition;
  v_method := case
    when comp.result_method ilike '%ko%' then 'KO/TKO'
    when comp.result_method ilike '%sub%' then 'Submission'
    when comp.result_method ilike '%dec%' then 'Decision'
    else null end;

  for pk in
    select p.*, g.scoring from picks p join groups g on g.id = p.group_id
    where p.competition_id = p_competition and p.status = 'pending'
  loop
    v_status := 'void';
    sel := null; opp := null;
    if pk.selection_competitor_id is not null then
      select * into sel from competitors where id = pk.selection_competitor_id;
      select * into opp from competitors where competition_id = p_competition and id <> sel.id
        order by order_index limit 1;
    end if;

    if comp.status = 'canceled' then
      v_status := 'void';
    elsif comp.status = 'postponed' then
      continue;  -- se califica cuando se juegue
    elsif pk.pick_type = 'winner' then
      if coalesce(any_winner, false) then
        v_status := case when sel.is_winner then 'won' else 'lost' end;
      elsif sel.score is not null and opp.score is not null then
        v_status := case when sel.score > opp.score then 'won'
                         when sel.score < opp.score then 'lost' else 'push' end;
      else
        v_status := 'push';  -- empate / sin decisión
      end if;
    elsif pk.pick_type = 'spread' then
      if sel.score is null or opp.score is null then v_status := 'void';
      else
        v_status := case when sel.score + pk.line > opp.score then 'won'
                         when sel.score + pk.line < opp.score then 'lost' else 'push' end;
      end if;
    elsif pk.pick_type = 'total' then
      if total_score is null then v_status := 'void';
      elsif total_score = pk.line then v_status := 'push';
      elsif (pk.selection_value = 'over') = (total_score > pk.line) then v_status := 'won';
      else v_status := 'lost';
      end if;
    elsif pk.pick_type = 'method' then
      if not coalesce(sel.is_winner, false) then
        v_status := case when coalesce(any_winner, false) then 'lost' else 'push' end;
      elsif v_method is null then v_status := 'void';
      else v_status := case when v_method = pk.selection_value then 'won' else 'lost' end;
      end if;
    elsif pk.pick_type = 'podium' then
      v_status := case when sel.order_index between 1 and 3 then 'won' else 'lost' end;
    end if;

    v_scoring := pk.scoring;
    if v_scoring->>'mode' = 'units' then
      v_points := case v_status
        when 'won' then round(american_to_profit(pk.odds_price) * coalesce(pk.confidence, 1), 2)
        when 'lost' then -1 * coalesce(pk.confidence, 1)
        else 0 end;
    else
      v_base := coalesce((v_scoring->>(pk.pick_type::text))::numeric, 1);
      v_points := case when v_status = 'won' then
        v_base + case when coalesce((v_scoring->>'underdog_bonus')::boolean, false) and pk.odds_price > 100
                      then round((pk.odds_price - 100) / 100.0, 1) else 0 end
        else 0 end;
    end if;

    update picks set status = v_status, points = v_points, graded_at = now() where id = pk.id;
    n := n + 1;

    perform enqueue_notification(
      pk.user_id, 'pick_result',
      case v_status when 'won' then '✅ ¡Pick ganador!' when 'lost' then '❌ Pick perdido'
                    when 'push' then '➖ Pick empatado (push)' else '⚪ Pick anulado' end,
      competition_scoreline(p_competition) ||
        case when v_status = 'won' then ' · +' || trim_scale(v_points)::text || ' pts' else '' end,
      jsonb_build_object('route', '/event/' || comp.event_id, 'competitionId', p_competition, 'groupId', pk.group_id),
      'pick:' || pk.id);
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Trigger en vivo: inicio, cambio de líder, final
-- ---------------------------------------------------------------------
create or replace function public.on_competition_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  aud record;
  v_title text;
  v_route jsonb;
  v_kind sport_kind;
  v_leader text;
begin
  v_title := nullif(competition_title(new.id), '');
  if v_title is null then
    select name into v_title from events where id = new.event_id;
  end if;
  if new.label is not null and (select kind from leagues where id = new.league_id) = 'racing' then
    v_title := (select name from events where id = new.event_id) || ' · ' || new.label;
  end if;
  v_route := jsonb_build_object('route', '/event/' || new.event_id, 'competitionId', new.id);

  -- 1) Comenzó
  if new.status = 'live' and old.status is distinct from 'live' and old.status <> 'final' then
    for aud in select * from competition_audience(new.id) loop
      perform enqueue_notification(aud.user_id, 'game_start', '🔴 EN VIVO: ' || v_title,
        case when aud.has_pick then 'Tu pick está en juego. ¡Síguelo en vivo!' else 'Ya comenzó. Toca para ver el marcador.' end,
        v_route, 'start:' || new.id);
    end loop;
  end if;

  -- 2) Cambio de líder en momentos clave (último cuarto / últimas entradas)
  if new.status = 'live' and new.leader_competitor_id is not null
     and old.leader_competitor_id is not null
     and new.leader_competitor_id is distinct from old.leader_competitor_id then
    select kind into v_kind from leagues where id = new.league_id;
    if v_kind = 'team' and (
         (new.league_id in ('nfl', 'nba') and coalesce(new.period, 0) >= 4)
      or (new.league_id = 'mlb' and coalesce(new.period, 0) >= 7)) then
      select coalesce(t.display_name, a.display_name) into v_leader
      from competitors c left join teams t on t.id = c.team_id left join athletes a on a.id = c.athlete_id
      where c.id = new.leader_competitor_id;
      for aud in select * from competition_audience(new.id) where has_pick loop
        perform enqueue_notification(aud.user_id, 'lead_change', '⚡ Cambio de líder: ' || v_title,
          v_leader || ' toma la ventaja · ' || competition_scoreline(new.id) || ' (' || coalesce(new.status_detail, '') || ')',
          v_route, 'lead:' || new.id || ':' || new.leader_competitor_id || ':' || coalesce(new.status_detail, ''));
      end loop;
    end if;
  end if;

  -- 3) Final → calificar picks y notificar
  if new.status in ('final', 'canceled') and old.status is distinct from new.status then
    for aud in select * from competition_audience(new.id) where not has_pick loop
      perform enqueue_notification(aud.user_id, 'final', '🏁 Final: ' || v_title,
        coalesce(competition_scoreline(new.id), '') ||
          case when new.result_method is not null then ' · ' || new.result_method ||
            coalesce(' R' || new.result_round, '') else '' end,
        v_route, 'final:' || new.id);
    end loop;
    perform grade_competition(new.id);
  end if;

  return null;
end $$;

create trigger competitions_live_change after update of status, leader_competitor_id on public.competitions
for each row execute function public.on_competition_change();

-- Recalifica si llega tarde el ganador/método (ej. resultado de pelea anunciado después del "final")
create or replace function public.on_late_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'final' and (old.result_method is distinct from new.result_method) then
    perform grade_competition(new.id);
  end if;
  return null;
end $$;

create trigger competitions_late_result after update of result_method on public.competitions
for each row execute function public.on_late_result();

-- Estado del evento padre = agregado de sus competencias
create or replace function public.rollup_event_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status game_status;
begin
  select case
    when bool_or(status = 'live') then 'live'
    when bool_and(status = 'canceled') then 'canceled'
    when bool_and(status in ('final', 'canceled')) then 'final'
    when bool_and(status = 'postponed') then 'postponed'
    when bool_or(status = 'final') then 'live'
    else 'scheduled' end::game_status
  into v_status
  from competitions where event_id = new.event_id;
  update events set status = v_status where id = new.event_id and status is distinct from v_status;
  return null;
end $$;

create trigger competitions_rollup after insert or update of status on public.competitions
for each row execute function public.rollup_event_status();

-- ---------------------------------------------------------------------
-- Historial de momios (tendencias de líneas)
-- ---------------------------------------------------------------------
create or replace function public.track_odds_history() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.price is distinct from old.price or new.point is distinct from old.point then
    insert into odds_history (competition_id, bookmaker, market, outcome, price, point)
    values (new.competition_id, new.bookmaker, new.market, new.outcome, new.price, new.point);
  end if;
  return null;
end $$;

create trigger odds_history_trg after insert or update on public.odds
for each row execute function public.track_odds_history();

-- ---------------------------------------------------------------------
-- Vistas / RPCs para la app (gráficos, tendencias y comparativos)
-- ---------------------------------------------------------------------
create or replace view public.group_leaderboard with (security_invoker = on) as
select
  m.group_id,
  m.user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  count(p.id) filter (where p.status = 'won')     as wins,
  count(p.id) filter (where p.status = 'lost')    as losses,
  count(p.id) filter (where p.status = 'push')    as pushes,
  count(p.id) filter (where p.status = 'pending') as pending,
  coalesce(sum(p.points), 0)                      as points,
  round(100.0 * count(p.id) filter (where p.status = 'won')
        / nullif(count(p.id) filter (where p.status in ('won', 'lost')), 0), 1) as win_pct,
  rank() over (partition by m.group_id order by coalesce(sum(p.points), 0) desc) as rank
from group_members m
join profiles pr on pr.id = m.user_id
left join picks p on p.group_id = m.group_id and p.user_id = m.user_id
group by m.group_id, m.user_id, pr.username, pr.display_name, pr.avatar_url;

-- Puntos acumulados por día (gráfico de carrera del grupo). Día local UTC-7.
create or replace function public.group_points_timeline(p_group uuid, p_days int default 30)
returns table (user_id uuid, display_name text, day date, points numeric, cumulative numeric)
language sql stable security invoker set search_path = public as $$
  with daily as (
    select p.user_id, ((p.graded_at at time zone 'UTC') - interval '7 hours')::date as day, sum(p.points) as points
    from picks p
    where p.group_id = p_group and p.graded_at is not null
      and p.graded_at > now() - make_interval(days => p_days)
    group by 1, 2
  )
  select d.user_id, pr.display_name, d.day, d.points,
         sum(d.points) over (partition by d.user_id order by d.day) as cumulative
  from daily d join profiles pr on pr.id = d.user_id
  order by d.day, pr.display_name;
$$;

-- Racha y efectividad de un usuario (por liga) — para su perfil
create or replace function public.user_pick_stats(p_user uuid default auth.uid())
returns table (league_id text, wins bigint, losses bigint, pushes bigint, points numeric, win_pct numeric)
language sql stable security invoker set search_path = public as $$
  select c.league_id,
         count(*) filter (where p.status = 'won'),
         count(*) filter (where p.status = 'lost'),
         count(*) filter (where p.status = 'push'),
         coalesce(sum(p.points), 0),
         round(100.0 * count(*) filter (where p.status = 'won')
               / nullif(count(*) filter (where p.status in ('won', 'lost')), 0), 1)
  from picks p join competitions c on c.id = p.competition_id
  where p.user_id = p_user
  group by c.league_id;
$$;

-- Últimos N resultados de un equipo (forma / tendencia)
create or replace function public.team_form(p_team uuid, p_limit int default 10)
returns table (competition_id uuid, event_id uuid, starts_at timestamptz, opponent_id uuid, opponent_name text,
               opponent_logo text, home_away text, team_score numeric, opp_score numeric, result text)
language sql stable set search_path = public as $$
  select c.id, c.event_id, c.starts_at, ot.id, ot.display_name, ot.logo_url, me.home_away,
         me.score, opp.score,
         case when me.is_winner then 'W' when opp.is_winner then 'L'
              when me.score > opp.score then 'W' when me.score < opp.score then 'L' else 'T' end
  from competitors me
  join competitions c on c.id = me.competition_id and c.status = 'final'
  join competitors opp on opp.competition_id = c.id and opp.id <> me.id
  join teams ot on ot.id = opp.team_id
  where me.team_id = p_team
  order by c.starts_at desc
  limit p_limit;
$$;

-- Historial de peleas / carreras de un atleta
create or replace function public.athlete_history(p_athlete uuid, p_limit int default 30)
returns table (competition_id uuid, event_id uuid, event_name text, starts_at timestamptz, label text,
               opponent_id uuid, opponent_name text, opponent_headshot text, result text,
               result_method text, result_round int, result_time text, finish_position int, status game_status)
language sql stable set search_path = public as $$
  select c.id, e.id, e.name, c.starts_at, c.label,
         oa.id, oa.display_name, oa.headshot_url,
         case when c.status <> 'final' then null
              when me.is_winner then 'W' when opp.is_winner then 'L' else 'D' end,
         c.result_method, c.result_round, c.result_time,
         case when l.kind = 'racing' then me.order_index end,
         c.status
  from competitors me
  join competitions c on c.id = me.competition_id
  join events e on e.id = c.event_id
  join leagues l on l.id = c.league_id
  left join lateral (
    select * from competitors o where o.competition_id = c.id and o.id <> me.id and l.kind = 'combat' limit 1
  ) opp on true
  left join athletes oa on oa.id = opp.athlete_id
  where me.athlete_id = p_athlete
  order by c.starts_at desc
  limit p_limit;
$$;

-- Enfrentamientos directos (H2H) entre dos equipos o dos atletas
create or replace function public.head_to_head(p_a uuid, p_b uuid, p_limit int default 20)
returns table (competition_id uuid, event_id uuid, starts_at timestamptz, a_score numeric, b_score numeric,
               winner text, method text)
language sql stable set search_path = public as $$
  select c.id, c.event_id, c.starts_at, a.score, b.score,
         case when a.is_winner then 'a' when b.is_winner then 'b'
              when a.score > b.score then 'a' when b.score > a.score then 'b' else 'draw' end,
         c.result_method
  from competitors a
  join competitors b on b.competition_id = a.competition_id and b.id <> a.id
  join competitions c on c.id = a.competition_id
  where coalesce(a.team_id, a.athlete_id) = p_a and coalesce(b.team_id, b.athlete_id) = p_b
    and c.status = 'final'
  order by c.starts_at desc
  limit p_limit;
$$;

-- Consenso de picks del grupo para una competencia (cuántos van con cada lado)
create or replace function public.pick_consensus(p_competition uuid, p_group uuid default null)
returns table (pick_type pick_type, selection_competitor_id uuid, selection_value text, votes bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  select p.pick_type, p.selection_competitor_id, p.selection_value, count(*),
         round(100.0 * count(*) / sum(count(*)) over (partition by p.pick_type), 1)
  from picks p
  where p.competition_id = p_competition
    and (p_group is null or p.group_id = p_group)
    and (p_group is null or is_group_member(p_group))
  group by 1, 2, 3;
$$;
