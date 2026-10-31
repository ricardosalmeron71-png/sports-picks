// Equipo: récord, forma, estadísticas de temporada, próximos juegos y roster con fotos
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bars } from "@/components/Charts";
import { EventCard } from "@/components/EventCard";
import { Avatar, Card, Chip, FormDots, Gradient, KPI, Loading, SectionTitle, TeamLogo } from "@/components/ui";
import { useFavorites, useRoster, useTeam, useTeamForm, useToggleFavorite, useUpcomingFor } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, hex } from "@/lib/theme";
import { fmtDate } from "@/lib/time";

export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const team = useTeam(id);
  const form = useTeamForm(id, 10);
  const roster = useRoster(id);
  const upcoming = useUpcomingFor("team", id);
  const favs = useFavorites(userId);
  const toggle = useToggleFavorite(userId);
  const [cat, setCat] = useState<string | null>(null);

  if (team.isLoading || !team.data) return <Loading />;
  const t = team.data;
  const c = hex(t.color);
  const isFav = !!favs.data?.some((f) => f.team_id === id);
  const s = t.stats ?? {};
  const seasonCats = Object.keys(t.season_stats ?? {});
  const activeCat = cat ?? seasonCats[0];
  const formRows = [...(form.data ?? [])].reverse();

  const byPos = new Map<string, typeof roster.data>();
  for (const a of roster.data ?? []) byPos.set(a.position ?? "—", [...(byPos.get(a.position ?? "—") ?? []), a]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      <Stack.Screen options={{
        title: t.abbreviation ?? "",
        headerRight: () => (
          <Pressable onPress={() => toggle.mutate({ kind: "team", id: t.id, on: !isFav })} hitSlop={10}>
            <Ionicons name={isFav ? "star" : "star-outline"} size={22} color={isFav ? colors.gold : colors.text} />
          </Pressable>
        ),
      }} />
      <Gradient colors={[`${c}AA`, colors.bg]} style={st.hero}>
        <TeamLogo uri={t.logo_url} name={t.abbreviation} size={96} />
        <Text style={st.name}>{t.display_name}</Text>
        <Text style={{ color: colors.textDim }}>{t.record_summary ?? s.overall ?? ""}{s.playoffSeed ? ` · Sembrado #${s.playoffSeed}` : ""}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Chip label="⭐ Seguir" active={isFav} onPress={() => toggle.mutate({ kind: "team", id: t.id, on: !isFav })} />
          <Chip label="⚖️ Comparar" onPress={() => router.push(`/compare?a=${t.id}&kind=team`)} />
        </View>
      </Gradient>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
        <KPI label="Récord" value={s.overall ?? t.record_summary ?? "-"} />
        <KPI label="Local" value={s.Home ?? "-"} />
        <KPI label="Visita" value={s.Road ?? "-"} />
        <KPI label="Racha" value={(s.streak ?? "-").replace("W", "G").replace("L", "P")} color={s.streak?.startsWith("W") ? colors.win : colors.loss} />
      </View>
      {s.pointsFor ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 8 }}>
          <KPI label="A favor" value={s.avgPointsFor ?? s.pointsFor} sub={s.avgPointsFor ? "por juego" : "total"} color={colors.win} />
          <KPI label="En contra" value={s.avgPointsAgainst ?? s.pointsAgainst} sub={s.avgPointsAgainst ? "por juego" : "total"} color={colors.loss} />
          <KPI label="Diferencial" value={s.differential ?? s.pointDifferential ?? "-"} />
        </View>
      ) : null}

      {formRows.length ? (
        <>
          <SectionTitle title="Tendencia · últimos juegos" icon="trending-up" right={<FormDots results={formRows.slice(-5).map((r) => r.result)} />} />
          <Card style={{ marginHorizontal: 16 }}>
            <Bars data={formRows.map((r) => ({
              label: (r.opponent_name ?? "").split(" ").at(-1)!.slice(0, 3).toUpperCase(),
              value: Math.abs(Number(r.team_score ?? 0) - Number(r.opp_score ?? 0)) || 0.5,
              color: r.result === "W" ? colors.win : r.result === "L" ? colors.loss : colors.push,
              top: `${r.team_score}-${r.opp_score}`,
            }))} />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>Altura = margen de victoria/derrota · verde ganó · rojo perdió</Text>
          </Card>
          <Card style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 6 }}>
            {[...formRows].reverse().map((r) => (
              <Pressable key={r.competition_id} onPress={() => router.push(`/event/${r.event_id}`)} style={st.formRow}>
                <Text style={{ color: r.result === "W" ? colors.win : colors.loss, fontWeight: "900", width: 18 }}>{r.result === "W" ? "G" : r.result === "L" ? "P" : "E"}</Text>
                <Text style={{ color: colors.textMuted, width: 80, fontSize: 12 }}>{fmtDate(r.starts_at)}</Text>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>{r.home_away === "home" ? "vs" : "@"}</Text>
                <TeamLogo uri={r.opponent_logo} name={r.opponent_name} size={20} />
                <Text style={{ color: colors.text, flex: 1, fontSize: 13 }} numberOfLines={1}>{r.opponent_name}</Text>
                <Text style={{ color: colors.text, fontWeight: "800" }}>{r.team_score}-{r.opp_score}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {seasonCats.length ? (
        <>
          <SectionTitle title="Estadísticas de temporada" icon="stats-chart" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, marginBottom: 8 }}>
            {seasonCats.map((k) => <Chip key={k} label={k} active={k === activeCat} onPress={() => setCat(k)} />)}
          </ScrollView>
          <Card style={{ marginHorizontal: 16, flexDirection: "row", flexWrap: "wrap" }}>
            {Object.entries(t.season_stats[activeCat] ?? {}).slice(0, 18).map(([k, v]) => (
              <View key={k} style={st.stat}>
                <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{v}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={1}>{k}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {upcoming.data?.length ? (
        <>
          <SectionTitle title="Próximos juegos" icon="calendar" />
          {upcoming.data.map((e) => <EventCard key={e.id} event={e} />)}
        </>
      ) : null}

      {roster.data?.length ? (
        <>
          <SectionTitle title={`Roster (${roster.data.length})`} icon="people" />
          {[...byPos.entries()].map(([pos, list]) => (
            <View key={pos}>
              <Text style={st.pos}>{pos}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                {(list ?? []).map((a) => (
                  <Pressable key={a.id} onPress={() => router.push(`/athlete/${a.id}`)} style={st.player}>
                    <Avatar uri={a.headshot_url} name={a.display_name} size={62} color={t.color} />
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 11, textAlign: "center" }} numberOfLines={2}>{a.display_name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>#{a.jersey ?? "-"}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: "center", padding: 20, gap: 6, marginBottom: 12 },
  name: { color: colors.text, fontSize: 24, fontWeight: "900", textAlign: "center" },
  formRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  stat: { width: "33.3%", paddingVertical: 8, alignItems: "center" },
  pos: { color: colors.textDim, fontWeight: "800", paddingHorizontal: 16, marginTop: 10, marginBottom: 6 },
  player: { width: 76, alignItems: "center", gap: 4 },
});
