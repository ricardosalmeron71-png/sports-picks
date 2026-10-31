// Jugador / peleador / piloto: foto, bio, estadísticas, tendencia (gamelog) e historial de peleas
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bars, Donut, TrendChart } from "@/components/Charts";
import { EventCard } from "@/components/EventCard";
import { Avatar, Card, Chip, Empty, Gradient, KPI, Loading, SectionTitle, TeamLogo } from "@/components/ui";
import { useAthlete, useAthleteHistory, useFavorites, useToggleFavorite, useUpcomingFor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, hex, leagueColor, series } from "@/lib/theme";
import { fmtDate } from "@/lib/time";
import type { Athlete } from "@/lib/types";

const parseWL = (s?: string) => {
  const [w, l, d] = (s ?? "").split("-").map((x) => Number(x) || 0);
  return { w, l, d };
};

export default function AthleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { data: a, isLoading } = useAthlete(id);
  const history = useAthleteHistory(id);
  const upcoming = useUpcomingFor("athlete", id);
  const favs = useFavorites(userId);
  const toggle = useToggleFavorite(userId);

  if (isLoading || !a) return <Loading />;
  const isFav = !!favs.data?.some((f) => f.athlete_id === id);
  const color = a.teams?.color ? hex(a.teams.color) : leagueColor[a.league_id] ?? colors.primary;
  const combat = a.league_id === "ufc" || a.league_id === "boxing";
  const racing = a.league_id === "f1";

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      <Stack.Screen options={{
        title: a.short_name ?? "",
        headerRight: () => (
          <Pressable onPress={() => toggle.mutate({ kind: "athlete", id: a.id, on: !isFav })} hitSlop={10}>
            <Ionicons name={isFav ? "star" : "star-outline"} size={22} color={isFav ? colors.gold : colors.text} />
          </Pressable>
        ),
      }} />
      <Gradient colors={[`${color}AA`, colors.bg]} style={st.hero}>
        <Avatar uri={a.headshot_url} name={a.display_name} size={132} color={color} />
        <Text style={st.name}>{a.display_name}</Text>
        {a.nickname ? <Text style={{ color: colors.primary, fontWeight: "800" }}>"{a.nickname}"</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {a.teams ? <Pressable onPress={() => router.push(`/team/${a.teams!.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TeamLogo uri={a.teams.logo_url} name={a.teams.abbreviation} size={22} />
            <Text style={{ color: colors.text, fontWeight: "700" }}>{a.teams.display_name}</Text>
          </Pressable> : null}
          {a.flag_url ? <Avatar uri={a.flag_url} size={20} rounded={false} contain /> : null}
          {a.country ? <Text style={{ color: colors.textDim }}>{a.country}</Text> : null}
        </View>
        <Text style={{ color: colors.textDim }}>
          {[a.position, a.jersey ? `#${a.jersey}` : null, a.weight_class].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <Chip label="⭐ Seguir" active={isFav} onPress={() => toggle.mutate({ kind: "athlete", id: a.id, on: !isFav })} />
          <Chip label="⚖️ Comparar" onPress={() => router.push(`/compare?a=${a.id}&kind=athlete`)} />
        </View>
      </Gradient>

      <View style={st.bio}>
        {[["Edad", a.age], ["Altura", a.height], ["Peso", a.weight], ["Alcance", a.reach], ["Guardia", a.stance]].filter(([, v]) => v).map(([k, v]) => (
          <View key={String(k)} style={st.bioItem}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>{String(v)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{k}</Text>
          </View>
        ))}
      </View>

      {combat ? <CombatStats a={a} /> : null}
      {!combat && !racing ? <SeasonStats a={a} /> : null}
      {!combat && !racing ? <GameLogTrend a={a} /> : null}

      {upcoming.data?.length ? (
        <>
          <SectionTitle title={combat ? "Próxima pelea" : "Próximos eventos"} icon="calendar" />
          {upcoming.data.map((e) => <EventCard key={e.id} event={e} />)}
        </>
      ) : null}

      {(combat || racing) ? (
        <>
          <SectionTitle title={combat ? "Historial de peleas" : "Resultados recientes"} icon="time" />
          {racing && history.data?.some((h) => h.finish_position) ? (
            <Card style={{ marginHorizontal: 16, marginBottom: 8 }}>
              <TrendChart
                seriesData={[{ label: "Posición", values: [...history.data].filter((h) => h.finish_position && h.label === "Race").reverse().map((h) => 21 - (h.finish_position ?? 20)), color: series[0] }]}
                height={140}
              />
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Más alto = mejor posición en carrera</Text>
            </Card>
          ) : null}
          {history.isLoading ? <Loading /> : history.data?.length ? history.data.filter((h) => h.status === "final").map((h) => (
            <Card key={h.competition_id} onPress={() => router.push(`/event/${h.event_id}`)} style={{ marginHorizontal: 16, marginBottom: 8, paddingVertical: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {combat ? (
                  <View style={[st.res, { backgroundColor: h.result === "W" ? colors.win : h.result === "L" ? colors.loss : colors.push }]}>
                    <Text style={{ color: "#fff", fontWeight: "900" }}>{h.result === "W" ? "G" : h.result === "L" ? "P" : "E"}</Text>
                  </View>
                ) : (
                  <View style={[st.res, { backgroundColor: colors.cardAlt }]}><Text style={{ color: colors.text, fontWeight: "900" }}>P{h.finish_position ?? "-"}</Text></View>
                )}
                {combat ? <Avatar uri={h.opponent_headshot} name={h.opponent_name} size={38} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{combat ? `vs ${h.opponent_name ?? "—"}` : `${h.event_name} · ${h.label ?? ""}`}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{combat ? h.event_name : ""} · {fmtDate(h.starts_at)}</Text>
                </View>
                {combat ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{h.result_method ?? ""}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{h.result_round ? `R${h.result_round} ${h.result_time ?? ""}` : ""}</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          )) : <Empty icon="time-outline" title="Sin historial en la base de datos" subtitle="Se llena con la sincronización de carteleras (backfill)." />}
        </>
      ) : null}
    </ScrollView>
  );
}

function CombatStats({ a }: { a: Athlete }) {
  const sum = a.stats?.summary ?? {};
  const rec = parseWL(sum["W-L-D"] ?? a.record_summary ?? "");
  const ko = parseWL(sum["(T)KO"]);
  const sub = parseWL(sum["SUB"]);
  const dec = Math.max(0, rec.w - ko.w - sub.w);
  if (!rec.w && !rec.l) return null;
  return (
    <>
      <SectionTitle title="Récord profesional" icon="trophy" />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
        <KPI label="Victorias" value={rec.w} color={colors.win} />
        <KPI label="Derrotas" value={rec.l} color={colors.loss} />
        <KPI label="Empates" value={rec.d} />
      </View>
      {rec.w ? (
        <Card style={{ marginHorizontal: 16, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Donut size={120} slices={[
            { value: ko.w, color: series[5], label: `KO/TKO ${ko.w}` },
            { value: sub.w, color: series[1], label: `Sumisión ${sub.w}` },
            { value: dec, color: series[0], label: `Decisión ${dec}` },
          ]} center={{ title: `${Math.round((100 * (ko.w + sub.w)) / rec.w)}%`, subtitle: "finalizaciones" }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: colors.textDim, fontSize: 12 }}>Cómo gana</Text>
            <Text style={{ color: colors.text }}>Perdió por KO: <Text style={{ fontWeight: "900" }}>{ko.l}</Text></Text>
            <Text style={{ color: colors.text }}>Perdió por sumisión: <Text style={{ fontWeight: "900" }}>{sub.l}</Text></Text>
          </View>
        </Card>
      ) : null}
    </>
  );
}

function SeasonStats({ a }: { a: Athlete }) {
  const season = a.stats?.season ?? {};
  const cats = Object.keys(season);
  const [cat, setCat] = useState<string | null>(null);
  const active = cat ?? cats.find((c) => /average|promedio/i.test(c)) ?? cats[0];
  if (!cats.length) return null;
  return (
    <>
      <SectionTitle title="Estadísticas de temporada" icon="stats-chart" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
        {cats.map((c) => <Chip key={c} label={c} active={c === active} onPress={() => setCat(c)} />)}
      </ScrollView>
      <Card style={{ marginHorizontal: 16, flexDirection: "row", flexWrap: "wrap" }}>
        {Object.entries(season[active] ?? {}).map(([k, v]) => (
          <View key={k} style={{ width: "25%", alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{v}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>{k}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function GameLogTrend({ a }: { a: Athlete }) {
  const log = a.gamelog ?? [];
  const numericKeys = useMemo(() => {
    const first = log[log.length - 1]?.values ?? {};
    return Object.keys(first).filter((k) => typeof first[k] === "number" && !/%|MIN/.test(k));
  }, [log]);
  const preferred = ["PTS", "REB", "AST", "YDS", "TD", "H", "HR", "RBI", "K"].find((k) => numericKeys.includes(k));
  const [stat, setStat] = useState<string | null>(null);
  const key = stat ?? preferred ?? numericKeys[0];
  if (!log.length || !key) return null;
  const values = log.map((g) => Number(g.values[key] ?? 0));
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const last5 = values.slice(-5);
  const avg5 = last5.reduce((s, v) => s + v, 0) / last5.length;
  return (
    <>
      <SectionTitle title="Tendencia por juego" icon="trending-up" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
        {numericKeys.slice(0, 10).map((k) => <Chip key={k} label={k} active={k === key} onPress={() => setStat(k)} />)}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 }}>
        <KPI label={`Prom. ${key}`} value={avg.toFixed(1)} />
        <KPI label="Últ. 5" value={avg5.toFixed(1)} color={avg5 >= avg ? colors.win : colors.loss} sub={avg5 >= avg ? "▲ al alza" : "▼ a la baja"} />
        <KPI label="Máximo" value={Math.max(...values)} />
      </View>
      <Card style={{ marginHorizontal: 16 }}>
        <Bars data={log.map((g, i) => ({
          label: g.opponent ?? String(i + 1),
          value: Number(g.values[key] ?? 0),
          color: Number(g.values[key] ?? 0) >= avg ? colors.primary : colors.primaryDim,
          top: String(g.values[key] ?? ""),
        }))} />
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: "center", padding: 20, gap: 6 },
  name: { color: colors.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  bio: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  bioItem: { alignItems: "center", backgroundColor: colors.card, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  res: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
