// Equipos (logos), rosters con fotos de jugadores y clasificaciones. pg_cron diario.
import { adminClient, chunk, isAuthorizedCron, json, loadLeagues, readBody, track } from "../_shared/db.ts";
import { fetchRoster, fetchStandings, fetchTeams, fetchTeamStats, pool } from "../_shared/espn.ts";
import { upsertAthletes, upsertTeams } from "../_shared/ingest.ts";

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  const body = await readBody<{ leagues: string[]; rosters: boolean }>(req);
  const db = adminClient();
  const leagues = (await loadLeagues(db, body.leagues)).filter((l) => l.espn_sport);
  const results = [];

  for (const lg of leagues) {
    if (lg.kind === "team") {
      results.push(await track(db, "sync-teams", lg.id, async () => {
        const teams = await fetchTeams(lg);
        const teamMap = await upsertTeams(db, lg.id, teams);
        let n = teams.length;
        if (body.rosters !== false) {
          await pool([...teamMap.entries()], 4, async ([extId, teamId]) => {
            const roster = await fetchRoster(lg, extId);
            await upsertAthletes(db, lg.id, roster.map((a) => ({ ...a, team_id: teamId, active: true })));
            n += roster.length;
            const season = await fetchTeamStats(lg, extId).catch(() => ({}));
            if (Object.keys(season).length) await db.from("teams").update({ season_stats: season }).eq("id", teamId);
          });
        }
        return n;
      }));
    }

    results.push(await track(db, "sync-standings", lg.id, async () => {
      const { season, rows } = await fetchStandings(lg);
      if (!rows.length) return 0;
      const { data: teams } = await db.from("teams").select("id, external_id").eq("league_id", lg.id);
      const teamIds = new Map((teams ?? []).map((t) => [t.external_id, t.id]));
      const athleteIds = await upsertAthletes(db, lg.id, rows.flatMap((r) => (r.athlete ? [r.athlete] : [])));
      const out = rows.flatMap((r) => {
        const team_id = r.team_external_id ? teamIds.get(r.team_external_id) ?? null : null;
        const athlete_id = r.athlete ? athleteIds.get(r.athlete.external_id) ?? null : null;
        if (!team_id && !athlete_id) return [];
        return [{
          league_id: lg.id, season_year: season, group_name: r.group_name, team_id, athlete_id,
          rank: r.rank, wins: r.wins, losses: r.losses, ties: r.ties, win_pct: r.win_pct, points: r.points,
          games_behind: r.games_behind, streak: r.streak, stats: r.stats, updated_at: new Date().toISOString(),
        }];
      });
      for (const part of chunk(out, 500)) {
        const { error } = await db.from("standings").upsert(part, { onConflict: "league_id,season_year,group_name,entity_key" });
        if (error) throw new Error(error.message);
      }
      // Récord de los equipos para tarjetas rápidas
      for (const r of out) {
        if (r.team_id && r.stats?.overall) {
          await db.from("teams").update({ record_summary: r.stats.overall, stats: r.stats }).eq("id", r.team_id);
        }
      }
      return out.length;
    }));
  }
  return json({ ok: true, results });
});
