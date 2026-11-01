// Detalle de evento: marcador en vivo, cartelera/sesiones, momios, picks del grupo, H2H.
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Donut, TrendChart } from "@/components/Charts";
import { competitorImage, competitorName, mainCompetition } from "@/components/EventCard";
import { FightStats } from "@/components/FightStats";
import { Avatar, Button, Card, Chip, Dim, Empty, FormDots, LiveBadge, Loading, SectionTitle, StatusPill, TeamLogo } from "@/components/ui";
import {
  useConsensus, useEvent, useHeadToHead, useMyGroups, useOddsHistory, usePicksForEvent, useSavePicks, useTeamForm,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmAsync, showAlert } from "@/lib/dialog";
import { bookName, fmtLine, fmtOdds, noVig, pct } from "@/lib/odds";
import { colors, hex, leagueColor, leagueEmoji, series } from "@/lib/theme";
import { countdown, fmtDateLong, fmtTime, offsetLabel, statusEs } from "@/lib/time";
import type { Competition, Competitor, Odds, PickType, SportEvent } from "@/lib/types";

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const kind = event?.leagues?.kind ?? "team";
  const comp = useMemo(() => {
    if (!event) return undefined;
    return event.competitions?.find((c) => c.id === selectedId) ?? mainCompetition(event);
  }, [event, selectedId]);

  if (isLoading || !event) return <Loading />;

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      <Stack.Screen options={{ title: event.leagues?.short_name ?? "" }} />
      <Hero event={event} comp={comp} />

      {kind === "combat" && comp ? <FightStats comp={comp} /> : null}
      {kind === "combat" ? <FightCard event={event} selectedId={comp?.id} onSelect={(id) => { setSelectedId(id); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} /> : null}
      {kind === "racing" ? <Sessions event={event} selectedId={comp?.id} onSelect={setSelectedId} /> : null}

      {comp ? (
        <>
          {kind === "team" ? <LiveBox comp={comp} /> : null}
          {kind === "racing" ? <RaceResults comp={comp} /> : null}
          <OddsSection comp={comp} />
          <PicksSection event={event} comp={comp} />
          {kind === "team" ? <Matchup comp={comp} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------
function Hero({ event, comp }: { event: SportEvent; comp?: Competition }) {
  const color = leagueColor[event.league_id] ?? colors.primary;
  const v = event.venues;
  const [a, b] = comp?.competitors ?? [];
  const isTeam = event.leagues?.kind === "team";
  return (
    <View style={[st.hero, { borderBottomColor: color }]}>
      <Text style={st.heroLeague}>{leagueEmoji[event.league_id]} {event.leagues?.name}{event.week ? ` · Semana ${event.week}` : ""}</Text>
      <Text style={st.heroTitle}>{event.name}</Text>

      {isTeam && a && b ? (
        <View style={st.scoreboard}>
          <ScoreSide k={a} comp={comp!} />
          <View style={{ alignItems: "center", minWidth: 90 }}>
            {comp!.status === "live" ? <LiveBadge /> : null}
            <Text style={st.heroStatus}>
              {comp!.status === "scheduled" ? fmtTime(comp!.starts_at) : statusEs(comp!.status_detail) || comp!.status}
            </Text>
            {comp!.status === "scheduled" ? <Text style={{ color: colors.primary, fontWeight: "700" }}>{countdown(comp!.starts_at)}</Text> : null}
          </View>
          <ScoreSide k={b} comp={comp!} />
        </View>
      ) : null}

      <View style={st.infoGrid}>
        <Info icon="calendar" text={fmtDateLong(comp?.starts_at ?? event.starts_at)} />
        <Info icon="time" text={`${fmtTime(comp?.starts_at ?? event.starts_at)} (${offsetLabel()})`} />
        {v ? <Info icon="location" text={`${v.name}${v.city ? ` · ${v.city}` : ""}${v.state ? `, ${v.state}` : ""}${v.country ? ` · ${v.country}` : ""}`} /> : null}
        {v?.indoor !== null && v?.indoor !== undefined ? <Info icon={v.indoor ? "home" : "sunny"} text={v.indoor ? "Bajo techo" : "Al aire libre"} /> : null}
        {event.broadcasts?.length ? <Info icon="tv" text={event.broadcasts.join(", ")} /> : null}
      </View>
    </View>
  );
}

function ScoreSide({ k, comp }: { k: Competitor; comp: Competition }) {
  const lost = comp.status === "final" && k.is_winner === false;
  return (
    <Pressable style={{ flex: 1, alignItems: "center", gap: 6 }} onPress={() => k.team_id && router.push(`/team/${k.team_id}`)}>
      <TeamLogo uri={k.teams?.logo_url} name={k.teams?.abbreviation} size={64} />
      <Text style={{ color: colors.text, fontWeight: "800", textAlign: "center" }} numberOfLines={2}>{k.teams?.display_name}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{k.record_summary} · {k.home_away === "home" ? "Local" : "Visita"}</Text>
      {comp.status !== "scheduled" ? <Text style={[st.bigScore, lost && { color: colors.textMuted }]}>{k.score ?? 0}</Text> : null}
    </Pressable>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={{ color: colors.textDim, flex: 1 }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------
function LiveBox({ comp }: { comp: Competition }) {
  const cs = comp.competitors ?? [];
  const periods = Math.max(0, ...cs.map((k) => k.linescores?.length ?? 0));
  if (!periods && !cs.some((k) => k.leaders?.length)) return null;
  const sit = comp.situation ?? {};
  return (
    <>
      {periods ? <SectionTitle title="Marcador por periodo" icon="stats-chart" /> : null}
      {periods ? <Card style={{ marginHorizontal: 16 }}>
        {periods ? (
          <View>
            <View style={st.lsRow}>
              <Text style={[st.lsTeam, { color: colors.textMuted }]}> </Text>
              {Array.from({ length: periods }).map((_, i) => <Text key={i} style={st.lsHead}>{i + 1}</Text>)}
              <Text style={[st.lsHead, { color: colors.text }]}>T</Text>
            </View>
            {cs.map((k) => (
              <View key={k.id} style={st.lsRow}>
                <Text style={st.lsTeam}>{k.teams?.abbreviation}</Text>
                {Array.from({ length: periods }).map((_, i) => <Text key={i} style={st.lsCell}>{k.linescores?.[i] ?? "-"}</Text>)}
                <Text style={[st.lsCell, { color: colors.text, fontWeight: "900" }]}>{k.score ?? "-"}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {sit.lastPlay ? <Text style={{ color: colors.push, marginTop: 10 }}>Última jugada: {String(sit.lastPlay)}</Text> : null}
        {sit.downDistanceText ? <Text style={{ color: colors.textDim, marginTop: 4 }}>{String(sit.downDistanceText)}</Text> : null}
        {sit.outs !== undefined ? (
          <Text style={{ color: colors.textDim, marginTop: 4 }}>
            {String(sit.outs)} outs · Cuenta {String(sit.balls ?? 0)}-{String(sit.strikes ?? 0)} · Bases: {[sit.onFirst && "1ª", sit.onSecond && "2ª", sit.onThird && "3ª"].filter(Boolean).join(", ") || "vacías"}
          </Text>
        ) : null}
      </Card> : null}

      {cs.some((k) => k.leaders?.length) ? (
        <>
          <SectionTitle title={comp.status === "scheduled" ? "Líderes de la temporada" : "Líderes del juego"} icon="star" />
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
            {cs.map((k) => (
              <Card key={k.id} style={{ flex: 1, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: hex(k.teams?.alt_color ?? k.teams?.color) }} />
                  <Text style={{ color: colors.text, fontWeight: "900" }}>{k.teams?.abbreviation}</Text>
                </View>
                {k.leaders.map((l) => (
                  <View key={l.category} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Avatar uri={l.headshot} name={l.athlete} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }} numberOfLines={1}>{l.athlete}</Text>
                      <Text style={{ color: colors.textDim, fontSize: 11 }}>{l.value} {l.category}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------
const SEGMENT: Record<string, string> = { main: "Cartelera estelar", prelims: "Preliminares", "early-prelims": "Preliminares tempranas", early: "Preliminares tempranas" };

function FightCard({ event, selectedId, onSelect }: { event: SportEvent; selectedId?: string; onSelect: (id: string) => void }) {
  const fights = [...(event.competitions ?? [])].sort((a, b) => b.order_index - a.order_index); // estelar primero
  const groups = new Map<string, Competition[]>();
  for (const f of fights) groups.set(f.card_segment ?? "main", [...(groups.get(f.card_segment ?? "main") ?? []), f]);
  return (
    <>
      {[...groups.entries()].map(([seg, list]) => (
        <View key={seg}>
          <SectionTitle title={`${SEGMENT[seg] ?? seg} (${list.length})`} icon="flame" />
          {list.map((f) => {
            const [a, b] = f.competitors ?? [];
            const active = f.id === selectedId;
            return (
              <Card key={f.id} onPress={() => onSelect(f.id)} style={[st.fight, active && { borderColor: colors.primary }]}>
                <FighterCell k={a} f={f} />
                <View style={{ alignItems: "center", width: 92 }}>
                  {f.status === "live" ? <LiveBadge label={statusEs(f.status_detail) || "EN VIVO"} /> : null}
                  <Text style={{ color: colors.textDim, fontSize: 10, fontWeight: "800", textAlign: "center" }}>{f.label}</Text>
                  {f.is_title_fight ? <Text style={{ color: colors.gold, fontSize: 10, fontWeight: "900" }}>🏆 TÍTULO</Text> : null}
                  {f.status === "final" ? (
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800", textAlign: "center" }}>
                      {f.result_method ?? "Final"}{f.result_round ? `\nR${f.result_round} ${f.result_time ?? ""}` : ""}
                    </Text>
                  ) : f.status === "scheduled" ? <Text style={{ color: colors.textMuted, fontSize: 10 }}>{fmtTime(f.starts_at)}</Text> : null}
                </View>
                <FighterCell k={b} f={f} right />
              </Card>
            );
          })}
        </View>
      ))}
    </>
  );
}

function FighterCell({ k, f, right }: { k?: Competitor; f: Competition; right?: boolean }) {
  const lost = f.status === "final" && k?.is_winner === false;
  return (
    <Pressable onPress={() => k?.athlete_id && router.push(`/athlete/${k.athlete_id}`)} style={{ flex: 1, flexDirection: right ? "row-reverse" : "row", alignItems: "center", gap: 8, opacity: lost ? 0.5 : 1 }}>
      <View>
        <Avatar uri={competitorImage(k)} name={competitorName(k)} size={46} />
        {f.status === "final" && k?.is_winner ? <Ionicons name="checkmark-circle" size={18} color={colors.win} style={{ position: "absolute", right: -4, bottom: -4 }} /> : null}
      </View>
      <View style={{ flex: 1, alignItems: right ? "flex-end" : "flex-start" }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13, textAlign: right ? "right" : "left" }} numberOfLines={2}>{competitorName(k)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{k?.athletes?.record_summary ?? k?.record_summary ?? ""}</Text>
      </View>
    </Pressable>
  );
}

function Sessions({ event, selectedId, onSelect }: { event: SportEvent; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <>
      <SectionTitle title="Sesiones del fin de semana" icon="flag" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {(event.competitions ?? []).map((c) => (
          <Pressable key={c.id} onPress={() => onSelect(c.id)} style={[st.session, c.id === selectedId && { borderColor: colors.primary, backgroundColor: colors.cardAlt }]}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>{c.label}</Text>
            <Text style={{ color: colors.textDim, fontSize: 11 }}>{fmtTime(c.starts_at)}</Text>
            {c.status === "live" ? <LiveBadge /> : c.status === "final" ? <Text style={{ color: colors.win, fontSize: 10, fontWeight: "800" }}>FINAL</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

function RaceResults({ comp }: { comp: Competition }) {
  const rows = [...(comp.competitors ?? [])].sort((a, b) => a.order_index - b.order_index);
  if (!rows.length) return null;
  const medal = [colors.gold, colors.silver, colors.bronze];
  return (
    <>
      <SectionTitle title={`Clasificación · ${comp.label ?? ""}`} icon="podium" />
      <Card style={{ marginHorizontal: 16, paddingVertical: 6 }}>
        {rows.map((k, i) => (
          <Pressable key={k.id} onPress={() => k.athlete_id && router.push(`/athlete/${k.athlete_id}`)} style={st.raceRow}>
            <Text style={[st.pos, i < 3 && { color: medal[i] }]}>{k.order_index || i + 1}</Text>
            <Avatar uri={k.athletes?.headshot_url} name={k.athletes?.display_name} size={30} />
            <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{k.athletes?.display_name}</Text>
            {k.athletes?.flag_url ? <Avatar uri={k.athletes.flag_url} size={18} rounded={false} contain /> : null}
          </Pressable>
        ))}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------
function OddsSection({ comp }: { comp: Competition }) {
  const odds = comp.odds ?? [];
  const history = useOddsHistory(comp.id);
  if (!odds.length) {
    return comp.status === "scheduled" ? (
      <>
        <SectionTitle title="Momios" icon="cash" />
        <Dim style={{ paddingHorizontal: 16 }}>Las casas de apuestas aún no publican líneas para este evento.</Dim>
      </>
    ) : null;
  }
  const books = [...new Set(odds.map((o) => o.bookmaker))];
  const [a, b] = comp.competitors ?? [];
  const ml = (bk: string, k?: Competitor) => odds.find((o) => o.bookmaker === bk && o.market === "h2h" && o.competitor_id === k?.id);
  const sp = (bk: string, k?: Competitor) => odds.find((o) => o.bookmaker === bk && o.market === "spreads" && o.competitor_id === k?.id);
  const tot = (bk: string, side: "Over" | "Under") => odds.find((o) => o.bookmaker === bk && o.market === "totals" && o.outcome === side);

  // Probabilidad implícita sin margen (promedio de casas)
  const pairs = books.map((bk) => [ml(bk, a)?.price, ml(bk, b)?.price]).filter((p): p is [number, number] => !!p[0] && !!p[1]);
  const probs = pairs.map(([x, y]) => noVig(x, y));
  const pa = probs.length ? probs.reduce((s, p) => s + p[0], 0) / probs.length : null;

  // Movimiento de línea (moneyline de A) por casa principal
  const mainBook = books[0];
  const move = (history.data ?? []).filter((h) => h.bookmaker === mainBook && h.market === "h2h");
  const outcomes = [...new Set(move.map((m) => m.outcome))].slice(0, 2);

  return (
    <>
      <SectionTitle title="Momios de casas de apuestas" icon="cash" />
      {pa !== null ? (
        <Card style={{ marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Donut size={110} slices={[{ value: pa, color: series[0] }, { value: 1 - pa, color: series[1] }]} center={{ title: pct(Math.max(pa, 1 - pa)), subtitle: "favorito" }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ color: colors.textDim, fontSize: 12 }}>Probabilidad implícita (sin margen, {probs.length} casa{probs.length > 1 ? "s" : ""})</Text>
            <ProbRow name={competitorName(a)} p={pa} color={series[0]} />
            <ProbRow name={competitorName(b)} p={1 - pa} color={series[1]} />
          </View>
        </Card>
      ) : null}

      <Card style={{ marginHorizontal: 16, padding: 0, overflow: "hidden" }}>
        <View style={[st.oddsRow, { backgroundColor: colors.cardAlt }]}>
          <Text style={[st.oddsBook, { color: colors.textMuted }]}>Casa</Text>
          <Text style={st.oddsHead}>Ganador</Text>
          <Text style={st.oddsHead}>Spread</Text>
          <Text style={st.oddsHead}>Total</Text>
        </View>
        {books.map((bk) => (
          <View key={bk} style={st.oddsRow}>
            <Text style={st.oddsBook} numberOfLines={1}>{bookName(bk)}</Text>
            <View style={st.oddsCol}>
              <OddsCell main={fmtOdds(ml(bk, a)?.price)} />
              <OddsCell main={fmtOdds(ml(bk, b)?.price)} />
            </View>
            <View style={st.oddsCol}>
              <OddsCell main={fmtLine(sp(bk, a)?.point)} sub={fmtOdds(sp(bk, a)?.price)} />
              <OddsCell main={fmtLine(sp(bk, b)?.point)} sub={fmtOdds(sp(bk, b)?.price)} />
            </View>
            <View style={st.oddsCol}>
              <OddsCell main={tot(bk, "Over")?.point ? `O ${tot(bk, "Over")?.point}` : "—"} sub={fmtOdds(tot(bk, "Over")?.price)} />
              <OddsCell main={tot(bk, "Under")?.point ? `U ${tot(bk, "Under")?.point}` : "—"} sub={fmtOdds(tot(bk, "Under")?.price)} />
            </View>
          </View>
        ))}
      </Card>
      <OpeningVsNow odds={odds} />

      {move.length > 2 && outcomes.length ? (
        <>
          <SectionTitle title={`Movimiento de línea · ${bookName(mainBook)}`} icon="trending-up" />
          <Card style={{ marginHorizontal: 16 }}>
            <TrendChart seriesData={outcomes.map((o, i) => ({ label: o, values: move.filter((m) => m.outcome === o).map((m) => m.price), color: series[i] }))} height={150} />
          </Card>
        </>
      ) : null}
    </>
  );
}

function OpeningVsNow({ odds }: { odds: Odds[] }) {
  const moved = odds.filter((o) => o.open_price && o.open_price !== o.price && o.market === "h2h");
  if (!moved.length) return null;
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8, gap: 2 }}>
      {moved.map((o) => (
        <Text key={o.id} style={{ color: colors.textDim, fontSize: 12 }}>
          {o.outcome}: abrió {fmtOdds(o.open_price)} → ahora <Text style={{ color: (o.price ?? 0) < (o.open_price ?? 0) ? colors.win : colors.loss, fontWeight: "800" }}>{fmtOdds(o.price)}</Text>
        </Text>
      ))}
    </View>
  );
}

function ProbRow({ name, p, color }: { name: string; p: number; color: string }) {
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color, fontWeight: "900" }}>{pct(p)}</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.cardAlt, borderRadius: 3, marginTop: 3 }}>
        <View style={{ width: `${p * 100}%`, height: 6, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function OddsCell({ main, sub }: { main: string; sub?: string }) {
  return (
    <View style={st.oddsCell}>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>{main}</Text>
      {sub && sub !== "—" ? <Text style={{ color: colors.textMuted, fontSize: 10 }}>{sub}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------
function PicksSection({ event, comp }: { event: SportEvent; comp: Competition }) {
  const { userId } = useAuth();
  const groups = useMyGroups(userId);
  const eligible = (groups.data ?? []).filter((g) => !g.leagues?.length || g.leagues.includes(event.league_id));
  const [groupId, setGroupId] = useState<string | undefined>();
  useEffect(() => {
    if (!groupId && eligible[0]) setGroupId(eligible[0].id);
  }, [eligible, groupId]);

  const picks = usePicksForEvent(event.id, [comp.id]);
  const consensus = useConsensus(comp.id, groupId);
  const save = useSavePicks();
  const locked = comp.status !== "scheduled" || Date.parse(comp.starts_at) <= Date.now();
  const kind = event.leagues?.kind ?? "team";
  const cs = comp.competitors ?? [];
  const odds = comp.odds ?? [];
  const groupPicks = (picks.data ?? []).filter((p) => p.group_id === groupId);
  const mine = groupPicks.filter((p) => p.user_id === userId);
  const myPick = (t: PickType) => mine.find((p) => p.pick_type === t);

  // Borrador local: se puede cambiar libremente hasta presionar "Guardar". Lo ya guardado es definitivo.
  type Draft = { selection_competitor_id?: string | null; selection_value?: string | null; line?: number | null; odds_price?: number | null };
  const [drafts, setDrafts] = useState<Partial<Record<PickType, Draft>>>({});
  useEffect(() => setDrafts({}), [groupId, comp.id]);
  const cur = (t: PickType): Draft | undefined => myPick(t) ?? drafts[t];
  const isSaved = (t: PickType) => !!myPick(t);
  const draftCount = Object.keys(drafts).filter((t) => !myPick(t as PickType)).length;

  const bestOdds = (market: Odds["market"], pred: (o: Odds) => boolean) =>
    odds.filter((o) => o.market === market && pred(o)).sort((x, y) => y.price - x.price)[0];

  const place = (pick_type: PickType, extra: Draft) => {
    if (isSaved(pick_type)) return showAlert("Pick guardado 🔒", "Los picks guardados ya no se pueden cambiar.");
    setDrafts((d) => ({ ...d, [pick_type]: extra }));
  };

  const saveDrafts = async () => {
    if (!groupId) return showAlert("Sin grupo", "Crea o únete a un grupo para hacer picks.");
    const groupName = eligible.find((g) => g.id === groupId)?.name ?? "tu grupo";
    const ok = await confirmAsync("¿Guardar tu pick?", `Se guardará en "${groupName}". Una vez guardado NO podrás cambiarlo.`, "Guardar 🔒");
    if (!ok) return;
    const rows = (Object.entries(drafts) as [PickType, Draft][])
      .filter(([t]) => !myPick(t))
      .map(([pick_type, d]) => ({ group_id: groupId, competition_id: comp.id, pick_type, ...d }));
    const res = await save.mutateAsync(rows).catch((e: Error) => ({ ok: 0, failed: [{ competition_id: comp.id, message: e.message }] }));
    if (res.failed.length) showAlert("No se pudo guardar", res.failed.map((f) => f.message).join("\n"));
    else showAlert("¡Pick guardado! 🔒", "Ya quedó registrado y no se puede cambiar.");
    setDrafts({});
  };

  if (!groups.isLoading && !eligible.length) {
    return (
      <>
        <SectionTitle title="Picks" icon="checkmark-done" />
        <Card style={{ marginHorizontal: 16 }} onPress={() => router.push("/group/new")}>
          <Text style={{ color: colors.text, fontWeight: "800" }}>Crea un grupo con tus amigos para hacer picks 🎯</Text>
          <Dim>Toca para crear uno o únete con un código.</Dim>
        </Card>
      </>
    );
  }

  const [a, b] = cs;
  const total = bestOdds("totals", (o) => o.outcome === "Over");
  const spreadFor = (k: Competitor) => bestOdds("spreads", (o) => o.competitor_id === k.id);

  return (
    <>
      <SectionTitle title={locked ? "Picks del grupo 🔒" : "Haz tu pick"} icon="checkmark-done" />
      {eligible.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 10 }}>
          {eligible.map((g) => <Chip key={g.id} label={g.name} active={g.id === groupId} onPress={() => setGroupId(g.id)} />)}
        </ScrollView>
      ) : null}

      {!locked ? (
        <Card style={{ marginHorizontal: 16, gap: 12 }}>
          {kind !== "racing" && cs.length === 2 ? (
            <>
              <Text style={st.pickLabel}>¿Quién gana?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {cs.map((k) => {
                  const o = bestOdds("h2h", (x) => x.competitor_id === k.id);
                  const sel = cur("winner")?.selection_competitor_id === k.id;
                  return (
                    <PickButton key={k.id} active={sel} saved={isSaved("winner")} title={competitorName(k, true)} sub={o ? fmtOdds(o.price) : undefined} image={competitorImage(k)}
                      onPress={() => place("winner", { selection_competitor_id: k.id, odds_price: o?.price ?? null })} />
                  );
                })}
              </View>
            </>
          ) : null}

          {kind === "team" && a && b && (spreadFor(a) || spreadFor(b)) ? (
            <>
              <Text style={st.pickLabel}>Spread (hándicap)</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[a, b].map((k) => {
                  const o = spreadFor(k);
                  if (!o) return null;
                  const sel = cur("spread")?.selection_competitor_id === k.id;
                  return <PickButton key={k.id} active={sel} saved={isSaved("spread")} title={`${competitorName(k, true)} ${fmtLine(o.point)}`} sub={fmtOdds(o.price)}
                    onPress={() => place("spread", { selection_competitor_id: k.id, line: o.point, odds_price: o.price })} />;
                })}
              </View>
            </>
          ) : null}

          {kind === "team" && total?.point ? (
            <>
              <Text style={st.pickLabel}>Total de puntos ({total.point})</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["over", "under"] as const).map((side) => {
                  const o = bestOdds("totals", (x) => x.outcome.toLowerCase() === side);
                  const sel = cur("total")?.selection_value === side;
                  return <PickButton key={side} active={sel} saved={isSaved("total")} title={side === "over" ? `Más de ${total.point}` : `Menos de ${total.point}`} sub={fmtOdds(o?.price)}
                    onPress={() => place("total", { selection_value: side, line: total.point, odds_price: o?.price ?? null })} />;
                })}
              </View>
            </>
          ) : null}

          {kind === "combat" && cs.length === 2 ? (
            <>
              <Text style={st.pickLabel}>Método de victoria (bonus)</Text>
              {cs.map((k) => (
                <View key={k.id} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Text style={{ color: colors.textDim, width: 80, fontSize: 12 }} numberOfLines={1}>{competitorName(k, true)}</Text>
                  {(["KO/TKO", "Submission", "Decision"] as const).map((m) => {
                    const sel = cur("method")?.selection_competitor_id === k.id && cur("method")?.selection_value === m;
                    return <Chip key={m} label={m === "Submission" ? "Sumisión" : m === "Decision" ? "Decisión" : m} active={sel}
                      onPress={() => place("method", { selection_competitor_id: k.id, selection_value: m })} />;
                  })}
                </View>
              ))}
            </>
          ) : null}

          {kind === "racing" ? (
            <>
              <Text style={st.pickLabel}>Elige ganador o podio</Text>
              <Dim>Toca un piloto para elegirlo ganador 🥇; tócalo de nuevo para agregarlo como pick de podio 🏁.</Dim>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cs.map((k) => {
                  const w = cur("winner")?.selection_competitor_id === k.id;
                  const p = cur("podium")?.selection_competitor_id === k.id;
                  return (
                    <Pressable key={k.id} onPress={() => place(w ? "podium" : "winner", { selection_competitor_id: k.id })} style={[st.driver, (w || p) && { borderColor: w ? colors.gold : colors.primary }]}>
                      <Avatar uri={k.athletes?.headshot_url} name={k.athletes?.display_name} size={26} />
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{k.athletes?.short_name}</Text>
                      {w ? <Text>🥇</Text> : p ? <Text>🏁</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {mine.length ? (
            <View style={{ gap: 4 }}>
              {mine.map((p) => (
                <Text key={p.id} style={{ color: colors.win, fontWeight: "800" }}>🔒 {p.pick_type === "winner" ? "Ganador" : p.pick_type === "spread" ? "Spread" : p.pick_type === "total" ? "Total" : p.pick_type === "method" ? "Método" : "Podio"} guardado (definitivo)</Text>
              ))}
            </View>
          ) : null}
          {draftCount > 0 ? <Button title={`🔒 Guardar pick${draftCount > 1 ? "s" : ""}`} onPress={saveDrafts} loading={save.isPending} /> : null}
          <Dim style={{ fontSize: 11 }}>Elige y presiona "Guardar": después ya no se puede cambiar. Se cierran al iniciar ({countdown(comp.starts_at)}); los de tus amigos se revelan al comenzar.</Dim>
        </Card>
      ) : null}

      {locked ? (
        <Card style={{ marginHorizontal: 16, gap: 8 }}>
          {consensus.data?.filter((c) => c.pick_type === "winner").length ? (
            <Donut
              size={120}
              slices={consensus.data.filter((c) => c.pick_type === "winner").map((c, i) => ({
                value: Number(c.votes), color: series[i % series.length], label: `${competitorName(cs.find((k) => k.id === c.selection_competitor_id), true)} ${c.pct}%`,
              }))}
              center={{ title: String(consensus.data.filter((c) => c.pick_type === "winner").reduce((s, c) => s + Number(c.votes), 0)), subtitle: "picks" }}
            />
          ) : null}
          {groupPicks.length ? groupPicks.map((p) => {
            const sel = cs.find((k) => k.id === p.selection_competitor_id);
            return (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar uri={p.profiles?.avatar_url} name={p.profiles?.display_name} size={30} />
                <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{p.profiles?.display_name}</Text>
                <Text style={{ color: colors.primary, fontWeight: "800" }}>
                  {p.pick_type === "total" ? `${p.selection_value === "over" ? "O" : "U"} ${p.line}` : `${competitorName(sel, true)}${p.pick_type === "spread" ? ` ${fmtLine(p.line)}` : p.pick_type === "method" ? ` · ${p.selection_value}` : ""}`}
                </Text>
                <StatusPill status={p.status} />
              </View>
            );
          }) : <Empty icon="eye-off-outline" title="Nadie del grupo hizo pick aquí" />}
        </Card>
      ) : null}
    </>
  );
}

function PickButton({ title, sub, active, onPress, image, saved }: { title: string; sub?: string; active?: boolean; onPress: () => void; image?: string | null; saved?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.pickBtn, active && { borderColor: saved ? colors.win : colors.primary, backgroundColor: saved ? "rgba(34,197,94,0.12)" : "rgba(34,211,238,0.12)" }, saved && !active && { opacity: 0.45 }]}>
      {image ? <Avatar uri={image} name={title} size={30} /> : null}
      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: "900", textAlign: "center" }} numberOfLines={1}>{title}</Text>
      {sub ? <Text style={{ color: colors.textDim, fontSize: 12, fontWeight: "700" }}>{sub}</Text> : null}
      {saved && active ? <Text style={{ fontSize: 11 }}>🔒 Guardado</Text> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------
function Matchup({ comp }: { comp: Competition }) {
  const [a, b] = comp.competitors ?? [];
  const formA = useTeamForm(a?.team_id ?? undefined, 5);
  const formB = useTeamForm(b?.team_id ?? undefined, 5);
  const h2h = useHeadToHead(a?.team_id ?? undefined, b?.team_id ?? undefined);
  if (!a?.team_id || !b?.team_id) return null;
  return (
    <>
      <SectionTitle title="Enfrentamiento" icon="git-compare" right={
        <Pressable onPress={() => router.push(`/compare?a=${a.team_id}&b=${b.team_id}&kind=team`)}>
          <Text style={{ color: colors.primary, fontWeight: "800" }}>Comparar →</Text>
        </Pressable>
      } />
      <Card style={{ marginHorizontal: 16, gap: 12 }}>
        {[{ k: a, f: formA.data }, { k: b, f: formB.data }].map(({ k, f }) => (
          <View key={k.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TeamLogo uri={k.teams?.logo_url} name={k.teams?.abbreviation} size={26} />
            <Text style={{ color: colors.text, fontWeight: "800", width: 52 }}>{k.teams?.abbreviation}</Text>
            <FormDots results={(f ?? []).map((r) => r.result)} />
          </View>
        ))}
        <Text style={{ color: colors.textDim, fontSize: 12 }}>Últimos 5 juegos (G = ganado, P = perdido)</Text>
        {h2h.data?.length ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.text, fontWeight: "800" }}>
              Historial directo: {a.teams?.abbreviation} {h2h.data.filter((x) => x.winner === "a").length} – {h2h.data.filter((x) => x.winner === "b").length} {b.teams?.abbreviation}
            </Text>
            {h2h.data.slice(0, 5).map((x) => (
              <Text key={x.competition_id} style={{ color: colors.textDim, fontSize: 12 }}>
                {fmtDateLong(x.starts_at)} · {a.teams?.abbreviation} {x.a_score} - {x.b_score} {b.teams?.abbreviation}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  hero: { padding: 16, paddingTop: 4, gap: 10, borderBottomWidth: 2, backgroundColor: colors.bgElevated },
  heroLeague: { color: colors.textDim, fontWeight: "800", fontSize: 12 },
  heroTitle: { color: colors.text, fontWeight: "900", fontSize: 22 },
  heroStatus: { color: colors.text, fontWeight: "900", fontSize: 14, marginTop: 4, textAlign: "center" },
  scoreboard: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  bigScore: { color: colors.text, fontSize: 44, fontWeight: "900", fontVariant: ["tabular-nums"] },
  infoGrid: { gap: 6, marginTop: 4 },
  lsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  lsTeam: { color: colors.text, fontWeight: "800", width: 56 },
  lsHead: { color: colors.textMuted, flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700" },
  lsCell: { color: colors.textDim, flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] },
  fight: { marginHorizontal: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
  session: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", gap: 4, minWidth: 80 },
  raceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  pos: { color: colors.textDim, width: 26, fontWeight: "900", fontSize: 16, textAlign: "center" },
  oddsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  oddsBook: { color: colors.text, fontWeight: "800", width: 80, fontSize: 12 },
  oddsHead: { flex: 1, color: colors.textMuted, textAlign: "center", fontSize: 11, fontWeight: "800" },
  oddsCol: { flex: 1, gap: 4 },
  oddsCell: { backgroundColor: colors.cardAlt, borderRadius: 6, paddingVertical: 4, alignItems: "center", marginHorizontal: 3 },
  pickLabel: { color: colors.textDim, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  pickBtn: { flex: 1, alignItems: "center", gap: 4, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardAlt },
  driver: { flexDirection: "row", alignItems: "center", gap: 6, padding: 6, paddingRight: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardAlt },
});
