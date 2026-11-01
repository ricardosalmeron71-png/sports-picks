// Tipos que reflejan el esquema de Supabase (supabase/migrations).
// Para regenerarlos automáticamente: npx supabase gen types typescript --linked > src/lib/database.types.ts

export type LeagueId = "nfl" | "nba" | "mlb" | "ufc" | "boxing" | "f1";
export type SportKind = "team" | "combat" | "racing";
export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled" | "delayed";
export type PickType = "winner" | "spread" | "total" | "method" | "podium";
export type PickStatus = "pending" | "won" | "lost" | "push" | "void";

export interface League {
  id: LeagueId;
  name: string;
  short_name: string;
  kind: SportKind;
  logo_url: string | null;
  color: string | null;
  sort_order: number;
}

export interface Venue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  indoor: boolean | null;
}

export interface Team {
  id: string;
  league_id: LeagueId;
  name: string;
  display_name: string;
  abbreviation: string | null;
  location: string | null;
  logo_url: string | null;
  color: string | null;
  alt_color: string | null;
  record_summary: string | null;
  conference: string | null;
  division: string | null;
  stats: Record<string, string>;
  season_stats: Record<string, Record<string, string>>;
}

export interface GameLogEntry {
  event_id: string;
  date: string | null;
  opponent: string | null;
  result: string | null;
  values: Record<string, number | string>;
}

export interface Athlete {
  id: string;
  league_id: LeagueId;
  team_id: string | null;
  full_name: string;
  display_name: string;
  short_name: string | null;
  nickname: string | null;
  headshot_url: string | null;
  position: string | null;
  jersey: string | null;
  country: string | null;
  flag_url: string | null;
  weight_class: string | null;
  height: string | null;
  weight: string | null;
  reach: string | null;
  stance: string | null;
  age: number | null;
  record_summary: string | null;
  stats: { summary?: Record<string, string>; season?: Record<string, Record<string, string>> };
  gamelog: GameLogEntry[];
  teams?: Pick<Team, "id" | "display_name" | "logo_url" | "abbreviation" | "color"> | null;
}

export interface Competitor {
  id: string;
  competition_id: string;
  team_id: string | null;
  athlete_id: string | null;
  home_away: "home" | "away" | null;
  order_index: number;
  score: number | null;
  is_winner: boolean | null;
  record_summary: string | null;
  linescores: number[];
  stats: Record<string, string>;
  leaders: { category: string; value: string; athlete: string; headshot: string | null }[];
  teams?: Team | null;
  athletes?: Athlete | null;
}

export interface Competition {
  id: string;
  event_id: string;
  league_id: LeagueId;
  label: string | null;
  card_segment: string | null;
  order_index: number;
  is_main_event: boolean;
  is_title_fight: boolean;
  starts_at: string;
  status: GameStatus;
  status_detail: string | null;
  period: number | null;
  clock: string | null;
  scheduled_rounds: number | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
  situation: Record<string, unknown> | null;
  updated_at: string;
  competitors?: Competitor[];
  odds?: Odds[];
}

export interface SportEvent {
  id: string;
  league_id: LeagueId;
  name: string;
  short_name: string | null;
  starts_at: string;
  status: GameStatus;
  season_year: number | null;
  season_type: number | null;
  week: number | null;
  broadcasts: string[] | null;
  venues?: Venue | null;
  leagues?: League | null;
  competitions?: Competition[];
}

export interface Odds {
  id: string;
  competition_id: string;
  bookmaker: string;
  market: "h2h" | "spreads" | "totals";
  competitor_id: string | null;
  outcome: string;
  price: number;
  point: number | null;
  open_price: number | null;
  open_point: number | null;
  updated_at: string;
}

export interface OddsHistory {
  bookmaker: string;
  market: string;
  outcome: string;
  price: number;
  point: number | null;
  recorded_at: string;
}

export interface Standing {
  league_id: LeagueId;
  season_year: number;
  group_name: string;
  team_id: string | null;
  athlete_id: string | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  win_pct: number | null;
  points: number | null;
  games_behind: string | null;
  streak: string | null;
  stats: Record<string, string>;
  teams?: Pick<Team, "id" | "display_name" | "abbreviation" | "logo_url" | "color"> | null;
  athletes?: Pick<Athlete, "id" | "display_name" | "headshot_url" | "flag_url"> | null;
}

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  utc_offset_minutes: number;
  notify_game_start: boolean;
  notify_final: boolean;
  notify_lead_change: boolean;
  notify_pick_result: boolean;
  notify_group: boolean;
  notify_favorites: boolean;
  notify_plays: boolean;
  notify_chat: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  invite_code: string;
  owner_id: string;
  leagues: LeagueId[];
  scoring: { mode: "points" | "units"; winner?: number; spread?: number; total?: number; method?: number; podium?: number; underdog_bonus?: boolean };
  is_public: boolean;
  created_at: string;
}

export interface UserPick {
  id: string;
  group_id: string;
  user_id: string;
  competition_id: string;
  pick_type: PickType;
  selection_competitor_id: string | null;
  selection_value: string | null;
  line: number | null;
  odds_price: number | null;
  confidence: number | null;
  status: PickStatus;
  points: number;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "username" | "avatar_url"> | null;
}

export interface LeaderboardRow {
  group_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  points: number;
  win_pct: number | null;
  rank: number;
}

export interface TimelineRow {
  user_id: string;
  display_name: string;
  day: string;
  points: number;
  cumulative: number;
}

export interface TeamFormRow {
  competition_id: string;
  event_id: string;
  starts_at: string;
  opponent_id: string;
  opponent_name: string;
  opponent_logo: string | null;
  home_away: string | null;
  team_score: number | null;
  opp_score: number | null;
  result: "W" | "L" | "T";
}

export interface AthleteHistoryRow {
  competition_id: string;
  event_id: string;
  event_name: string;
  starts_at: string;
  label: string | null;
  opponent_id: string | null;
  opponent_name: string | null;
  opponent_headshot: string | null;
  result: "W" | "L" | "D" | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
  finish_position: number | null;
  status: GameStatus;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: { route?: string };
  created_at: string;
  read_at: string | null;
}

export interface GameEvent {
  id: number;
  competition_id: string;
  external_id: string;
  kind: "touchdown" | "field_goal" | "safety" | "two_point" | "interception" | "fumble";
  team_id: string | null;
  description: string | null;
  period: number | null;
  clock: string | null;
  away_score: number | null;
  home_score: number | null;
  occurred_at: string | null;
  teams?: { abbreviation: string | null; logo_url: string | null; display_name: string } | null;
}
