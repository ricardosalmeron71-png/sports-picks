// =====================================================================
// Escritura idempotente de eventos normalizados en Postgres.
// Orden pensado para los triggers en vivo:
//   1) venues / equipos / atletas / eventos
//   2) competencias (campos estáticos)
//   3) competidores (marcadores, ganador)       ← antes del status
//   4) competencias (status, reloj, líder, resultado) → dispara notificaciones
//      y calificación de picks con los marcadores ya guardados.
// Solo se escriben filas que cambiaron (menos ruido en Realtime).
// =====================================================================
import type { FighterDetail, LeagueConf, NAthlete, NEvent, NTeam } from "./espn.ts";
import { changedRows, chunk, type DB, uniqBy } from "./db.ts";

type Row = Record<string, unknown>;

export interface FightDetail {
  card_segment: string | null;
  result_method: string | null;
  result_round: number | null;
  result_time: string | null;
  is_title_fight: boolean;
  fighters?: Map<string, FighterDetail>;
}

export interface IngestOptions {
  withOdds?: boolean;
  fightDetails?: Map<string, FightDetail>;
  source?: string;
}

async function upsertReturning(db: DB, table: string, rows: Row[], onConflict: string, select: string): Promise<Row[]> {
  const out: Row[] = [];
  for (const part of chunk(rows, 500)) {
    const { data, error } = await db.from(table).upsert(part, { onConflict }).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
  }
  return out;
}

async function selectIn(db: DB, table: string, select: string, col: string, values: string[], extra?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (const part of chunk([...new Set(values)], 150)) {
    let q = db.from(table).select(select).in(col, part);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
  }
  return out;
}

export async function upsertTeams(db: DB, leagueId: string, teams: NTeam[]): Promise<Map<string, string>> {
  const rows = uniqBy(teams, (t) => t.external_id).map((t) => ({
    league_id: leagueId,
    external_id: t.external_id,
    name: t.name,
    display_name: t.display_name,
    abbreviation: t.abbreviation,
    location: t.location,
    logo_url: t.logo_url,
    color: t.color,
    alt_color: t.alt_color,
  }));
  const map = new Map<string, string>();
  if (!rows.length) return map;
  const existing = await selectIn(db, "teams", "id, external_id, name, display_name, abbreviation, location, logo_url, color, alt_color", "external_id", rows.map((r) => r.external_id), (q) => q.eq("league_id", leagueId));
  const exMap = new Map(existing.map((r) => [String(r.external_id), r]));
  for (const r of existing) map.set(String(r.external_id), String(r.id));
  // No pisar un logo bueno con null
  for (const r of rows) {
    const old = exMap.get(r.external_id);
    if (old && !r.logo_url) r.logo_url = old.logo_url as string | null;
  }
  const changed = changedRows(rows, exMap, (r) => r.external_id);
  if (changed.length) {
    for (const r of await upsertReturning(db, "teams", changed, "league_id,external_id", "id, external_id")) {
      map.set(String(r.external_id), String(r.id));
    }
  }
  return map;
}

export async function upsertAthletes(db: DB, leagueId: string, athletes: (NAthlete | Row)[]): Promise<Map<string, string>> {
  const rows = uniqBy(athletes as Row[], (a) => String(a.external_id)).map((a) => {
    const r: Row = { ...a, league_id: leagueId };
    for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
    return r;
  });
  const map = new Map<string, string>();
  if (!rows.length) return map;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  // PostgREST exige las mismas llaves en todas las filas
  for (const r of rows) for (const c of cols) if (!(c in r)) r[c] = null;
  const existing = await selectIn(db, "athletes", ["id", ...cols].join(","), "external_id", rows.map((r) => String(r.external_id)), (q) => q.eq("league_id", leagueId));
  const exMap = new Map(existing.map((r) => [String(r.external_id), r]));
  for (const r of existing) map.set(String(r.external_id), String(r.id));
  for (const r of rows) {
    const old = exMap.get(String(r.external_id));
    if (!old) continue;
    // conservar datos enriquecidos si la fuente actual no los trae
    for (const c of cols) if (r[c] === null && old[c] !== null && old[c] !== undefined) r[c] = old[c];
  }
  const changed = changedRows(rows, exMap, (r) => String(r.external_id));
  if (changed.length) {
    for (const r of await upsertReturning(db, "athletes", changed, "league_id,external_id", "id, external_id")) {
      map.set(String(r.external_id), String(r.id));
    }
  }
  return map;
}

export async function ingestEvents(db: DB, league: LeagueConf, events: NEvent[], opts: IngestOptions = {}): Promise<number> {
  if (!events.length) return 0;
  const source = opts.source ?? "espn";
  const leagueId = league.id;

  // 1) Venues
  const venues = uniqBy(events.flatMap((e) => (e.venue ? [e.venue] : [])), (v) => v.external_id);
  const venueMap = new Map<string, string>();
  if (venues.length) {
    const rows = venues.map((v) => ({ ...v, source }));
    for (const r of await upsertReturning(db, "venues", rows, "source,external_id", "id, external_id")) {
      venueMap.set(String(r.external_id), String(r.id));
    }
  }

  // 2) Equipos / atletas
  const allComps = events.flatMap((e) => e.competitions);
  const allCompetitors = allComps.flatMap((c) => c.competitors);
  const teamMap = await upsertTeams(db, leagueId, allCompetitors.flatMap((c) => (c.team ? [c.team] : [])));
  // Datos por peleador desde fightcenter (UFC): bio, estadísticas, momios
  const fighterInfo = new Map<string, FighterDetail>();
  for (const fd of opts.fightDetails?.values() ?? []) for (const [id, f] of fd.fighters ?? []) fighterInfo.set(id, f);

  const athleteMap = await upsertAthletes(
    db,
    leagueId,
    allCompetitors.flatMap((c) => {
      if (!c.athlete) return [];
      const bio = fighterInfo.get(c.athlete.external_id)?.bio;
      return [{
        ...c.athlete,
        ...(league.kind === "combat" && c.record_summary ? { record_summary: c.record_summary } : {}),
        ...(bio ? { height: bio.height, weight: bio.weight, reach: bio.reach, stance: bio.stance, age: bio.age, weight_class: bio.weight_class } : {}),
      }];
    }),
  );

  // 3) Eventos
  const eventRows = events.map((e) => ({
    league_id: leagueId,
    source,
    external_id: e.external_id,
    name: e.name,
    short_name: e.short_name,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    venue_id: e.venue ? venueMap.get(e.venue.external_id) ?? null : null,
    season_year: e.season_year,
    season_type: e.season_type,
    week: e.week,
    broadcasts: e.broadcasts,
  }));
  const exEvents = await selectIn(db, "events", "id, external_id, name, short_name, starts_at, ends_at, venue_id, season_year, season_type, week, broadcasts, league_id, source", "external_id", eventRows.map((r) => r.external_id), (q) => q.eq("league_id", leagueId).eq("source", source));
  const exEvMap = new Map(exEvents.map((r) => [String(r.external_id), r]));
  const eventMap = new Map(exEvents.map((r) => [String(r.external_id), String(r.id)]));
  const evChanged = changedRows(eventRows, exEvMap, (r) => r.external_id);
  if (evChanged.length) {
    for (const r of await upsertReturning(db, "events", evChanged, "league_id,source,external_id", "id, external_id")) {
      eventMap.set(String(r.external_id), String(r.id));
    }
  }

  // 4) Competencias – fase estática
  const compKey = (extId: string) => (source === "espn" ? extId : `${source}:${extId}`);
  const staticRows: Row[] = [];
  const dynamicRows: Row[] = [];
  for (const e of events) {
    const eventId = eventMap.get(e.external_id)!;
    for (const c of e.competitions) {
      const fd = opts.fightDetails?.get(c.external_id);
      const base = { league_id: leagueId, external_id: compKey(c.external_id), event_id: eventId, starts_at: c.starts_at };
      staticRows.push({
        ...base,
        label: c.label,
        order_index: c.order_index,
        is_main_event: c.is_main_event,
        scheduled_rounds: c.scheduled_rounds,
        ...(fd ? { card_segment: fd.card_segment, is_title_fight: fd.is_title_fight } : {}),
      });
      dynamicRows.push({
        ...base,
        status: c.status,
        status_detail: c.status_detail,
        period: c.period,
        clock: c.clock,
        situation: c.situation,
        result_method: fd?.result_method ?? c.result_method,
        result_round: fd?.result_round ?? c.result_round,
        result_time: fd?.result_time ?? c.result_time,
      });
    }
  }
  const staticCols = [...new Set(staticRows.flatMap((r) => Object.keys(r)))];
  for (const r of staticRows) for (const c of staticCols) if (!(c in r)) r[c] = null;

  const exComps = await selectIn(db, "competitions", "*", "external_id", staticRows.map((r) => String(r.external_id)), (q) => q.eq("league_id", leagueId));
  const exCompMap = new Map(exComps.map((r) => [String(r.external_id), r]));
  const compMap = new Map(exComps.map((r) => [String(r.external_id), String(r.id)]));
  // no borrar card_segment/is_title_fight ya conocidos cuando no hay fightcenter
  for (const r of staticRows) {
    const old = exCompMap.get(String(r.external_id));
    if (old && r.card_segment === null) r.card_segment = old.card_segment;
    if (old && r.is_title_fight === null) r.is_title_fight = old.is_title_fight;
    if (r.is_title_fight === null) r.is_title_fight = false;
  }
  const stChanged = changedRows(staticRows, exCompMap, (r) => String(r.external_id));
  if (stChanged.length) {
    for (const r of await upsertReturning(db, "competitions", stChanged, "league_id,external_id", "id, external_id")) {
      compMap.set(String(r.external_id), String(r.id));
    }
  }

  // 5) Competidores
  const competitorRows: Row[] = [];
  for (const e of events) {
    for (const c of e.competitions) {
      const competitionId = compMap.get(compKey(c.external_id));
      if (!competitionId) continue;
      for (const k of c.competitors) {
        const team_id = k.team ? teamMap.get(k.team.external_id) ?? null : null;
        const athlete_id = !team_id && k.athlete ? athleteMap.get(k.athlete.external_id) ?? null : null;
        if (!team_id && !athlete_id) continue;
        competitorRows.push({
          competition_id: competitionId,
          team_id,
          athlete_id,
          home_away: k.home_away,
          order_index: k.order_index,
          score: k.score,
          is_winner: k.is_winner,
          record_summary: k.record_summary,
          linescores: k.linescores,
          stats: k.athlete && fighterInfo.has(k.athlete.external_id) ? { ...k.stats, ...fighterInfo.get(k.athlete.external_id)!.stats } : k.stats,
          leaders: k.leaders,
        });
      }
    }
  }
  const exCompetitors = await selectIn(db, "competitors", "id, competition_id, team_id, athlete_id, home_away, order_index, score, is_winner, record_summary, linescores, stats, leaders", "competition_id", [...compMap.values()]);
  const ck = (r: Row) => `${r.competition_id}|${r.team_id ?? r.athlete_id}`;
  const exCmpMap = new Map(exCompetitors.map((r) => [ck(r), r]));
  // Conservar promedios de carrera ("c_*") y momios por método ("o_*") de antes de la pelea:
  // durante la pelea ESPN los reemplaza por las estadísticas en vivo.
  for (const r of competitorRows) {
    const oldStats = (exCmpMap.get(ck(r))?.stats ?? {}) as Record<string, string>;
    const keep = Object.fromEntries(Object.entries(oldStats).filter(([k]) => k.startsWith("c_") || k.startsWith("o_")));
    if (Object.keys(keep).length) r.stats = { ...keep, ...(r.stats as Record<string, string>) };
  }
  const competitorIds = new Map(exCompetitors.map((r) => [ck(r), String(r.id)]));
  const cmpChanged = changedRows(competitorRows, exCmpMap, ck);
  if (cmpChanged.length) {
    for (const r of await upsertReturning(db, "competitors", cmpChanged, "competition_id,entity_key", "id, competition_id, team_id, athlete_id")) {
      competitorIds.set(ck(r), String(r.id));
    }
  }

  // 6) Competencias – fase dinámica (+ líder para alertas)
  for (const r of dynamicRows) {
    const competitionId = compMap.get(String(r.external_id));
    const old = exCompMap.get(String(r.external_id));
    const mine = competitorRows.filter((x) => x.competition_id === competitionId);
    let leader = (old?.leader_competitor_id as string | null) ?? null;
    if (league.kind === "team" && mine.length === 2 && r.status === "live") {
      const [a, b] = mine;
      const sa = Number(a.score ?? 0), sb = Number(b.score ?? 0);
      if (sa > sb) leader = competitorIds.get(ck(a)) ?? leader;
      else if (sb > sa) leader = competitorIds.get(ck(b)) ?? leader;
    }
    r.leader_competitor_id = leader;
  }
  const dynChanged = changedRows(dynamicRows, exCompMap, (r) => String(r.external_id));
  if (dynChanged.length) await upsertReturning(db, "competitions", dynChanged, "league_id,external_id", "id");

  // 7) Momios incrustados (ESPN / DraftKings)
  let oddsCount = 0;
  if (opts.withOdds || opts.fightDetails?.size) {
    const oddsRows: Row[] = [];
    // Momios de peleas (DraftKings vía fightcenter)
    for (const e of events) {
      for (const c of e.competitions) {
        const competitionId = compMap.get(compKey(c.external_id));
        if (!competitionId || c.status !== "scheduled") continue;
        for (const k of c.competitors) {
          const f = k.athlete ? fighterInfo.get(k.athlete.external_id) : undefined;
          const aid = k.athlete ? athleteMap.get(k.athlete.external_id) : undefined;
          if (!f?.moneyline || !aid) continue;
          oddsRows.push({
            competition_id: competitionId, bookmaker: "draftkings", market: "h2h",
            competitor_id: competitorIds.get(`${competitionId}|${aid}`) ?? null,
            outcome: k.athlete!.display_name, price: f.moneyline, point: null,
            open_price: null, open_point: null, updated_at: new Date().toISOString(),
          });
        }
      }
    }
    for (const e of events) {
      for (const c of e.competitions) {
        const competitionId = compMap.get(compKey(c.external_id));
        if (!competitionId || !c.odds.length || c.status !== "scheduled") continue;
        const bySide = (side: "home" | "away") => {
          const k = c.competitors.find((x) => x.home_away === side);
          if (!k?.team) return null;
          const tid = teamMap.get(k.team.external_id);
          return tid ? { id: competitorIds.get(`${competitionId}|${tid}`) ?? null, name: k.team.display_name } : null;
        };
        for (const o of c.odds) {
          const who = o.side === "home" || o.side === "away" ? bySide(o.side) : null;
          oddsRows.push({
            competition_id: competitionId,
            bookmaker: o.bookmaker,
            market: o.market,
            competitor_id: who?.id ?? null,
            outcome: who?.name ?? (o.side === "over" ? "Over" : o.side === "under" ? "Under" : o.side),
            price: o.price,
            point: o.point,
            open_price: o.open_price,
            open_point: o.open_point,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
    const rows = uniqBy(oddsRows, (r) => `${r.competition_id}|${r.bookmaker}|${r.market}|${r.outcome}`);
    for (const part of chunk(rows, 500)) {
      const { error } = await db.from("odds").upsert(part, { onConflict: "competition_id,bookmaker,market,outcome" });
      if (error) throw new Error(`odds: ${error.message}`);
    }
    oddsCount = rows.length;
  }

  return evChanged.length + stChanged.length + cmpChanged.length + dynChanged.length + oddsCount;
}
