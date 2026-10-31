-- =====================================================================
--  SPORTS PICKS · Esquema principal (PostgreSQL / Supabase)
--  Modelo unificado para deportes de equipo (NFL, NBA, MLB),
--  combate (UFC/MMA, Box) y carreras (F1).
--
--  events        = juego / cartelera (UFC) / Gran Premio (F1)
--  competitions  = el partido / cada pelea / cada sesión (FP1, Qual, Race)
--  competitors   = equipo o atleta dentro de una competition (con marcador)
--  Los picks se hacen sobre competitions.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;      -- búsqueda difusa de nombres

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type sport_kind as enum ('team', 'combat', 'racing');
create type game_status as enum ('scheduled', 'live', 'final', 'postponed', 'canceled', 'delayed');
create type pick_type as enum ('winner', 'spread', 'total', 'method', 'podium');
create type pick_status as enum ('pending', 'won', 'lost', 'push', 'void');
create type member_role as enum ('owner', 'admin', 'member');

-- ---------------------------------------------------------------------
-- Catálogo: ligas
-- ---------------------------------------------------------------------
create table public.leagues (
  id              text primary key,                -- 'nfl','nba','mlb','ufc','f1','boxing'
  name            text not null,
  short_name      text not null,
  kind            sport_kind not null,
  logo_url        text,
  color           text,                            -- hex sin '#'
  espn_sport      text,                            -- 'football'
  espn_league     text,                            -- 'nfl'
  odds_api_key    text,                            -- clave de The Odds API ('americanfootball_nfl')
  thesportsdb_id  text,                            -- para box
  sort_order      int not null default 0,
  active          boolean not null default true
);

create table public.venues (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'espn',
  external_id  text not null,
  name         text not null,
  city         text,
  state        text,
  country      text,
  indoor       boolean,
  capacity     int,
  image_url    text,
  unique (source, external_id)
);

-- ---------------------------------------------------------------------
-- Equipos y atletas
-- ---------------------------------------------------------------------
create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  league_id       text not null references public.leagues(id) on delete cascade,
  external_id     text not null,
  name            text not null,                   -- 'Packers'
  display_name    text not null,                   -- 'Green Bay Packers'
  abbreviation    text,
  location        text,
  logo_url        text,
  logo_dark_url   text,
  color           text,
  alt_color       text,
  venue_id        uuid references public.venues(id),
  conference      text,
  division        text,
  record_summary  text,                            -- '5-3'
  stats           jsonb not null default '{}'::jsonb,  -- clasificación (W/L, racha, local/visita)
  season_stats    jsonb not null default '{}'::jsonb,  -- estadísticas de temporada por categoría
  updated_at      timestamptz not null default now(),
  unique (league_id, external_id)
);
create index teams_league_idx on public.teams(league_id);
create index teams_name_trgm on public.teams using gin (display_name gin_trgm_ops);

create table public.athletes (
  id              uuid primary key default gen_random_uuid(),
  league_id       text not null references public.leagues(id) on delete cascade,
  external_id     text not null,
  team_id         uuid references public.teams(id) on delete set null,
  full_name       text not null,
  display_name    text not null,
  short_name      text,
  nickname        text,
  headshot_url    text,
  position        text,
  jersey          text,
  country         text,
  flag_url        text,
  weight_class    text,                            -- MMA / Box
  height          text,
  weight          text,
  reach           text,
  stance          text,
  age             int,
  birth_date      date,
  record_summary  text,                            -- MMA '7-4-0', F1 puntos
  stats           jsonb not null default '{}'::jsonb,  -- resumen normalizado
  gamelog         jsonb not null default '[]'::jsonb,  -- últimos juegos (para gráficos)
  active          boolean not null default true,
  updated_at      timestamptz not null default now(),
  unique (league_id, external_id)
);
create index athletes_team_idx on public.athletes(team_id);
create index athletes_league_idx on public.athletes(league_id);
create index athletes_name_trgm on public.athletes using gin (display_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Eventos / competencias / competidores
-- ---------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  league_id       text not null references public.leagues(id) on delete cascade,
  source          text not null default 'espn',
  external_id     text not null,
  name            text not null,
  short_name      text,
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  venue_id        uuid references public.venues(id),
  status          game_status not null default 'scheduled',
  season_year     int,
  season_type     int,
  week            int,
  broadcasts      text[],
  image_url       text,
  updated_at      timestamptz not null default now(),
  unique (league_id, source, external_id)
);
create index events_starts_idx on public.events(starts_at);
create index events_league_starts_idx on public.events(league_id, starts_at);
create index events_status_idx on public.events(status) where status in ('live', 'scheduled');

create table public.competitions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  league_id       text not null references public.leagues(id) on delete cascade,
  external_id     text not null,
  label           text,                            -- 'Featherweight', 'Race', 'Qual'
  card_segment    text,                            -- 'main','prelims','early'
  order_index     int not null default 0,          -- orden en cartelera
  is_main_event   boolean not null default false,
  is_title_fight  boolean not null default false,
  starts_at       timestamptz not null,
  status          game_status not null default 'scheduled',
  status_detail   text,                            -- '6:32 - 4th', 'Final/OT'
  period          int,
  clock           text,
  scheduled_rounds int,
  result_method   text,                            -- 'KO/TKO','Submission','Decision - Unanimous'
  result_round    int,
  result_time     text,
  situation       jsonb,                           -- posesión, bases, etc.
  leader_competitor_id uuid,                       -- quién va ganando (para alertas de cambio de líder)
  updated_at      timestamptz not null default now(),
  unique (league_id, external_id)
);
create index competitions_event_idx on public.competitions(event_id);
create index competitions_starts_idx on public.competitions(starts_at);
create index competitions_live_idx on public.competitions(status) where status = 'live';

create table public.competitors (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  team_id         uuid references public.teams(id) on delete cascade,
  athlete_id      uuid references public.athletes(id) on delete cascade,
  home_away       text check (home_away in ('home', 'away')),
  order_index     int not null default 0,          -- en F1 = posición de llegada
  score           numeric,
  is_winner       boolean,
  record_summary  text,
  linescores      jsonb not null default '[]'::jsonb,  -- por periodo / round
  stats           jsonb not null default '{}'::jsonb,
  leaders         jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now(),
  entity_key      text generated always as (coalesce(team_id::text, athlete_id::text)) stored,
  check (team_id is not null or athlete_id is not null),
  unique (competition_id, entity_key)
);
create index competitors_team_idx on public.competitors(team_id);
create index competitors_athlete_idx on public.competitors(athlete_id);

-- ---------------------------------------------------------------------
-- Momios (casas de apuestas) + historial para tendencias
-- ---------------------------------------------------------------------
create table public.odds (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  bookmaker       text not null,                   -- 'draftkings','fanduel','betmgm', 'caliente'
  market          text not null check (market in ('h2h', 'spreads', 'totals')),
  competitor_id   uuid references public.competitors(id) on delete cascade,
  outcome         text not null,                   -- nombre del equipo/atleta, 'Over','Under'
  price           int not null,                    -- momio americano (+136 / -162)
  point           numeric,                         -- línea (-3, 54.5)
  open_price      int,
  open_point      numeric,
  updated_at      timestamptz not null default now(),
  unique (competition_id, bookmaker, market, outcome)
);
create index odds_competition_idx on public.odds(competition_id);

create table public.odds_history (
  id              bigint generated always as identity primary key,
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  bookmaker       text not null,
  market          text not null,
  outcome         text not null,
  price           int not null,
  point           numeric,
  recorded_at     timestamptz not null default now()
);
create index odds_history_idx on public.odds_history(competition_id, market, recorded_at);

-- ---------------------------------------------------------------------
-- Clasificaciones / temporadas
-- ---------------------------------------------------------------------
create table public.standings (
  league_id       text not null references public.leagues(id) on delete cascade,
  season_year     int not null,
  group_name      text not null,                   -- 'AFC East', 'Eastern Conference', 'Pilotos'
  team_id         uuid references public.teams(id) on delete cascade,
  athlete_id      uuid references public.athletes(id) on delete cascade,
  rank            int,
  wins            int,
  losses          int,
  ties            int,
  win_pct         numeric,
  points          numeric,                         -- F1
  games_behind    text,
  streak          text,
  stats           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  entity_key      text generated always as (coalesce(team_id::text, athlete_id::text)) stored,
  check (team_id is not null or athlete_id is not null),
  unique (league_id, season_year, group_name, entity_key)
);

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  username            text unique check (username ~ '^[a-zA-Z0-9_\.]{3,24}$'),
  display_name        text,
  avatar_url          text,
  utc_offset_minutes  int not null default -420,   -- UTC-7 por defecto (Hermosillo / Arizona)
  notify_game_start   boolean not null default true,
  notify_final        boolean not null default true,
  notify_lead_change  boolean not null default true,
  notify_pick_result  boolean not null default true,
  notify_group        boolean not null default true,
  notify_favorites    boolean not null default true,
  created_at          timestamptz not null default now()
);

create table public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  league_id   text references public.leagues(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  athlete_id  uuid references public.athletes(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(league_id, team_id, athlete_id) = 1)
);
create unique index favorites_uq on public.favorites(user_id, coalesce(league_id, ''), coalesce(team_id, '00000000-0000-0000-0000-000000000000'), coalesce(athlete_id, '00000000-0000-0000-0000-000000000000'));

create table public.push_tokens (
  token       text primary key,                    -- ExponentPushToken[...]
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text check (platform in ('ios', 'android', 'web')),
  device_name text,
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);

-- Bandeja de notificaciones (también es la cola de envío push)
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,                       -- 'game_start','final','lead_change','pick_result','group'
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,  -- { route: '/event/...' }
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  read_at     timestamptz,
  attempts    int not null default 0
);
create unique index notifications_dedupe_uq on public.notifications(user_id, dedupe_key) where dedupe_key is not null;
create index notifications_unsent_idx on public.notifications(created_at) where sent_at is null;
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Grupos y picks
-- ---------------------------------------------------------------------
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 60),
  description  text,
  avatar_url   text,
  invite_code  text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  leagues      text[] not null default '{}',       -- vacío = todas
  -- Puntuación: mode 'points' (fijo por tipo de pick) o 'units' (paga según momio)
  scoring      jsonb not null default '{"mode":"points","winner":1,"spread":1,"total":1,"method":3,"podium":2,"underdog_bonus":true}'::jsonb,
  is_public    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);

create table public.picks (
  id                       uuid primary key default gen_random_uuid(),
  group_id                 uuid not null references public.groups(id) on delete cascade,
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  competition_id           uuid not null references public.competitions(id) on delete cascade,
  pick_type                pick_type not null default 'winner',
  selection_competitor_id  uuid references public.competitors(id) on delete cascade,
  selection_value          text,                   -- 'over'/'under', método 'KO/TKO'|'Submission'|'Decision'
  line                     numeric,                -- spread o total al momento del pick
  odds_price               int,                    -- momio americano al momento del pick
  confidence               int check (confidence between 1 and 5),
  status                   pick_status not null default 'pending',
  points                   numeric not null default 0,
  graded_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (group_id, user_id, competition_id, pick_type)
);
create index picks_competition_idx on public.picks(competition_id);
create index picks_group_idx on public.picks(group_id, created_at desc);
create index picks_user_idx on public.picks(user_id, created_at desc);

-- Chat / actividad del grupo
create table public.group_messages (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index group_messages_idx on public.group_messages(group_id, created_at desc);

-- Registro de sincronizaciones (observabilidad del pipeline de datos)
create table public.sync_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  league_id   text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  items       int,
  error       text
);
create index sync_runs_idx on public.sync_runs(job, started_at desc);
