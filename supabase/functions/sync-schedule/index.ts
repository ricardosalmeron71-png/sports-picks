// Calendario + resultados recientes + momios ESPN. pg_cron cada 3 h.
// Body opcional: { leagues?: string[], daysBack?: number, daysAhead?: number }
//            o un rango fijo: { leagues?: string[], from: "2025-10-01", to: "2025-10-31" }
// Para cargar historial (backfill): { "leagues": ["ufc"], "daysBack": 1100, "daysAhead": 0 }
import { adminClient, isAuthorizedCron, json, loadLeagues, readBody, track } from "../_shared/db.ts";
import { fetchFightCenter, fetchRange, fetchWindow, pool } from "../_shared/espn.ts";
import { ingestEvents } from "../_shared/ingest.ts";

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  const body = await readBody<{ leagues: string[]; daysBack: number; daysAhead: number; from: string; to: string; fightStats: boolean }>(req);
  const db = adminClient();
  const leagues = (await loadLeagues(db, body.leagues)).filter((l) => l.espn_sport);
  const daysBack = Math.min(body.daysBack ?? 2, 3650);
  const daysAhead = Math.min(body.daysAhead ?? 45, 365);

  const results = [];
  for (const lg of leagues) {
    results.push(await track(db, "sync-schedule", lg.id, async () => {
      const ranged = body.from && body.to && /^\d{4}-\d{2}-\d{2}$/.test(body.from) && /^\d{4}-\d{2}-\d{2}$/.test(body.to);
      const events = ranged
        ? await fetchRange(lg, new Date(`${body.from}T12:00:00Z`), new Date(`${body.to}T12:00:00Z`))
        : await fetchWindow(lg, daysBack, daysAhead);
      let fightDetails;
      if (lg.espn_sport === "mma") {
        // Detalle de carteleras recientes/próximas (segmentos, títulos, métodos)
        fightDetails = new Map();
        // fightStats: true → también carteleras viejas (historial con estadísticas de cada pelea)
        const near = body.fightStats ? events : events.filter((e) => Math.abs(Date.parse(e.starts_at) - Date.now()) < 45 * 86400_000);
        await pool(near.map((e) => e.external_id), 4, async (id) => {
          for (const [k, v] of await fetchFightCenter(id).catch(() => new Map())) fightDetails!.set(k, v);
        });
      }
      return await ingestEvents(db, lg, events, { withOdds: true, fightDetails });
    }));
  }
  return json({ ok: true, results });
});
