// Perfil enriquecido de jugador/peleador bajo demanda (lo llama la app).
// Cachea 12 h en la tabla athletes: stats de temporada + gamelog para gráficos.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { adminClient, cors, json, readBody } from "../_shared/db.ts";
import { fetchAthleteProfile } from "../_shared/espn.ts";

const FIELDS = ["nickname", "weight_class", "height", "weight", "reach", "stance", "age", "headshot_url", "flag_url", "country", "record_summary"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const { athleteId, force } = await readBody<{ athleteId: string; force: boolean }>(req);
  if (!athleteId || !/^[0-9a-f-]{36}$/i.test(athleteId)) return json({ error: "athleteId inválido" }, 400);

  const db = adminClient();
  const { data: ath, error } = await db
    .from("athletes")
    .select("*, leagues(id, kind, espn_sport, espn_league)")
    .eq("id", athleteId)
    .single();
  if (error || !ath) return json({ error: "no encontrado" }, 404);

  const fresh = Date.now() - Date.parse(ath.updated_at) < 12 * 3600_000 && Object.keys(ath.stats ?? {}).length > 0;
  if ((fresh && !force) || String(ath.external_id).startsWith("tsdb:") || !ath.leagues?.espn_sport) {
    return json({ athlete: ath, cached: true });
  }

  try {
    const p = await fetchAthleteProfile(ath.leagues, ath.external_id);
    const patch: Record<string, unknown> = { stats: p.stats, gamelog: p.gamelog };
    for (const k of FIELDS) if (p[k] !== null && p[k] !== undefined) patch[k] = p[k];
    const { data: updated } = await db.from("athletes").update(patch).eq("id", athleteId).select("*, leagues(id, kind, espn_sport, espn_league)").single();
    return json({ athlete: updated ?? ath, cached: false });
  } catch (e) {
    return json({ athlete: ath, cached: true, warning: String(e) });
  }
});
