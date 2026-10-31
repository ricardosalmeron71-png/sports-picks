// Tarjetas de picks: "mis picks en juego" (con marcador en vivo) y filas del feed del grupo.
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { PickWithContext } from "@/lib/api";
import { fmtLine, fmtOdds } from "@/lib/odds";
import { colors, leagueEmoji } from "@/lib/theme";
import { fmtDateTime, fmtPts, statusEs, timeAgo } from "@/lib/time";
import { Avatar, Card, LiveBadge, StatusPill } from "./ui";

type Cmp = PickWithContext["competitions"]["competitors"][number];
const nameOf = (k?: Cmp) => k?.teams?.abbreviation ?? k?.athletes?.short_name ?? k?.athletes?.display_name ?? "—";
const imgOf = (k?: Cmp) => k?.teams?.logo_url ?? k?.athletes?.headshot_url ?? null;

export function pickLabel(p: PickWithContext) {
  const sel = p.competitions.competitors.find((k) => k.id === p.selection_competitor_id);
  switch (p.pick_type) {
    case "winner":
      return `${nameOf(sel)} gana`;
    case "spread":
      return `${nameOf(sel)} ${fmtLine(p.line)}`;
    case "total":
      return `${p.selection_value === "over" ? "Más de" : "Menos de"} ${p.line}`;
    case "method":
      return `${nameOf(sel)} por ${p.selection_value}`;
    case "podium":
      return `${nameOf(sel)} al podio`;
  }
}

/** ¿Va ganando el pick en este momento? (solo picks de ganador/spread/total con marcador) */
export function liveTrend(p: PickWithContext): "up" | "down" | "even" | null {
  const c = p.competitions;
  if (c.status !== "live") return null;
  const cs = c.competitors;
  if (cs.length !== 2 || cs.some((k) => k.score === null)) return null;
  const sel = cs.find((k) => k.id === p.selection_competitor_id);
  const opp = cs.find((k) => k.id !== p.selection_competitor_id);
  let diff = 0;
  if (p.pick_type === "winner" && sel && opp) diff = Number(sel.score) - Number(opp.score);
  else if (p.pick_type === "spread" && sel && opp) diff = Number(sel.score) + Number(p.line ?? 0) - Number(opp.score);
  else if (p.pick_type === "total") {
    // Total parcial: solo "under" puede ir arriba antes del final; mostramos ritmo simple
    const tot = cs.reduce((a, k) => a + Number(k.score ?? 0), 0);
    diff = p.selection_value === "over" ? tot - Number(p.line) : Number(p.line) - tot;
  } else return null;
  return diff > 0 ? "up" : diff < 0 ? "down" : "even";
}

export function MyPickCard({ pick }: { pick: PickWithContext }) {
  const c = pick.competitions;
  const [a, b] = [...c.competitors].sort((x, y) => (x.home_away === "away" ? -1 : 1) - (y.home_away === "away" ? -1 : 1));
  const trend = liveTrend(pick);
  const trendColor = trend === "up" ? colors.win : trend === "down" ? colors.loss : colors.push;
  return (
    <Card onPress={() => router.push(`/event/${c.event_id}`)} style={[st.mini, trend && { borderColor: trendColor }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={st.league}>{leagueEmoji[c.league_id]} {c.league_id.toUpperCase()}</Text>
        {c.status === "live" ? <LiveBadge label={statusEs(c.status_detail) || "EN VIVO"} /> : <Text style={st.when}>{fmtDateTime(c.starts_at)}</Text>}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <Avatar uri={imgOf(a)} name={nameOf(a)} size={28} />
        <Text style={st.team}>{nameOf(a)}</Text>
        <Text style={st.score}>{a?.score ?? ""}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
        <Avatar uri={imgOf(b)} name={nameOf(b)} size={28} />
        <Text style={st.team}>{nameOf(b)}</Text>
        <Text style={st.score}>{b?.score ?? ""}</Text>
      </View>
      <View style={[st.pickBox, trend && { backgroundColor: `${trendColor}22` }]}>
        <Text style={{ color: trend ? trendColor : colors.primary, fontWeight: "900", fontSize: 12 }}>
          {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}{pickLabel(pick)}
        </Text>
        {pick.odds_price ? <Text style={st.odds}>{fmtOdds(pick.odds_price)}</Text> : null}
      </View>
    </Card>
  );
}

export function PickRow({ pick, showUser = true }: { pick: PickWithContext; showUser?: boolean }) {
  const c = pick.competitions;
  const trend = liveTrend(pick);
  return (
    <Card onPress={() => router.push(`/event/${c.event_id}`)} style={{ marginHorizontal: 16, marginBottom: 8, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {showUser ? <Avatar uri={pick.profiles?.avatar_url} name={pick.profiles?.display_name} size={34} /> : null}
        <View style={{ flex: 1 }}>
          {showUser ? <Text style={{ color: colors.text, fontWeight: "800" }}>{pick.profiles?.display_name ?? pick.profiles?.username}</Text> : null}
          <Text style={{ color: colors.primary, fontWeight: "800" }}>
            {leagueEmoji[c.league_id]} {pickLabel(pick)} {pick.odds_price ? <Text style={st.odds}> {fmtOdds(pick.odds_price)}</Text> : null}
          </Text>
          <Text style={st.when}>
            {c.competitors.map(nameOf).join(" vs ")}
            {c.status === "live" ? ` · ${c.competitors.map((k) => k.score ?? 0).join("-")} · ${statusEs(c.status_detail)}` : ""}
            {c.status === "final" ? ` · Final ${c.competitors.map((k) => k.score ?? "").join("-")}` : ""}
            {c.status === "scheduled" ? ` · ${fmtDateTime(c.starts_at)}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {c.status === "live" && pick.status === "pending" ? (
            <Text style={{ color: trend === "up" ? colors.win : trend === "down" ? colors.loss : colors.push, fontWeight: "900" }}>
              {trend === "up" ? "▲ Ganando" : trend === "down" ? "▼ Perdiendo" : "● Empatado"}
            </Text>
          ) : <StatusPill status={pick.status} />}
          {pick.status === "won" ? <Text style={{ color: colors.win, fontWeight: "900" }}>+{fmtPts(pick.points)}</Text> : null}
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(pick.created_at)}</Text>
        </View>
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  mini: { width: 230, padding: 12 },
  league: { color: colors.textDim, fontSize: 11, fontWeight: "800" },
  when: { color: colors.textMuted, fontSize: 11 },
  team: { color: colors.text, fontWeight: "800", flex: 1 },
  score: { color: colors.text, fontWeight: "900", fontSize: 18, fontVariant: ["tabular-nums"] },
  pickBox: { marginTop: 10, borderRadius: 8, padding: 8, backgroundColor: colors.cardAlt, flexDirection: "row", justifyContent: "space-between" },
  odds: { color: colors.textDim, fontWeight: "700", fontSize: 12 },
});
