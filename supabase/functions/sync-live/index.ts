// Marcadores en vivo. Lo llama pg_cron cada 20 s solo cuando hay juegos activos.
// Cada cambio en competitions/competitors se propaga a la app por Supabase Realtime
// y los triggers de la BD generan las notificaciones push.
import { adminClient, isAuthorizedCron, json, loadLeagues, track } from "../_shared/db.ts";
import { espnDate, fetchFightCenter, fetchScoreboard, type NEvent } from "../_shared/espn.ts";
import { ingestEvents } from "../_shared/ingest.ts";
import { flushPushQueue } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  const db = adminClient();

  // ¿Qué ligas tienen algo en vivo o a punto de empezar?
  const { data: active, error } = await db.rpc("live_window");
  if (error) return json({ error: error.message }, 500);

  const byLeague = new Map<string, { dates: Set<string>; eventIds: Set<string> }>();
  for (const c of (active ?? []) as { league_id: string; starts_at: string; event_external_id: string }[]) {
    const entry = byLeague.get(c.league_id) ?? { dates: new Set(), eventIds: new Set() };
    entry.dates.add(espnDate(new Date(c.starts_at)));
    entry.eventIds.add(c.event_external_id);
    byLeague.set(c.league_id, entry);
  }
  if (!byLeague.size) return json({ ok: true, idle: true });

  const leagues = await loadLeagues(db, [...byLeague.keys()]);
  const results = await Promise.all(leagues.map((lg) =>
    track(db, "sync-live", lg.id, async () => {
      const want = byLeague.get(lg.id)!;
      const events = new Map<string, NEvent>();
      // Scoreboard actual + las fechas de los juegos activos (partidos que cruzan medianoche)
      const boards = await Promise.all([undefined, ...want.dates].map((d) => fetchScoreboard(lg, d).catch(() => [])));
      for (const list of boards) for (const ev of list) if (want.eventIds.has(ev.external_id)) events.set(ev.external_id, ev);

      let fightDetails;
      if (lg.espn_sport === "mma") {
        fightDetails = new Map();
        for (const id of events.keys()) for (const [k, v] of await fetchFightCenter(id)) fightDetails.set(k, v);
      }
      return await ingestEvents(db, lg, [...events.values()], { fightDetails });
    })
  ));

  const push = await flushPushQueue(db).catch((e) => ({ error: String(e) }));
  return json({ ok: true, results, push });
});
