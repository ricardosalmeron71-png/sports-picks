// =====================================================================
// Cliente + normalizador de la API pública de ESPN.
// Código puro (sin dependencias de Deno/Supabase) para poder probarse
// también con Node.
// =====================================================================

export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "canceled" | "delayed";

export interface LeagueConf {
  id: string; // 'nfl'
  kind: "team" | "combat" | "racing";
  espn_sport: string | null;
  espn_league: string | null;
}

export interface NVenue {
  external_id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  indoor: boolean | null;
}

export interface NTeam {
  external_id: string;
  name: string;
  display_name: string;
  abbreviation: string | null;
  location: string | null;
  logo_url: string | null;
  color: string | null;
  alt_color: string | null;
}

export interface NAthlete {
  external_id: string;
  full_name: string;
  display_name: string;
  short_name: string | null;
  headshot_url: string | null;
  flag_url: string | null;
  country: string | null;
}

export interface NCompetitor {
  team: NTeam | null;
  athlete: NAthlete | null;
  home_away: "home" | "away" | null;
  order_index: number;
  score: number | null;
  is_winner: boolean | null;
  record_summary: string | null;
  linescores: number[];
  stats: Record<string, string>;
  leaders: { category: string; value: string; athlete: string; athlete_external_id: string | null; headshot: string | null }[];
}

export interface NOdds {
  bookmaker: string;
  market: "h2h" | "spreads" | "totals";
  side: "home" | "away" | "over" | "under";
  price: number;
  point: number | null;
  open_price: number | null;
  open_point: number | null;
}

export interface NCompetition {
  external_id: string;
  label: string | null;
  starts_at: string;
  status: GameStatus;
  status_detail: string | null;
  period: number | null;
  clock: string | null;
  order_index: number;
  is_main_event: boolean;
  scheduled_rounds: number | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
  situation: Record<string, unknown> | null;
  competitors: NCompetitor[];
  odds: NOdds[];
}

export interface NEvent {
  external_id: string;
  name: string;
  short_name: string | null;
  starts_at: string;
  ends_at: string | null;
  venue: NVenue | null;
  season_year: number | null;
  season_type: number | null;
  week: number | null;
  broadcasts: string[];
  competitions: NCompetition[];
}

const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const SITE_V2 = "https://site.api.espn.com/apis/v2/sports";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports";

// deno-lint-ignore no-explicit-any
type Any = any;

export async function getJson(url: string, retries = 2): Promise<Any> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "SportsPicks/1.0" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** yyyymmdd en la zona horaria del calendario de ESPN (EE.UU. Este, aprox UTC-5). */
export function espnDate(d: Date): string {
  const shifted = new Date(d.getTime() - 5 * 3600_000);
  return shifted.toISOString().slice(0, 10).replaceAll("-", "");
}

export function headshotFor(league: LeagueConf, athleteId: string): string | null {
  const folder = league.espn_sport === "mma" ? "mma" : league.espn_sport === "racing" ? "rpm" : league.espn_league;
  return folder ? `https://a.espncdn.com/i/headshots/${folder}/players/full/${athleteId}.png` : null;
}

export function mapStatus(type: Any): GameStatus {
  const name: string = type?.name ?? "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "canceled";
  if (name.includes("DELAYED") || name.includes("RAIN_DELAY") || name.includes("SUSPENDED")) return "delayed";
  switch (type?.state) {
    case "in":
      return "live";
    case "post":
      return "final";
    default:
      return "scheduled";
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/^[ou]/i, ""));
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const iso = (s: string | null | undefined): string | null => (s ? new Date(s).toISOString() : null);

function parseVenue(v: Any): NVenue | null {
  if (!v?.id) return null;
  return {
    external_id: String(v.id),
    name: v.fullName ?? v.name ?? "—",
    city: v.address?.city ?? null,
    state: v.address?.state ?? null,
    country: v.address?.country ?? null,
    indoor: typeof v.indoor === "boolean" ? v.indoor : null,
  };
}

export function parseTeam(t: Any): NTeam {
  const logos: Any[] = t.logos ?? [];
  const logo = t.logo ?? logos.find((l) => !(l.rel ?? []).includes("dark"))?.href ?? logos[0]?.href ?? null;
  return {
    external_id: String(t.id),
    name: t.name ?? t.shortDisplayName ?? t.displayName,
    display_name: t.displayName ?? t.name,
    abbreviation: t.abbreviation ?? null,
    location: t.location ?? null,
    logo_url: logo,
    color: t.color ?? null,
    alt_color: t.alternateColor ?? null,
  };
}

function parseLeaders(leaders: Any[] | undefined): NCompetitor["leaders"] {
  if (!Array.isArray(leaders)) return [];
  return leaders.slice(0, 4).flatMap((cat: Any) => {
    const top = cat.leaders?.[0];
    if (!top) return [];
    return [{
      category: cat.shortDisplayName ?? cat.displayName ?? cat.name,
      value: top.displayValue ?? String(top.value ?? ""),
      athlete: top.athlete?.shortName ?? top.athlete?.displayName ?? "",
      athlete_external_id: top.athlete?.id ? String(top.athlete.id) : null,
      headshot: top.athlete?.headshot ?? null,
    }];
  });
}

function parseCompetitor(c: Any, league: LeagueConf): NCompetitor {
  const records: Any[] = c.records ?? [];
  const overall = records.find((r) => r.type === "total" || r.name === "overall") ?? records[0];
  const stats: Record<string, string> = {};
  for (const s of c.statistics ?? []) {
    if (s?.name && s.displayValue !== undefined) stats[s.name] = String(s.displayValue);
  }
  if (c.hits !== undefined) stats.hits = String(c.hits);
  if (c.errors !== undefined) stats.errors = String(c.errors);

  let athlete: NAthlete | null = null;
  if (c.athlete) {
    const id = String(c.id ?? c.athlete.id);
    athlete = {
      external_id: id,
      full_name: c.athlete.fullName ?? c.athlete.displayName,
      display_name: c.athlete.displayName ?? c.athlete.fullName,
      short_name: c.athlete.shortName ?? null,
      headshot_url: c.athlete.headshot?.href ?? headshotFor(league, id),
      flag_url: c.athlete.flag?.href ?? null,
      country: c.athlete.flag?.alt ?? null,
    };
  }
  return {
    team: c.team ? parseTeam(c.team) : null,
    athlete,
    home_away: c.homeAway === "home" || c.homeAway === "away" ? c.homeAway : null,
    order_index: int(c.order) ?? 0,
    score: league.kind === "team" ? num(c.score) : null,
    is_winner: typeof c.winner === "boolean" ? c.winner : null,
    record_summary: overall?.summary ?? null,
    linescores: (c.linescores ?? []).map((l: Any) => num(l.value) ?? 0),
    stats,
    leaders: parseLeaders(c.leaders),
  };
}

function american(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "EVEN" || s === "EV") return 100;
  const n = parseInt(s.replace("+", ""), 10);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Momios incrustados por ESPN (proveedor principal: DraftKings / ESPN BET). */
function parseEspnOdds(odds: Any[] | undefined): NOdds[] {
  if (!Array.isArray(odds) || odds.length === 0) return [];
  const out: NOdds[] = [];
  for (const o of odds.slice(0, 2)) {
    const book = String(o.provider?.displayName ?? o.provider?.name ?? "espn").toLowerCase().replace(/\s+/g, "");
    const push = (market: NOdds["market"], side: NOdds["side"], node: Any) => {
      const price = american(node?.close?.odds ?? node?.current?.odds);
      if (price === null) return;
      out.push({
        bookmaker: book,
        market,
        side,
        price,
        point: num(node?.close?.line ?? node?.current?.line),
        open_price: american(node?.open?.odds),
        open_point: num(node?.open?.line),
      });
    };
    push("h2h", "home", o.moneyline?.home);
    push("h2h", "away", o.moneyline?.away);
    push("spreads", "home", o.pointSpread?.home);
    push("spreads", "away", o.pointSpread?.away);
    push("totals", "over", o.total?.over);
    push("totals", "under", o.total?.under);
    // Formato antiguo de ESPN (sin moneyline detallado)
    if (!o.moneyline && (o.homeTeamOdds?.moneyLine || o.awayTeamOdds?.moneyLine)) {
      const h = american(o.homeTeamOdds?.moneyLine), a = american(o.awayTeamOdds?.moneyLine);
      if (h) out.push({ bookmaker: book, market: "h2h", side: "home", price: h, point: null, open_price: null, open_point: null });
      if (a) out.push({ bookmaker: book, market: "h2h", side: "away", price: a, point: null, open_price: null, open_point: null });
    }
  }
  return out;
}

function parseSituation(s: Any): Record<string, unknown> | null {
  if (!s) return null;
  const keep = ["downDistanceText", "shortDownDistanceText", "possession", "isRedZone", "balls", "strikes", "outs",
    "onFirst", "onSecond", "onThird", "homeTimeouts", "awayTimeouts"];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (s[k] !== undefined) out[k] = s[k];
  if (s.lastPlay?.text) out.lastPlay = s.lastPlay.text;
  return Object.keys(out).length ? out : null;
}

export function parseEvent(e: Any, league: LeagueConf): NEvent {
  const comps: Any[] = e.competitions ?? [];
  const firstVenue = comps.find((c) => c.venue)?.venue ?? e.venues?.[0] ?? e.circuit;
  const broadcasts = new Set<string>();
  for (const c of comps) for (const b of c.broadcasts ?? []) for (const n of b.names ?? []) broadcasts.add(n);

  const competitions: NCompetition[] = comps.map((c: Any, idx: number) => {
    const st = c.status ?? e.status ?? {};
    const status = mapStatus(st.type);
    const competitors = (c.competitors ?? []).map((x: Any) => parseCompetitor(x, league));
    if (status === "scheduled" || status === "postponed") for (const x of competitors) x.score = null;
    return {
      external_id: String(c.id),
      label: league.kind === "team" ? (c.notes?.[0]?.headline ?? null) : (c.type?.abbreviation ?? c.type?.text ?? null),
      starts_at: iso(c.date ?? c.startDate ?? e.date)!,
      status,
      status_detail: st.type?.shortDetail ?? st.type?.detail ?? null,
      period: int(st.period),
      clock: st.displayClock ?? null,
      order_index: idx,
      is_main_event: league.kind === "combat" ? idx === comps.length - 1 : league.kind === "team",
      scheduled_rounds: int(c.format?.regulation?.periods),
      result_method: st.result?.displayName ?? null,
      result_round: st.result ? int(st.period) : null,
      result_time: st.result ? (st.displayClock ?? null) : null,
      situation: parseSituation(c.situation),
      competitors,
      odds: parseEspnOdds(c.odds),
    };
  });

  return {
    external_id: String(e.id),
    name: e.name,
    short_name: e.shortName ?? null,
    starts_at: iso(e.date)!,
    ends_at: iso(e.endDate),
    venue: parseVenue(firstVenue),
    season_year: int(e.season?.year),
    season_type: int(e.season?.type),
    week: int(e.week?.number),
    broadcasts: [...broadcasts],
    competitions,
  };
}

/** Scoreboard de una fecha (yyyymmdd), rango (yyyymmdd-yyyymmdd) o el actual (sin fecha). */
export async function fetchScoreboard(league: LeagueConf, dates?: string): Promise<NEvent[]> {
  if (!league.espn_sport || !league.espn_league) return [];
  const qs = new URLSearchParams({ limit: "500" });
  if (dates) qs.set("dates", dates);
  const data = await getJson(`${SITE}/${league.espn_sport}/${league.espn_league}/scoreboard?${qs}`);
  return (data?.events ?? []).map((e: Any) => parseEvent(e, league));
}

/**
 * Calendario en una ventana de días. Combate/carreras aceptan rangos; los deportes
 * de equipo se piden día por día (ESPN rechaza rangos largos en esas ligas).
 */
export async function fetchWindow(league: LeagueConf, daysBack: number, daysAhead: number): Promise<NEvent[]> {
  const now = Date.now();
  const from = new Date(now - daysBack * 86400_000);
  const to = new Date(now + daysAhead * 86400_000);
  if (league.kind !== "team") {
    try {
      const evs = await fetchScoreboard(league, `${espnDate(from)}-${espnDate(to)}`);
      if (evs.length) return evs;
    } catch (_) { /* cae a día por día */ }
  }
  const days: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86400_000) days.push(espnDate(new Date(t)));
  const out = new Map<string, NEvent>();
  await pool(days, 6, async (d) => {
    for (const ev of await fetchScoreboard(league, d)) out.set(ev.external_id, ev);
  });
  return [...out.values()];
}

/** Detalle UFC (cartelera principal/preliminar, método de victoria, peleas por título). */
export async function fetchFightCenter(eventId: string) {
  const d = await getJson(`${WEB}/mma/ufc/fightcenter/${eventId}`);
  const out = new Map<string, { card_segment: string | null; result_method: string | null; result_round: number | null; result_time: string | null; is_title_fight: boolean; match_number: number | null }>();
  if (!d?.cards) return out;
  for (const seg of Object.values<Any>(d.cards)) {
    for (const c of seg.competitions ?? []) {
      const st = c.status ?? {};
      out.set(String(c.id), {
        card_segment: seg.cardSegment ?? c.cardSegment?.name ?? null,
        result_method: st.result?.displayName ?? null,
        result_round: st.result ? int(st.period) : null,
        result_time: st.result ? (st.displayClock ?? null) : null,
        is_title_fight: /title/i.test(c.note ?? "") || /title/i.test(c.type?.text ?? ""),
        match_number: int(c.matchNumber),
      });
    }
  }
  return out;
}

export async function fetchTeams(league: LeagueConf): Promise<NTeam[]> {
  const d = await getJson(`${SITE}/${league.espn_sport}/${league.espn_league}/teams?limit=100`);
  return (d?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t: Any) => parseTeam(t.team));
}

export interface NRosterAthlete {
  external_id: string;
  full_name: string;
  display_name: string;
  short_name: string | null;
  headshot_url: string | null;
  position: string | null;
  jersey: string | null;
  age: number | null;
  height: string | null;
  weight: string | null;
  birth_date: string | null;
  country: string | null;
  flag_url: string | null;
}

export async function fetchRoster(league: LeagueConf, teamExternalId: string): Promise<NRosterAthlete[]> {
  const d = await getJson(`${SITE}/${league.espn_sport}/${league.espn_league}/teams/${teamExternalId}/roster`);
  if (!d?.athletes) return [];
  // NFL agrupa por unidad (offense/defense/special) → items[]
  const flat: Any[] = d.athletes.flatMap((a: Any) => (Array.isArray(a.items) ? a.items : [a]));
  return flat.map((a: Any) => ({
    external_id: String(a.id),
    full_name: a.fullName ?? a.displayName,
    display_name: a.displayName ?? a.fullName,
    short_name: a.shortName ?? null,
    headshot_url: a.headshot?.href ?? headshotFor(league, String(a.id)),
    position: a.position?.abbreviation ?? a.position?.displayName ?? null,
    jersey: a.jersey ?? null,
    age: int(a.age),
    height: a.displayHeight ?? null,
    weight: a.displayWeight ?? null,
    birth_date: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : null,
    country: a.birthPlace?.country ?? null,
    flag_url: a.flag?.href ?? null,
  }));
}

export interface NStanding {
  group_name: string;
  team_external_id: string | null;
  athlete: NAthlete | null;
  rank: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  win_pct: number | null;
  points: number | null;
  games_behind: string | null;
  streak: string | null;
  stats: Record<string, string>;
}

export async function fetchStandings(league: LeagueConf): Promise<{ season: number | null; rows: NStanding[] }> {
  const d = await getJson(`${SITE_V2}/${league.espn_sport}/${league.espn_league}/standings`);
  const rows: NStanding[] = [];
  let season: number | null = int(d?.season?.year) ?? null;
  const walk = (node: Any, groupName: string) => {
    if (node?.standings?.entries) {
      season = season ?? int(node.standings.season);
      node.standings.entries.forEach((e: Any, i: number) => {
        const stats: Record<string, string> = {};
        for (const s of e.stats ?? []) if (s.name) stats[s.name] = String(s.displayValue ?? s.value ?? "");
        const a = e.athlete;
        rows.push({
          group_name: groupName,
          team_external_id: e.team?.id ? String(e.team.id) : null,
          athlete: a
            ? {
              external_id: String(a.id),
              full_name: a.displayName ?? a.name,
              display_name: a.displayName ?? a.name,
              short_name: a.shortName ?? null,
              headshot_url: headshotFor(league, String(a.id)),
              flag_url: a.flag?.href ?? null,
              country: a.flag?.alt ?? null,
            }
            : null,
          rank: int(stats.rank) ?? int(stats.playoffSeed) ?? i + 1,
          wins: int(stats.wins),
          losses: int(stats.losses),
          ties: int(stats.ties),
          win_pct: num(stats.winPercent),
          points: num(stats.championshipPts ?? stats.points),
          games_behind: stats.gamesBehind ?? null,
          streak: stats.streak ?? null,
          stats,
        });
      });
    }
    for (const ch of node?.children ?? []) walk(ch, ch.name ?? groupName);
  };
  walk(d, d?.name ?? league.id);
  return { season: season ?? new Date().getUTCFullYear(), rows };
}

/** Perfil de atleta: resumen de estadísticas + gamelog (para gráficos de tendencia). */
export async function fetchAthleteProfile(league: LeagueConf, athleteId: string) {
  const base = `${WEB}/${league.espn_sport}/${league.espn_league}/athletes/${athleteId}`;
  const [info, stats, gamelog] = await Promise.all([
    getJson(base).catch(() => null),
    league.kind === "team" ? getJson(`${base}/stats`).catch(() => null) : Promise.resolve(null),
    league.kind === "team" ? getJson(`${base}/gamelog`).catch(() => null) : Promise.resolve(null),
  ]);
  const a = info?.athlete ?? {};
  const summary: Record<string, string> = {};
  for (const s of a.statsSummary?.statistics ?? []) summary[s.abbreviation ?? s.name] = String(s.displayValue);

  // Promedios de la temporada más reciente por categoría
  const season: Record<string, Record<string, string>> = {};
  for (const cat of stats?.categories ?? []) {
    const last = cat.statistics?.[cat.statistics.length - 1];
    if (!last) continue;
    const row: Record<string, string> = {};
    (cat.labels ?? []).forEach((lab: string, i: number) => (row[lab] = String(last.stats?.[i] ?? "")));
    season[cat.displayName ?? cat.name] = row;
  }

  // Gamelog: últimos 20 juegos [{eventId, date, opponent, values{label: value}}]
  const games: { event_id: string; date: string | null; opponent: string | null; result: string | null; values: Record<string, number | string> }[] = [];
  if (gamelog?.labels) {
    const labels: string[] = gamelog.labels;
    for (const st of gamelog.seasonTypes ?? []) {
      for (const cat of st.categories ?? []) {
        for (const ev of cat.events ?? []) {
          const meta = gamelog.events?.[ev.eventId] ?? {};
          const values: Record<string, number | string> = {};
          labels.forEach((lab, i) => {
            const raw = ev.stats?.[i];
            const n = Number(raw);
            values[lab] = Number.isFinite(n) && !String(raw).includes("-") ? n : raw;
          });
          games.push({
            event_id: String(ev.eventId),
            date: meta.gameDate ?? null,
            opponent: meta.opponent?.abbreviation ?? null,
            result: meta.gameResult ?? null,
            values,
          });
        }
      }
    }
  }
  games.sort((x, y) => (x.date ?? "").localeCompare(y.date ?? ""));

  return {
    nickname: a.nickname ?? null,
    weight_class: a.weightClass?.text ?? null,
    height: a.displayHeight ?? null,
    weight: a.displayWeight ?? null,
    reach: a.displayReach ?? null,
    stance: a.stance?.text ?? a.stance ?? null,
    age: int(a.age),
    headshot_url: a.headshot?.href ?? null,
    flag_url: a.flag?.href ?? null,
    country: a.citizenship ?? a.flag?.alt ?? null,
    record_summary: summary["W-L-D"] ?? null,
    stats: { summary, season },
    gamelog: games.slice(-20),
  };
}

export async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift()!;
      try {
        await fn(it);
      } catch (e) {
        console.error("pool item failed", e);
      }
    }
  });
  await Promise.all(workers);
}

/** Estadísticas de temporada de un equipo → { categoría: { etiqueta: valor } } */
export async function fetchTeamStats(league: LeagueConf, teamExternalId: string): Promise<Record<string, Record<string, string>>> {
  const d = await getJson(`${SITE}/${league.espn_sport}/${league.espn_league}/teams/${teamExternalId}/statistics`);
  const out: Record<string, Record<string, string>> = {};
  for (const cat of d?.results?.stats?.categories ?? []) {
    const row: Record<string, string> = {};
    for (const s of cat.stats ?? []) row[s.shortDisplayName ?? s.abbreviation ?? s.name] = String(s.displayValue ?? s.value);
    out[cat.displayName ?? cat.name] = row;
  }
  return out;
}
