// Capa de datos: consultas a Supabase + caché con React Query.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type {
  AppNotification, Athlete, AthleteHistoryRow, Competition, Group, LeaderboardRow, League, LeagueId, Odds,
  OddsHistory, PickType, Profile, SportEvent, Standing, Team, TeamFormRow, TimelineRow, UserPick,
} from "./types";

// Los tipos inferidos por supabase-js desde el string de select no coinciden 1:1 con
// nuestros tipos de dominio (relaciones 1:1 se infieren como arreglos), así que se tipa aquí.
const unwrap = <T>({ data, error }: { data: unknown; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// Selección estándar de un evento con todo lo necesario para pintar tarjetas
export const EVENT_SELECT = `
  id, league_id, name, short_name, starts_at, status, season_year, week, broadcasts,
  venues(id, name, city, state, country, indoor),
  leagues(id, name, short_name, kind, logo_url, color, sort_order),
  competitions(
    id, event_id, league_id, label, card_segment, order_index, is_main_event, is_title_fight, starts_at, status,
    status_detail, period, clock, scheduled_rounds, result_method, result_round, result_time, situation, updated_at,
    competitors(
      id, competition_id, team_id, athlete_id, home_away, order_index, score, is_winner, record_summary, linescores, stats, leaders,
      teams(id, league_id, name, display_name, abbreviation, logo_url, color, alt_color, record_summary),
      athletes(id, league_id, display_name, short_name, headshot_url, flag_url, country, record_summary, weight_class, height, reach, stance, age)
    )
  )`;

// ---------------------------------------------------------------------
// Ligas / eventos
// ---------------------------------------------------------------------
export function useLeagues() {
  return useQuery({
    queryKey: ["leagues"],
    staleTime: 3600_000,
    queryFn: async () => unwrap<League[]>(await supabase.from("leagues").select("*").eq("active", true).order("sort_order")),
  });
}

export function useEvents(opts: { leagues?: LeagueId[]; from: string; to: string; status?: string[]; limit?: number }) {
  return useQuery({
    queryKey: ["events", opts],
    queryFn: async () => {
      let q = supabase.from("events").select(EVENT_SELECT).gte("starts_at", opts.from).lte("starts_at", opts.to)
        .order("starts_at").limit(opts.limit ?? 200);
      if (opts.leagues?.length) q = q.in("league_id", opts.leagues);
      if (opts.status?.length) q = q.in("status", opts.status);
      return sortEvents(unwrap<SportEvent[]>(await q));
    },
  });
}

export function useLiveEvents() {
  return useQuery({
    queryKey: ["events", "live"],
    refetchInterval: 60_000, // red de seguridad; los cambios llegan por Realtime
    queryFn: async () =>
      sortEvents(unwrap<SportEvent[]>(await supabase.from("events").select(EVENT_SELECT).eq("status", "live").order("starts_at"))),
  });
}

export function useEvent(id?: string) {
  return useQuery({
    queryKey: ["event", id],
    enabled: !!id,
    queryFn: async () => {
      const ev = unwrap<SportEvent>(
        await supabase.from("events").select(EVENT_SELECT.replace("situation, updated_at,", "situation, updated_at, odds(*),")).eq("id", id!).single(),
      );
      return sortEvents([ev])[0];
    },
  });
}

export function useOddsHistory(competitionId?: string) {
  return useQuery({
    queryKey: ["odds_history", competitionId],
    enabled: !!competitionId,
    queryFn: async () =>
      unwrap<OddsHistory[]>(
        await supabase.from("odds_history").select("bookmaker, market, outcome, price, point, recorded_at")
          .eq("competition_id", competitionId!).order("recorded_at").limit(1000),
      ),
  });
}

function sortEvents(evs: SportEvent[]) {
  for (const e of evs) {
    e.competitions?.sort((a, b) => a.order_index - b.order_index);
    for (const c of e.competitions ?? []) {
      c.competitors?.sort((a, b) => {
        // visitante primero (convención de EE.UU.), luego orden
        const w = (x: typeof a) => (x.home_away === "away" ? 0 : x.home_away === "home" ? 1 : 2);
        return w(a) - w(b) || a.order_index - b.order_index;
      });
    }
  }
  return evs;
}

// ---------------------------------------------------------------------
// Equipos / atletas / clasificaciones
// ---------------------------------------------------------------------
export function useTeam(id?: string) {
  return useQuery({
    queryKey: ["team", id],
    enabled: !!id,
    queryFn: async () => unwrap<Team>(await supabase.from("teams").select("*").eq("id", id!).single()),
  });
}

export function useTeams(leagueId?: LeagueId) {
  return useQuery({
    queryKey: ["teams", leagueId],
    enabled: !!leagueId,
    staleTime: 3600_000,
    queryFn: async () => unwrap<Team[]>(await supabase.from("teams").select("*").eq("league_id", leagueId!).order("display_name")),
  });
}

export function useTeamForm(teamId?: string, limit = 10) {
  return useQuery({
    queryKey: ["team_form", teamId, limit],
    enabled: !!teamId,
    queryFn: async () => unwrap<TeamFormRow[]>(await supabase.rpc("team_form", { p_team: teamId, p_limit: limit })),
  });
}

export function useRoster(teamId?: string) {
  return useQuery({
    queryKey: ["roster", teamId],
    enabled: !!teamId,
    queryFn: async () =>
      unwrap<Athlete[]>(await supabase.from("athletes").select("*").eq("team_id", teamId!).eq("active", true).order("position").order("display_name")),
  });
}

/** Próximas competencias de un equipo o atleta */
export function useUpcomingFor(kind: "team" | "athlete", id?: string) {
  return useQuery({
    queryKey: ["upcoming", kind, id],
    enabled: !!id,
    queryFn: async () => {
      const col = kind === "team" ? "team_id" : "athlete_id";
      const rows = unwrap<{ competitions: { event_id: string; starts_at: string; status: string } }[]>(
        await supabase.from("competitors").select("competitions!inner(event_id, starts_at, status)").eq(col, id!)
          .in("competitions.status", ["scheduled", "live"]).limit(20),
      );
      const ids = [...new Set(rows.map((r) => r.competitions.event_id))];
      if (!ids.length) return [] as SportEvent[];
      return sortEvents(unwrap<SportEvent[]>(await supabase.from("events").select(EVENT_SELECT).in("id", ids).order("starts_at").limit(5)));
    },
  });
}

export function useAthlete(id?: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["athlete", id],
    enabled: !!id,
    queryFn: async () => {
      // 1) Lo que hay en BD (rápido)
      const base = unwrap<Athlete>(
        await supabase.from("athletes").select("*, teams(id, display_name, logo_url, abbreviation, color)").eq("id", id!).single(),
      );
      // 2) Enriquecer en segundo plano (stats + gamelog desde ESPN, cacheado 12 h en el servidor)
      supabase.functions.invoke("athlete-profile", { body: { athleteId: id } }).then(({ data }) => {
        if (data?.athlete && !data.cached) qc.setQueryData(["athlete", id], { ...base, ...data.athlete, teams: base.teams });
      });
      return base;
    },
  });
}

export function useAthleteHistory(id?: string) {
  return useQuery({
    queryKey: ["athlete_history", id],
    enabled: !!id,
    queryFn: async () => unwrap<AthleteHistoryRow[]>(await supabase.rpc("athlete_history", { p_athlete: id, p_limit: 40 })),
  });
}

export function useLeagueAthletes(leagueId?: LeagueId) {
  return useQuery({
    queryKey: ["league_athletes", leagueId],
    enabled: !!leagueId,
    queryFn: async () =>
      unwrap<Athlete[]>(
        await supabase.from("athletes").select("*").eq("league_id", leagueId!).eq("active", true)
          .not("headshot_url", "is", null).order("updated_at", { ascending: false }).limit(300),
      ),
  });
}

export function useStandings(leagueId?: LeagueId) {
  return useQuery({
    queryKey: ["standings", leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const rows = unwrap<Standing[]>(
        await supabase.from("standings")
          .select("*, teams(id, display_name, abbreviation, logo_url, color), athletes(id, display_name, headshot_url, flag_url)")
          .eq("league_id", leagueId!).order("season_year", { ascending: false }).order("rank"),
      );
      const season = rows[0]?.season_year;
      return rows.filter((r) => r.season_year === season);
    },
  });
}

export function useHeadToHead(a?: string, b?: string) {
  return useQuery({
    queryKey: ["h2h", a, b],
    enabled: !!a && !!b,
    queryFn: async () =>
      unwrap<{ competition_id: string; event_id: string; starts_at: string; a_score: number | null; b_score: number | null; winner: "a" | "b" | "draw"; method: string | null }[]>(
        await supabase.rpc("head_to_head", { p_a: a, p_b: b, p_limit: 20 }),
      ),
  });
}

export async function searchAll(q: string) {
  const term = `%${q.trim()}%`;
  const [teams, athletes] = await Promise.all([
    supabase.from("teams").select("id, league_id, display_name, abbreviation, logo_url, color").ilike("display_name", term).limit(15),
    supabase.from("athletes").select("id, league_id, display_name, headshot_url, position, weight_class, record_summary, teams(abbreviation, logo_url)")
      .ilike("display_name", term).limit(25),
  ]);
  return { teams: (teams.data ?? []) as Partial<Team>[], athletes: (athletes.data ?? []) as unknown as Partial<Athlete>[] };
}

// ---------------------------------------------------------------------
// Grupos / picks
// ---------------------------------------------------------------------
export function useMyGroups(userId?: string) {
  return useQuery({
    queryKey: ["groups", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = unwrap<{ role: string; groups: Group }[]>(
        await supabase.from("group_members").select("role, groups(*)").eq("user_id", userId!),
      );
      return rows.map((r) => ({ ...r.groups, role: r.role }));
    },
  });
}

export function useGroup(id?: string) {
  return useQuery({
    queryKey: ["group", id],
    enabled: !!id,
    queryFn: async () => unwrap<Group>(await supabase.from("groups").select("*").eq("id", id!).single()),
  });
}

export function useLeaderboard(groupId?: string) {
  return useQuery({
    queryKey: ["leaderboard", groupId],
    enabled: !!groupId,
    queryFn: async () => unwrap<LeaderboardRow[]>(await supabase.from("group_leaderboard").select("*").eq("group_id", groupId!).order("rank")),
  });
}

export function useTimeline(groupId?: string, days = 30) {
  return useQuery({
    queryKey: ["timeline", groupId, days],
    enabled: !!groupId,
    queryFn: async () => unwrap<TimelineRow[]>(await supabase.rpc("group_points_timeline", { p_group: groupId, p_days: days })),
  });
}

export type PickWithContext = UserPick & {
  competitions: Pick<Competition, "id" | "event_id" | "league_id" | "starts_at" | "status" | "status_detail" | "label"> & {
    competitors: { id: string; score: number | null; is_winner: boolean | null; home_away: string | null; teams: { abbreviation: string | null; logo_url: string | null } | null; athletes: { short_name: string | null; display_name: string; headshot_url: string | null } | null }[];
  };
};

export function useGroupPicks(groupId?: string) {
  return useQuery({
    queryKey: ["group_picks", groupId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap<PickWithContext[]>(
        await supabase.from("picks").select(`*, profiles(display_name, username, avatar_url),
          competitions(id, event_id, league_id, starts_at, status, status_detail, label,
            competitors(id, score, is_winner, home_away, teams(abbreviation, logo_url), athletes(short_name, display_name, headshot_url)))`)
          .eq("group_id", groupId!).order("created_at", { ascending: false }).limit(200),
      ),
  });
}

export function usePicksForEvent(eventId?: string, competitionIds: string[] = []) {
  return useQuery({
    queryKey: ["event_picks", eventId, competitionIds.join(",")],
    enabled: !!eventId && competitionIds.length > 0,
    queryFn: async () =>
      unwrap<UserPick[]>(
        await supabase.from("picks").select("*, profiles(display_name, username, avatar_url)").in("competition_id", competitionIds),
      ),
  });
}

export function useMyActivePicks(userId?: string) {
  return useQuery({
    queryKey: ["my_active_picks", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<PickWithContext[]>(
        await supabase.from("picks").select(`*, competitions!inner(id, event_id, league_id, starts_at, status, status_detail, label,
            competitors(id, score, is_winner, home_away, teams(abbreviation, logo_url), athletes(short_name, display_name, headshot_url)))`)
          .eq("user_id", userId!).in("competitions.status", ["live", "scheduled"]).order("created_at", { ascending: false }).limit(50),
      ),
  });
}

export function useConsensus(competitionId?: string, groupId?: string) {
  return useQuery({
    queryKey: ["consensus", competitionId, groupId],
    enabled: !!competitionId,
    queryFn: async () =>
      unwrap<{ pick_type: PickType; selection_competitor_id: string | null; selection_value: string | null; votes: number; pct: number }[]>(
        await supabase.rpc("pick_consensus", { p_competition: competitionId, p_group: groupId ?? null }),
      ),
  });
}

export interface PickInput {
  group_id: string;
  competition_id: string;
  pick_type: PickType;
  selection_competitor_id?: string | null;
  selection_value?: string | null;
  line?: number | null;
  odds_price?: number | null;
  confidence?: number | null;
}

export function useSavePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: PickInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Inicia sesión");
      const row = { ...p, user_id: user.id };
      // upsert manual (las columnas de status/puntos no son escribibles por el cliente)
      const existing = await supabase.from("picks").select("id").eq("group_id", p.group_id).eq("user_id", user.id)
        .eq("competition_id", p.competition_id).eq("pick_type", p.pick_type).maybeSingle();
      if (existing.data) {
        const { group_id: _g, competition_id: _c, pick_type: _t, ...upd } = p;
        return unwrap(await supabase.from("picks").update(upd).eq("id", existing.data.id).select().single());
      }
      return unwrap(await supabase.from("picks").insert(row).select().single());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event_picks"] });
      qc.invalidateQueries({ queryKey: ["group_picks"] });
      qc.invalidateQueries({ queryKey: ["my_active_picks"] });
      qc.invalidateQueries({ queryKey: ["consensus"] });
    },
  });
}

export function useDeletePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from("picks").delete().eq("id", id)),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export async function createGroup(input: { name: string; description?: string; leagues: LeagueId[]; scoring: Group["scoring"]; ownerId: string }) {
  return unwrap<Group>(
    await supabase.from("groups").insert({
      name: input.name, description: input.description ?? null, leagues: input.leagues, scoring: input.scoring, owner_id: input.ownerId,
    }).select().single(),
  );
}

export async function joinGroup(code: string) {
  return unwrap<string>(await supabase.rpc("join_group", { p_invite_code: code }));
}

export function useGroupMessages(groupId?: string) {
  return useQuery({
    queryKey: ["group_messages", groupId],
    enabled: !!groupId,
    queryFn: async () =>
      unwrap<{ id: number; user_id: string; body: string; created_at: string; profiles: { display_name: string | null; avatar_url: string | null } | null }[]>(
        await supabase.from("group_messages").select("*, profiles(display_name, avatar_url)").eq("group_id", groupId!)
          .order("created_at", { ascending: false }).limit(100),
      ),
  });
}

// ---------------------------------------------------------------------
// Perfil / favoritos / notificaciones
// ---------------------------------------------------------------------
export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => unwrap<Profile>(await supabase.from("profiles").select("*").eq("id", userId!).single()),
  });
}

export function useUpdateProfile(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => unwrap(await supabase.from("profiles").update(patch).eq("id", userId!).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}

export function useMyStats(userId?: string) {
  return useQuery({
    queryKey: ["my_stats", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<{ league_id: LeagueId; wins: number; losses: number; pushes: number; points: number; win_pct: number | null }[]>(
        await supabase.rpc("user_pick_stats", { p_user: userId }),
      ),
  });
}

export function useFavorites(userId?: string) {
  return useQuery({
    queryKey: ["favorites", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<{ team_id: string | null; athlete_id: string | null; league_id: string | null }[]>(
        await supabase.from("favorites").select("team_id, athlete_id, league_id").eq("user_id", userId!),
      ),
  });
}

export function useToggleFavorite(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, on }: { kind: "team" | "athlete"; id: string; on: boolean }) => {
      const col = kind === "team" ? "team_id" : "athlete_id";
      if (on) return unwrap(await supabase.from("favorites").insert({ user_id: userId, [col]: id }));
      return unwrap(await supabase.from("favorites").delete().eq("user_id", userId!).eq(col, id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites", userId] }),
  });
}

export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<AppNotification[]>(
        await supabase.from("notifications").select("id, kind, title, body, data, created_at, read_at").eq("user_id", userId!)
          .order("created_at", { ascending: false }).limit(100),
      ),
  });
}

export async function markAllRead(userId: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
}

export type { Odds };
