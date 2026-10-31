// Tarjeta de evento: juego (equipos), cartelera (peleas) o Gran Premio (F1).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { colors, hex, leagueColor, leagueEmoji } from "@/lib/theme";
import { countdown, fmtDate, fmtTime, offsetLabel, statusEs } from "@/lib/time";
import type { Competition, Competitor, SportEvent } from "@/lib/types";
import { Avatar, Card, LiveBadge, TeamLogo } from "./ui";

export function competitorName(k?: Competitor, short = false) {
  if (!k) return "—";
  if (k.teams) return short ? k.teams.abbreviation ?? k.teams.name : k.teams.display_name;
  return short ? k.athletes?.short_name ?? k.athletes?.display_name ?? "—" : k.athletes?.display_name ?? "—";
}
export const competitorImage = (k?: Competitor) => k?.teams?.logo_url ?? k?.athletes?.headshot_url ?? null;

export function mainCompetition(e: SportEvent): Competition | undefined {
  const cs = e.competitions ?? [];
  if (e.leagues?.kind === "racing" || e.league_id === "f1") {
    return cs.find((c) => c.status === "live") ?? cs.find((c) => c.label === "Race") ?? cs[cs.length - 1];
  }
  return cs.find((c) => c.is_main_event) ?? cs[cs.length - 1];
}

function StatusLine({ c, startsAt }: { c?: Competition; startsAt: string }) {
  if (!c) return null;
  if (c.status === "live") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <LiveBadge />
        {c.status_detail ? <Text style={st.liveDetail}>{statusEs(c.status_detail)}</Text> : null}
      </View>
    );
  }
  if (c.status === "final") return <Text style={st.final}>{statusEs(c.status_detail) || "Final"}</Text>;
  if (c.status === "postponed") return <Text style={[st.final, { color: colors.push }]}>Pospuesto</Text>;
  if (c.status === "canceled") return <Text style={[st.final, { color: colors.loss }]}>Cancelado</Text>;
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={st.time}>{fmtTime(startsAt)}</Text>
      <Text style={st.countdown}>{countdown(startsAt)}</Text>
    </View>
  );
}

function TeamRow({ k, c }: { k: Competitor; c: Competition }) {
  const showScore = c.status !== "scheduled" && k.score !== null;
  const lost = c.status === "final" && k.is_winner === false;
  return (
    <View style={st.teamRow}>
      <TeamLogo uri={k.teams?.logo_url} name={k.teams?.abbreviation} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={[st.teamName, lost && { color: colors.textDim }]} numberOfLines={1}>{competitorName(k)}</Text>
        {k.record_summary ? <Text style={st.record}>{k.record_summary}{k.home_away === "home" ? " · Local" : ""}</Text> : null}
      </View>
      {showScore ? <Text style={[st.score, lost && { color: colors.textDim }, k.is_winner && { color: colors.text }]}>{k.score}</Text> : null}
      {c.status === "final" && k.is_winner ? <Ionicons name="caret-back" size={14} color={colors.primary} /> : null}
    </View>
  );
}

function FaceOff({ c }: { c: Competition }) {
  const [a, b] = c.competitors ?? [];
  const side = (k?: Competitor, align: "left" | "right" = "left") => (
    <View style={{ flex: 1, alignItems: align === "left" ? "flex-start" : "flex-end", gap: 6 }}>
      <View>
        <Avatar uri={competitorImage(k)} name={competitorName(k)} size={64} />
        {c.status === "final" && k?.is_winner ? (
          <View style={st.winBadge}><Text style={{ color: colors.bg, fontWeight: "900", fontSize: 10 }}>GANÓ</Text></View>
        ) : null}
      </View>
      <Text style={[st.fighter, { textAlign: align }]} numberOfLines={2}>{competitorName(k)}</Text>
      <Text style={st.record}>{k?.athletes?.record_summary ?? k?.record_summary ?? ""}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
      {side(a, "left")}
      <View style={{ alignItems: "center" }}>
        <Text style={st.vs}>VS</Text>
        {c.label ? <Text style={st.weight}>{c.label}</Text> : null}
        {c.is_title_fight ? <Text style={st.title}>🏆 Título</Text> : null}
        {c.result_method ? <Text style={st.method}>{c.result_method}{c.result_round ? ` · R${c.result_round}` : ""}</Text> : null}
      </View>
      {side(b, "right")}
    </View>
  );
}

function Podium({ c }: { c: Competition }) {
  const top = [...(c.competitors ?? [])].sort((x, y) => x.order_index - y.order_index).slice(0, 3);
  if (!top.length || c.status === "scheduled") return null;
  const medal = [colors.gold, colors.silver, colors.bronze];
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
      {top.map((k, i) => (
        <View key={k.id} style={[st.podium, { borderColor: medal[i] }]}>
          <Avatar uri={k.athletes?.headshot_url} name={k.athletes?.display_name} size={40} />
          <Text style={{ color: medal[i], fontWeight: "900" }}>P{i + 1}</Text>
          <Text style={st.record} numberOfLines={1}>{k.athletes?.short_name ?? k.athletes?.display_name}</Text>
        </View>
      ))}
    </View>
  );
}

export function EventCard({ event, compact }: { event: SportEvent; compact?: boolean }) {
  const kind = event.leagues?.kind ?? (event.league_id === "f1" ? "racing" : ["ufc", "boxing"].includes(event.league_id) ? "combat" : "team");
  const c = mainCompetition(event);
  const color = leagueColor[event.league_id] ?? colors.primary;
  const venue = event.venues;

  return (
    <Card onPress={() => router.push(`/event/${event.id}`)} style={[{ marginHorizontal: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: color }, c?.status === "live" && { borderColor: colors.live }]}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.league}>{leagueEmoji[event.league_id]} {event.leagues?.short_name ?? event.league_id.toUpperCase()}
            {event.week ? ` · Semana ${event.week}` : ""}{kind === "combat" && event.competitions ? ` · ${event.competitions.length} peleas` : ""}
          </Text>
          {kind !== "team" ? <Text style={st.eventName} numberOfLines={2}>{event.name}</Text> : null}
        </View>
        <StatusLine c={kind === "combat" ? event.competitions?.find((x) => x.status === "live") ?? c : c} startsAt={c?.starts_at ?? event.starts_at} />
      </View>

      {kind === "team" && c ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {(c.competitors ?? []).map((k) => <TeamRow key={k.id} k={k} c={c} />)}
          {c.status === "live" && c.situation?.downDistanceText ? <Text style={st.situation}>🏈 {String(c.situation.downDistanceText)}</Text> : null}
          {c.status === "live" && c.situation?.outs !== undefined ? (
            <Text style={st.situation}>⚾ {String(c.situation.outs)} outs · {String(c.situation.balls ?? 0)}-{String(c.situation.strikes ?? 0)}</Text>
          ) : null}
        </View>
      ) : null}
      {kind === "combat" && c ? <FaceOff c={c} /> : null}
      {kind === "racing" && c ? (
        <>
          <Text style={[st.record, { marginTop: 6 }]}>Sesión: {c.label ?? "—"}</Text>
          <Podium c={c} />
        </>
      ) : null}

      {!compact ? (
        <View style={st.footer}>
          <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
          <Text style={st.foot}>{fmtDate(event.starts_at)} · {fmtTime(c?.starts_at ?? event.starts_at)} ({offsetLabel()})</Text>
          {venue ? (
            <>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} style={{ marginLeft: 8 }} />
              <Text style={[st.foot, { flex: 1 }]} numberOfLines={1}>{venue.name}{venue.city ? `, ${venue.city}` : ""}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  league: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  eventName: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 2 },
  liveDetail: { color: colors.live, fontWeight: "800", fontSize: 12 },
  final: { color: colors.textDim, fontWeight: "800", fontSize: 12 },
  time: { color: colors.text, fontWeight: "900", fontSize: 15 },
  countdown: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  teamName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  record: { color: colors.textMuted, fontSize: 11 },
  score: { color: colors.text, fontWeight: "900", fontSize: 22, minWidth: 36, textAlign: "right", fontVariant: ["tabular-nums"] },
  situation: { color: colors.push, fontSize: 12, fontWeight: "700" },
  fighter: { color: colors.text, fontWeight: "800", fontSize: 14 },
  vs: { color: colors.textMuted, fontWeight: "900", fontSize: 18 },
  weight: { color: colors.textDim, fontSize: 10, fontWeight: "700", marginTop: 2 },
  title: { color: colors.gold, fontSize: 10, fontWeight: "800" },
  method: { color: colors.primary, fontSize: 10, fontWeight: "800", marginTop: 2 },
  winBadge: { position: "absolute", bottom: -4, alignSelf: "center", backgroundColor: colors.win, borderRadius: 6, paddingHorizontal: 5 },
  podium: { flex: 1, alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 12, paddingVertical: 8, backgroundColor: colors.cardAlt },
  footer: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  foot: { color: colors.textMuted, fontSize: 11 },
});

