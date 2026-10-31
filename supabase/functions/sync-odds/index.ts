// Momios de múltiples casas de apuestas vía The Odds API (https://the-odds-api.com).
// Requiere el secret ODDS_API_KEY. Se empareja cada juego/pelea por horario y nombres.
import { adminClient, chunk, isAuthorizedCron, json, loadLeagues, readBody, track } from "../_shared/db.ts";

const API = "https://api.the-odds-api.com/v4/sports";
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const lastName = (s: string) => norm(s).split(" ").at(-1) ?? "";

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; title: string; markets: { key: string; outcomes: { name: string; price: number; point?: number }[] }[] }[];
}

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  const apiKey = Deno.env.get("ODDS_API_KEY");
  if (!apiKey) return json({ ok: false, error: "ODDS_API_KEY no configurada (los momios de ESPN/DraftKings siguen llegando por sync-schedule)" });
  const body = await readBody<{ leagues: string[]; regions: string }>(req);
  const db = adminClient();
  const leagues = (await loadLeagues(db, body.leagues)).filter((l) => l.odds_api_key);
  const results = [];

  for (const lg of leagues) {
    results.push(await track(db, "sync-odds", lg.id, async () => {
      // Competencias próximas (36 h) con sus competidores
      const { data: comps, error } = await db
        .from("competitions")
        .select("id, starts_at, competitors(id, teams(display_name, name, location), athletes(display_name, full_name))")
        .eq("league_id", lg.id).eq("status", "scheduled")
        .gte("starts_at", new Date().toISOString())
        .lte("starts_at", new Date(Date.now() + 36 * 3600_000).toISOString());
      if (error) throw new Error(error.message);
      if (!comps?.length) return 0;

      const markets = lg.kind === "team" ? "h2h,spreads,totals" : "h2h";
      const url = `${API}/${lg.odds_api_key}/odds?apiKey=${apiKey}&regions=${body.regions ?? "us"}&markets=${markets}&oddsFormat=american`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`odds api ${res.status}: ${await res.text()}`);
      console.log("odds api remaining", res.headers.get("x-requests-remaining"));
      const events = (await res.json()) as OddsEvent[];

      type C = { id: string; names: string[] };
      const candidates = comps.map((c) => ({
        id: c.id as string,
        t: Date.parse(c.starts_at as string),
        // deno-lint-ignore no-explicit-any
        competitors: ((c.competitors ?? []) as any[]).map((k): C => {
          const team = k.teams, ath = k.athletes;
          const names = team ? [team.display_name, `${team.location} ${team.name}`, team.name] : [ath?.display_name, ath?.full_name];
          return { id: k.id, names: names.filter(Boolean).map(norm) };
        }),
      }));
      const matchName = (cs: C[], name: string) => {
        const n = norm(name);
        return cs.find((c) => c.names.includes(n)) ??
          (lg.kind !== "team" ? cs.find((c) => c.names.some((x) => lastName(x) === lastName(n))) : undefined);
      };

      const rows: Record<string, unknown>[] = [];
      for (const ev of events) {
        const t = Date.parse(ev.commence_time);
        const comp = candidates.find((c) =>
          Math.abs(c.t - t) < 12 * 3600_000 && matchName(c.competitors, ev.home_team) && matchName(c.competitors, ev.away_team)
        );
        if (!comp) continue;
        for (const bm of ev.bookmakers) {
          for (const m of bm.markets) {
            for (const o of m.outcomes) {
              const who = m.key === "totals" ? undefined : matchName(comp.competitors, o.name);
              rows.push({
                competition_id: comp.id,
                bookmaker: bm.key,
                market: m.key,
                competitor_id: who?.id ?? null,
                outcome: o.name,
                price: Math.round(o.price),
                point: o.point ?? null,
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      }
      for (const part of chunk(rows, 500)) {
        const { error: e2 } = await db.from("odds").upsert(part, { onConflict: "competition_id,bookmaker,market,outcome" });
        if (e2) throw new Error(e2.message);
      }
      return rows.length;
    }));
  }
  return json({ ok: true, results });
});
