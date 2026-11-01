// Guarda las jugadas clave de la NFL en game_events. Un trigger de la base de datos
// manda las notificaciones solo para jugadas nuevas y recientes.
import { type DB } from "./db.ts";
import { fetchPlays, type LeagueConf, pool } from "./espn.ts";

export async function syncNflPlays(db: DB, league: LeagueConf, eventExternalIds: string[]): Promise<number> {
  let inserted = 0;
  await pool(eventExternalIds, 4, async (eventId) => {
    const res = await fetchPlays(league, eventId);
    if (!res || !res.plays.length) return;

    const { data: comp } = await db.from("competitions").select("id").eq("league_id", league.id).eq("external_id", res.competition_external_id).maybeSingle();
    if (!comp) return;

    const { data: existing } = await db.from("game_events").select("external_id").eq("competition_id", comp.id);
    const known = new Set((existing ?? []).map((r) => String(r.external_id)));
    const fresh = res.plays.filter((p) => !known.has(p.external_id));
    if (!fresh.length) return;

    const teamIds = [...new Set(fresh.map((p) => p.team_external_id).filter((x): x is string => !!x))];
    const { data: teams } = teamIds.length
      ? await db.from("teams").select("id, external_id").eq("league_id", league.id).in("external_id", teamIds)
      : { data: [] as { id: string; external_id: string }[] };
    const teamMap = new Map((teams ?? []).map((t) => [String(t.external_id), String(t.id)]));

    // en orden cronológico para que las notificaciones lleguen en orden
    const rows = fresh
      .sort((a, b) => (a.occurred_at ?? "").localeCompare(b.occurred_at ?? ""))
      .map((p) => ({
        competition_id: comp.id,
        external_id: p.external_id,
        kind: p.kind,
        team_id: p.team_external_id ? teamMap.get(p.team_external_id) ?? null : null,
        description: p.description,
        period: p.period,
        clock: p.clock,
        away_score: p.away_score,
        home_score: p.home_score,
        occurred_at: p.occurred_at,
      }));
    const { error } = await db.from("game_events").upsert(rows, { onConflict: "competition_id,external_id", ignoreDuplicates: true });
    if (error) throw new Error(`game_events: ${error.message}`);
    inserted += rows.length;
  });
  return inserted;
}
