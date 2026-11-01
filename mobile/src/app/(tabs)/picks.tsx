// Picks: elige el ganador de todos los juegos de la semana (NFL), del día (NBA/MLB) o de una cartelera (UFC/Box).
// Se puede cambiar libremente hasta presionar "Guardar": al guardar los picks son definitivos.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { competitorImage, competitorName } from "@/components/EventCard";
import { Avatar, Button, Card, Chip, Dim, Empty, H1, LeaguePill, LiveBadge, Loading, TeamLogo } from "@/components/ui";
import { useBestMoneylines, useEvents, useLeagues, useMyGroups, useMyPicks, useSavePicks } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmAsync, showAlert } from "@/lib/dialog";
import { fmtOdds } from "@/lib/odds";
import { colors } from "@/lib/theme";
import { fmtDate, fmtTime, localDayBounds, offsetLabel, relativeDay, statusEs } from "@/lib/time";
import type { Competition, Competitor, LeagueId, SportEvent } from "@/lib/types";

type Mode = "week" | "day" | "event";
const PICK_LEAGUES: LeagueId[] = ["nfl", "nba", "mlb", "ufc", "boxing"];
const MODE: Partial<Record<LeagueId, Mode>> = { nfl: "week", nba: "day", mlb: "day", ufc: "event", boxing: "event" };

interface Game {
  key: string;
  event: SportEvent;
  comp: Competition;
  sides: [Competitor, Competitor];
}

const weekLabel = (e: SportEvent) =>
  e.season_type === 3 ? `Playoffs ${e.week}` : e.season_type === 1 ? `Pretemporada ${e.week}` : `Semana ${e.week}`;

export default function PicksScreen() {
  const params = useLocalSearchParams<{ groupId?: string; league?: string }>();
  const { userId } = useAuth();
  const leagues = useLeagues();
  const groups = useMyGroups(userId);
  const save = useSavePicks();

  const [league, setLeague] = useState<LeagueId>((params.league as LeagueId) || "nfl");
  const [groupId, setGroupId] = useState<string | undefined>(params.groupId);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // competitionId → competitorId elegido
  const mode = MODE[league] ?? "week";

  // Grupos que aceptan esta liga
  const eligible = useMemo(() => (groups.data ?? []).filter((g) => !g.leagues?.length || g.leagues.includes(league)), [groups.data, league]);
  useEffect(() => {
    if (params.groupId) setGroupId(params.groupId);
  }, [params.groupId]);
  useEffect(() => {
    if (!eligible.length) return;
    if (!groupId || !eligible.some((g) => g.id === groupId)) setGroupId(eligible[0].id);
  }, [eligible, groupId]);
  const group = eligible.find((g) => g.id === groupId);

  // Al cambiar de liga / grupo se reinicia la selección
  useEffect(() => {
    setWeekKey(null);
    setEventId(null);
    setDayOffset(0);
    setDrafts({});
  }, [league, groupId]);

  // ---- Datos de juegos -------------------------------------------------
  const base = useMemo(() => Date.now(), []);
  const bounds = useMemo(() => localDayBounds(dayOffset), [dayOffset]);
  const range =
    mode === "week" ? { from: new Date(base - 5 * 86400_000).toISOString(), to: new Date(base + 120 * 86400_000).toISOString() }
    : mode === "day" ? bounds
    : { from: new Date(base - 2 * 86400_000).toISOString(), to: new Date(base + 75 * 86400_000).toISOString() };
  const eventsQ = useEvents({ leagues: [league], ...range });
  const events = eventsQ.data ?? [];

  // Semanas (NFL)
  const weeks = useMemo(() => {
    const m = new Map<string, { key: string; label: string; first: string; events: SportEvent[] }>();
    for (const e of events) {
      if (e.week == null) continue;
      const key = `${e.season_year}-${e.season_type}-${e.week}`;
      const w = m.get(key) ?? { key, label: weekLabel(e), first: e.starts_at, events: [] };
      w.events.push(e);
      if (e.starts_at < w.first) w.first = e.starts_at;
      m.set(key, w);
    }
    return [...m.values()].sort((a, b) => a.first.localeCompare(b.first));
  }, [events]);
  const defaultWeek = useMemo(() => weeks.find((w) => w.events.some((e) => e.status !== "final"))?.key ?? weeks.at(-1)?.key, [weeks]);
  const activeWeek = weeks.find((w) => w.key === (weekKey ?? defaultWeek));

  // Carteleras (UFC / Box): solo las que tienen peleas por jugar o recientes
  const cards = useMemo(() => events.filter((e) => (e.competitions?.length ?? 0) > 0), [events]);
  const defaultCard = useMemo(() => cards.find((e) => e.status !== "final")?.id ?? cards.at(-1)?.id, [cards]);
  const activeCard = cards.find((e) => e.id === (eventId ?? defaultCard));

  const games: Game[] = useMemo(() => {
    const src = mode === "week" ? activeWeek?.events ?? [] : mode === "day" ? events : activeCard ? [activeCard] : [];
    const out: Game[] = [];
    for (const e of src) {
      const comps = mode === "event" ? [...(e.competitions ?? [])].sort((a, b) => b.order_index - a.order_index) : (e.competitions ?? []).slice(0, 1);
      for (const c of comps) {
        const cs = c.competitors ?? [];
        if (cs.length === 2) out.push({ key: c.id, event: e, comp: c, sides: [cs[0], cs[1]] });
      }
    }
    return out.sort((a, b) => (mode === "event" ? 0 : a.comp.starts_at.localeCompare(b.comp.starts_at)));
  }, [mode, activeWeek, events, activeCard]);

  const compIds = useMemo(() => games.map((g) => g.comp.id), [games]);
  const saved = useMyPicks(groupId, userId, compIds);
  const lines = useBestMoneylines(compIds);
  const savedMap = useMemo(() => new Map((saved.data ?? []).map((p) => [p.competition_id, p])), [saved.data]);

  const isOpen = (g: Game) => g.comp.status === "scheduled" && Date.parse(g.comp.starts_at) > Date.now();
  const pending = Object.entries(drafts).filter(([cid]) => games.some((g) => g.comp.id === cid && isOpen(g) && !savedMap.has(cid)));
  const openCount = games.filter((g) => isOpen(g) && !savedMap.has(g.comp.id)).length;
  const savedCount = games.filter((g) => savedMap.has(g.comp.id)).length;

  const choose = (g: Game, k: Competitor) => {
    if (!isOpen(g) || savedMap.has(g.comp.id)) return;
    setDrafts((d) => (d[g.comp.id] === k.id ? Object.fromEntries(Object.entries(d).filter(([c]) => c !== g.comp.id)) : { ...d, [g.comp.id]: k.id }));
  };

  const pickAll = (side: 0 | 1) => {
    const next: Record<string, string> = { ...drafts };
    for (const g of games) if (isOpen(g) && !savedMap.has(g.comp.id)) next[g.comp.id] = g.sides[side].id;
    setDrafts(next);
  };

  const saveAll = async () => {
    if (!groupId || !group) return showAlert("Sin grupo", "Crea o únete a un grupo para hacer picks.");
    const n = pending.length;
    const ok = await confirmAsync(
      `¿Guardar ${n} pick${n > 1 ? "s" : ""}?`,
      `Se guardarán en "${group.name}". Una vez guardados NO podrás cambiarlos.`,
      "Guardar 🔒",
    );
    if (!ok) return;
    const rows = pending.map(([competition_id, selection_competitor_id]) => ({
      group_id: groupId, competition_id, pick_type: "winner" as const, selection_competitor_id, odds_price: lines.data?.get(selection_competitor_id) ?? null,
    }));
    const res = await save.mutateAsync(rows).catch((e: Error) => ({ ok: 0, failed: rows.map((r) => ({ competition_id: r.competition_id, message: e.message })) }));
    const failedIds = new Set(res.failed.map((f) => f.competition_id));
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([c]) => failedIds.has(c))));
    if (res.failed.length) showAlert(`Guardados ${res.ok}, con error ${res.failed.length}`, [...new Set(res.failed.map((f) => f.message))].join("\n"));
    else showAlert("¡Picks guardados! 🔒", `${res.ok} pick${res.ok > 1 ? "s" : ""} registrado${res.ok > 1 ? "s" : ""} en "${group.name}". Ya no se pueden cambiar. ¡Suerte!`);
  };

  // ---- UI --------------------------------------------------------------
  const noGroups = !groups.isLoading && !(groups.data ?? []).length;
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
          <H1>Mis picks</H1>
          <Text style={{ color: colors.textDim, fontSize: 12 }}>Elige al ganador de cada juego y guarda. Horarios en {offsetLabel()}.</Text>
        </View>

        {noGroups ? (
          <Card style={{ marginHorizontal: 16, gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>Primero necesitas un grupo 👥</Text>
            <Dim>Los picks se hacen dentro de un grupo de amigos.</Dim>
            <Button title="Crear grupo" icon="add-circle" onPress={() => router.push("/group/new")} />
            <Button title="Unirme con un código" variant="ghost" icon="key" onPress={() => router.push("/group/join")} />
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {PICK_LEAGUES.map((id) => {
                const l = leagues.data?.find((x) => x.id === id);
                return <LeaguePill key={id} id={id} label={l?.short_name ?? id.toUpperCase()} logo={l?.logo_url} active={league === id} onPress={() => setLeague(id)} />;
              })}
            </ScrollView>

            {eligible.length === 0 && !groups.isLoading ? (
              <Dim style={{ padding: 16 }}>Ninguno de tus grupos incluye esta liga. Cambia la configuración del grupo o elige otra liga.</Dim>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
                  <Text style={{ color: colors.textDim, fontWeight: "800", fontSize: 12 }}>GRUPO</Text>
                  {eligible.map((g) => <Chip key={g.id} label={g.name} active={g.id === groupId} onPress={() => setGroupId(g.id)} />)}
                </ScrollView>

                {/* Selector de semana / día / cartelera */}
                {mode === "week" ? (
                  weeks.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {weeks.map((w) => <Chip key={w.key} label={`${w.label} · ${fmtDate(w.first).slice(4)}`} active={w.key === activeWeek?.key} onPress={() => { setWeekKey(w.key); setDrafts({}); }} />)}
                    </ScrollView>
                  ) : null
                ) : null}
                {mode === "day" ? (
                  <View style={st.dayNav}>
                    <Pressable hitSlop={10} onPress={() => setDayOffset((d) => Math.max(-3, d - 1))}><Ionicons name="chevron-back" size={26} color={colors.primary} /></Pressable>
                    <View style={{ alignItems: "center" }}>
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{relativeDay(new Date(Date.parse(bounds.from) + 3600_000).toISOString())}</Text>
                      <Text style={{ color: colors.textDim, fontSize: 12 }}>{fmtDate(new Date(Date.parse(bounds.from) + 3600_000).toISOString())}</Text>
                    </View>
                    <Pressable hitSlop={10} onPress={() => setDayOffset((d) => Math.min(14, d + 1))}><Ionicons name="chevron-forward" size={26} color={colors.primary} /></Pressable>
                  </View>
                ) : null}
                {mode === "event" ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {cards.map((e) => (
                      <Pressable key={e.id} onPress={() => { setEventId(e.id); setDrafts({}); }} style={[st.card, e.id === activeCard?.id && { borderColor: colors.primary, backgroundColor: colors.cardAlt }]}>
                        <Text style={{ color: colors.text, fontWeight: "800", maxWidth: 190 }} numberOfLines={1}>{e.name}</Text>
                        <Text style={{ color: colors.textDim, fontSize: 11 }}>{fmtDate(e.starts_at)} · {e.competitions?.length ?? 0} peleas</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {games.length > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.textDim, fontSize: 12 }}>
                      {games.length} {mode === "event" ? "peleas" : "juegos"} · <Text style={{ color: colors.win, fontWeight: "800" }}>{savedCount} 🔒</Text>
                    </Text>
                    {openCount > 0 ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Chip label="Todos visitante" onPress={() => pickAll(0)} />
                        <Chip label="Todos local" onPress={() => pickAll(1)} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}

            <View style={{ paddingTop: 8 }}>
              {eventsQ.isLoading ? <Loading /> : games.length ? games.map((g) => (
                <GameRow key={g.key} game={g} combat={mode === "event"} open={isOpen(g)} saved={savedMap.get(g.comp.id)} draft={drafts[g.comp.id]} lines={lines.data} onChoose={choose} />
              )) : eligible.length ? <Empty icon="calendar-outline" title="No hay juegos aquí" subtitle={mode === "day" ? "Prueba con otro día." : "Cuando se publique el calendario aparecerá."} /> : null}
            </View>
          </>
        )}
      </ScrollView>

      {!noGroups && games.length > 0 ? (
        <View style={st.bar}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>{pending.length} por guardar</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{openCount - pending.length > 0 ? `${openCount - pending.length} sin elegir` : openCount === 0 ? "Todo guardado o cerrado" : "¡Todos elegidos!"}</Text>
          </View>
          <View style={{ width: 190 }}>
            <Button title="🔒 Guardar picks" onPress={saveAll} disabled={pending.length === 0} loading={save.isPending} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------
function GameRow({ game, combat, open, saved, draft, lines, onChoose }: {
  game: Game; combat: boolean; open: boolean; saved?: { selection_competitor_id: string | null; status: string; points: number };
  draft?: string; lines?: Map<string, number>; onChoose: (g: Game, k: Competitor) => void;
}) {
  const { comp, sides } = game;
  const started = comp.status !== "scheduled";
  const chosen = saved?.selection_competitor_id ?? draft;
  return (
    <Card style={[{ marginHorizontal: 16, marginBottom: 10, gap: 10 }, saved && { borderColor: colors.win }]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textDim, fontSize: 12, fontWeight: "700", flex: 1 }} numberOfLines={1}>
          {comp.status === "scheduled" ? `${fmtDate(comp.starts_at)} · ${fmtTime(comp.starts_at)}` : ""}
          {combat && comp.label ? `${comp.status === "scheduled" ? " · " : ""}${comp.label}${comp.is_title_fight ? " 🏆" : ""}` : ""}
          {!combat && game.event.venues?.name && comp.status === "scheduled" ? ` · ${game.event.venues.name}` : ""}
        </Text>
        {comp.status === "live" ? <LiveBadge label={statusEs(comp.status_detail) || "EN VIVO"} /> : null}
        {comp.status === "final" ? <Text style={{ color: colors.textDim, fontWeight: "800", fontSize: 12 }}>{combat ? comp.result_method ?? "Final" : "Final"}</Text> : null}
        {saved ? <Text style={{ color: colors.win, fontWeight: "900", fontSize: 12, marginLeft: 8 }}>🔒 GUARDADO</Text> : null}
        {!saved && started ? <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8 }}>Cerrado</Text> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
        {sides.map((k, i) => {
          const sel = chosen === k.id;
          const resultColor = saved && comp.status === "final" && sel ? (saved.status === "won" ? colors.win : saved.status === "lost" ? colors.loss : colors.push) : undefined;
          const price = lines?.get(k.id);
          return (
            <Pressable key={k.id} disabled={!open || !!saved} onPress={() => onChoose(game, k)}
              style={[st.side, sel && { borderColor: resultColor ?? (saved ? colors.win : colors.primary), backgroundColor: saved ? "rgba(34,197,94,0.10)" : "rgba(34,211,238,0.12)" },
                (!open || saved) && !sel && { opacity: 0.45 }]}>
              {combat ? <Avatar uri={competitorImage(k)} name={competitorName(k)} size={54} /> : <TeamLogo uri={k.teams?.logo_url} name={k.teams?.abbreviation} size={46} />}
              <Text style={{ color: sel ? colors.text : colors.text, fontWeight: "900", textAlign: "center" }} numberOfLines={2}>{competitorName(k, !combat)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {k.athletes?.record_summary ?? k.record_summary ?? ""}{!combat ? (i === 0 ? " · Visita" : " · Local") : ""}
              </Text>
              {started && k.score != null ? <Text style={{ color: colors.text, fontWeight: "900", fontSize: 22 }}>{k.score}</Text> : null}
              {price != null ? <Text style={{ color: price > 0 ? colors.win : colors.textDim, fontWeight: "800", fontSize: 12 }}>{fmtOdds(price)}</Text> : null}
              {sel ? <Text style={{ color: resultColor ?? (saved ? colors.win : colors.primary), fontWeight: "900", fontSize: 11 }}>
                {saved ? (comp.status === "final" ? (saved.status === "won" ? "✅ ACERTASTE" : saved.status === "lost" ? "❌ FALLASTE" : "🔒 TU PICK") : "🔒 TU PICK") : "✓ ELEGIDO"}
              </Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  card: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  side: { flex: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardAlt },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
});
