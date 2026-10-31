// Box: ESPN no publica scoreboard de boxeo, así que usamos TheSportsDB (liga 4445).
// Secret opcional THESPORTSDB_KEY (la clave "3" es la gratuita de pruebas, con límites).
import { adminClient, isAuthorizedCron, json, loadLeagues, track } from "../_shared/db.ts";
import type { GameStatus, NAthlete, NCompetitor, NEvent } from "../_shared/espn.ts";
import { ingestEvents } from "../_shared/ingest.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const KEY = () => Deno.env.get("THESPORTSDB_KEY") ?? "3";
const api = (path: string) => `https://www.thesportsdb.com/api/v1/json/${KEY()}/${path}`;
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function get(path: string): Promise<Any> {
  const r = await fetch(api(path));
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

const photoCache = new Map<string, { headshot: string | null; country: string | null }>();
async function fighterPhoto(name: string) {
  if (photoCache.has(name)) return photoCache.get(name)!;
  const d = await get(`searchplayers.php?p=${encodeURIComponent(name)}`);
  const p = (d?.player ?? []).find((x: Any) => /boxing/i.test(x.strSport ?? "")) ?? d?.player?.[0];
  const out = { headshot: p?.strCutout ?? p?.strThumb ?? p?.strRender ?? null, country: p?.strNationality ?? null };
  photoCache.set(name, out);
  return out;
}

function startOf(e: Any): string {
  if (e.strTimestamp) {
    const s = String(e.strTimestamp).replace(" ", "T");
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).toISOString();
  }
  return new Date(`${e.dateEvent}T${e.strTime || "00:00:00"}Z`).toISOString();
}

function statusOf(e: Any, startsAt: string): GameStatus {
  const s = String(e.strStatus ?? "").toLowerCase();
  if (/(cancel|abandon)/.test(s)) return "canceled";
  if (/postpon/.test(s)) return "postponed";
  if (/(finished|^ft$|final)/.test(s) || e.strResult) return "final";
  if (/(live|in progress|round)/.test(s)) return "live";
  return Date.parse(startsAt) < Date.now() - 6 * 3600_000 ? "final" : "scheduled";
}

async function toEvent(e: Any): Promise<NEvent | null> {
  const parts = String(e.strEvent ?? "").split(/\s+vs\.?\s+/i);
  const a: string | undefined = e.strHomeTeam || parts[0];
  const b: string | undefined = e.strAwayTeam || parts[1];
  if (!a || !b) return null;
  const startsAt = startOf(e);
  const status = statusOf(e, startsAt);
  const result = String(e.strResult ?? "");

  const wonBy = (n: string) => {
    if (status !== "final" || !result) return null;
    const ln = n.split(" ").at(-1)!.toLowerCase().replace(/[^a-z]/g, "");
    return new RegExp(`${ln}[^.]{0,40}(won|wins|def|beat)`, "i").test(result) ? true : null;
  };

  const competitors: NCompetitor[] = [];
  for (const [i, name] of [a, b].entries()) {
    const photo = await fighterPhoto(name);
    const athlete: NAthlete = {
      external_id: `tsdb:${slug(name)}`,
      full_name: name,
      display_name: name,
      short_name: name.split(" ").at(-1) ?? name,
      headshot_url: photo.headshot,
      flag_url: null,
      country: photo.country,
    };
    competitors.push({
      team: null, athlete, home_away: null, order_index: i, score: null, is_winner: wonBy(name),
      record_summary: null, linescores: [], stats: {}, leaders: [],
    });
  }
  if (competitors.some((c) => c.is_winner)) for (const c of competitors) c.is_winner = !!c.is_winner;
  const method = /\bko\b|tko|knockout/i.test(result)
    ? "KO/TKO"
    : /decision|points|\bud\b|\bsd\b|\bmd\b/i.test(result)
    ? "Decision"
    : null;

  return {
    external_id: String(e.idEvent),
    name: e.strEvent,
    short_name: `${a.split(" ").at(-1)} vs ${b.split(" ").at(-1)}`,
    starts_at: startsAt,
    ends_at: null,
    venue: e.strVenue
      ? { external_id: slug(`${e.strVenue}-${e.strCity ?? ""}`), name: e.strVenue, city: e.strCity ?? null, state: null, country: e.strCountry ?? null, indoor: true }
      : null,
    season_year: Number(String(e.strSeason ?? e.dateEvent).slice(0, 4)) || null,
    season_type: null,
    week: null,
    broadcasts: e.strTVStation ? [e.strTVStation] : [],
    competitions: [{
      external_id: String(e.idEvent),
      label: e.strDescriptionEN ? String(e.strDescriptionEN).slice(0, 60) : null,
      starts_at: startsAt,
      status,
      status_detail: e.strStatus ?? null,
      period: null,
      clock: null,
      order_index: 0,
      is_main_event: true,
      scheduled_rounds: null,
      result_method: method,
      result_round: null,
      result_time: null,
      situation: null,
      competitors,
      odds: [],
    }],
  };
}

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const [lg] = await loadLeagues(db, ["boxing"]);
  if (!lg?.thesportsdb_id) return json({ ok: false, error: "liga boxing sin thesportsdb_id" });

  const result = await track(db, "sync-boxing", "boxing", async () => {
    const [next, past] = await Promise.all([
      get(`eventsnextleague.php?id=${lg.thesportsdb_id}`),
      get(`eventspastleague.php?id=${lg.thesportsdb_id}`),
    ]);
    const raw = [...(next?.events ?? []), ...(past?.events ?? [])];
    const events = (await Promise.all(raw.map(toEvent))).filter((x): x is NEvent => x !== null);
    return await ingestEvents(db, { ...lg, kind: "combat" }, events, { source: "thesportsdb" });
  });
  return json({ ok: true, result });
});
