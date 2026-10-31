// Liga: calendario (próximos/resultados), clasificación, equipos o peleadores/pilotos
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bars } from "@/components/Charts";
import { EventCard } from "@/components/EventCard";
import { Avatar, Card, Chip, Empty, Loading, SectionTitle, TeamLogo } from "@/components/ui";
import { useEvents, useLeagueAthletes, useLeagues, useStandings, useTeams } from "@/lib/api";
import { colors, hex } from "@/lib/theme";
import type { LeagueId, Standing } from "@/lib/types";

type Tab = "upcoming" | "results" | "standings" | "roster";

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: LeagueId }>();
  const leagues = useLeagues();
  const league = leagues.data?.find((l) => l.id === id);
  const [tab, setTab] = useState<Tab>("upcoming");
  const kind = league?.kind ?? "team";

  const now = useMemo(() => Date.now(), []);
  const upcoming = useEvents({ leagues: [id], from: new Date(now - 6 * 3600_000).toISOString(), to: new Date(now + 60 * 86400_000).toISOString(), status: ["scheduled", "live", "delayed"] });
  const results = useEvents({ leagues: [id], from: new Date(now - 30 * 86400_000).toISOString(), to: new Date(now).toISOString(), status: ["final"] });

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: kind === "combat" ? "Carteleras" : kind === "racing" ? "Calendario" : "Próximos" },
    { key: "results", label: "Resultados" },
    { key: "standings", label: kind === "racing" ? "Campeonato" : "Clasificación" },
    { key: "roster", label: kind === "team" ? "Equipos" : kind === "combat" ? "Peleadores" : "Pilotos" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: league?.short_name ?? "" }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {tabs.map((t) => <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
      </ScrollView>
      {tab === "upcoming" ? (
        <FlatList data={upcoming.data ?? []} keyExtractor={(e) => e.id} renderItem={({ item }) => <EventCard event={item} />}
          ListEmptyComponent={upcoming.isLoading ? <Loading /> : <Empty title="Sin eventos programados" />} contentContainerStyle={{ paddingBottom: 40 }} />
      ) : null}
      {tab === "results" ? (
        <FlatList data={[...(results.data ?? [])].reverse()} keyExtractor={(e) => e.id} renderItem={({ item }) => <EventCard event={item} />}
          ListEmptyComponent={results.isLoading ? <Loading /> : <Empty title="Sin resultados recientes" />} contentContainerStyle={{ paddingBottom: 40 }} />
      ) : null}
      {tab === "standings" ? <Standings id={id} kind={kind} /> : null}
      {tab === "roster" ? (kind === "team" ? <TeamsGrid id={id} /> : <AthletesGrid id={id} />) : null}
    </View>
  );
}

function Standings({ id, kind }: { id: LeagueId; kind: string }) {
  const { data, isLoading } = useStandings(id);
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty icon="podium-outline" title="Clasificación no disponible" subtitle={kind === "combat" ? "En combate se usan récords individuales: revisa Peleadores." : undefined} />;
  const groups = new Map<string, Standing[]>();
  for (const r of data) groups.set(r.group_name, [...(groups.get(r.group_name) ?? []), r]);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {[...groups.entries()].map(([g, rows]) => {
        const sorted = [...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
        const isRacing = kind === "racing";
        return (
          <View key={g}>
            <SectionTitle title={g} icon="podium" />
            {isRacing ? (
              <Card style={{ marginHorizontal: 16, marginBottom: 10 }}>
                <Bars data={sorted.slice(0, 10).map((r) => ({ label: (r.athletes?.display_name ?? r.teams?.abbreviation ?? "").split(" ").at(-1)!.slice(0, 3).toUpperCase(), value: Number(r.points ?? 0), top: String(r.points ?? "") }))} />
              </Card>
            ) : null}
            <Card style={{ marginHorizontal: 16, paddingVertical: 4 }}>
              <View style={st.row}>
                <Text style={[st.rank, { color: colors.textMuted }]}>#</Text>
                <Text style={[st.name, { color: colors.textMuted }]}>{isRacing ? "Piloto" : "Equipo"}</Text>
                {isRacing ? <Text style={st.num}>PTS</Text> : (
                  <>
                    <Text style={st.num}>G</Text><Text style={st.num}>P</Text><Text style={st.num}>%</Text><Text style={st.num}>Racha</Text>
                  </>
                )}
              </View>
              {sorted.map((r, i) => (
                <Pressable key={`${r.team_id ?? r.athlete_id}`} style={st.row}
                  onPress={() => r.team_id ? router.push(`/team/${r.team_id}`) : r.athlete_id && router.push(`/athlete/${r.athlete_id}`)}>
                  <Text style={st.rank}>{r.rank ?? i + 1}</Text>
                  <View style={[st.name, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
                    {r.teams ? <TeamLogo uri={r.teams.logo_url} name={r.teams.abbreviation} size={22} /> : <Avatar uri={r.athletes?.headshot_url} name={r.athletes?.display_name} size={24} />}
                    <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{r.teams?.display_name ?? r.athletes?.display_name}</Text>
                  </View>
                  {isRacing ? <Text style={[st.num, { color: colors.text, fontWeight: "900" }]}>{r.points}</Text> : (
                    <>
                      <Text style={st.num}>{r.wins}</Text>
                      <Text style={st.num}>{r.losses}</Text>
                      <Text style={st.num}>{r.win_pct !== null ? r.win_pct.toFixed(3).replace(/^0/, "") : "-"}</Text>
                      <Text style={[st.num, { color: r.streak?.startsWith("W") ? colors.win : colors.loss }]}>{r.streak?.replace("W", "G").replace("L", "P") ?? "-"}</Text>
                    </>
                  )}
                </Pressable>
              ))}
            </Card>
          </View>
        );
      })}
    </ScrollView>
  );
}

function TeamsGrid({ id }: { id: LeagueId }) {
  const { data, isLoading } = useTeams(id);
  if (isLoading) return <Loading />;
  return (
    <FlatList
      data={data ?? []}
      numColumns={3}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/team/${item.id}`)} style={[st.tile, { borderColor: hex(item.color, colors.border) }]}>
          <TeamLogo uri={item.logo_url} name={item.abbreviation} size={52} />
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" }} numberOfLines={2}>{item.display_name}</Text>
          {item.record_summary ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.record_summary}</Text> : null}
        </Pressable>
      )}
      ListEmptyComponent={<Empty title="Sin equipos todavía" subtitle="Se cargan con la sincronización diaria (sync-teams)." />}
    />
  );
}

function AthletesGrid({ id }: { id: LeagueId }) {
  const { data, isLoading } = useLeagueAthletes(id);
  const [wc, setWc] = useState<string | null>(null);
  const classes = [...new Set((data ?? []).map((a) => a.weight_class).filter(Boolean))] as string[];
  const list = (data ?? []).filter((a) => !wc || a.weight_class === wc);
  if (isLoading) return <Loading />;
  return (
    <View style={{ flex: 1 }}>
      {classes.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingBottom: 10 }}>
          <Chip label="Todas" active={!wc} onPress={() => setWc(null)} />
          {classes.map((c) => <Chip key={c} label={c} active={wc === c} onPress={() => setWc(c)} />)}
        </ScrollView>
      ) : null}
      <FlatList
        data={list}
        numColumns={3}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/athlete/${item.id}`)} style={st.tile}>
            <Avatar uri={item.headshot_url} name={item.display_name} size={64} />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12, textAlign: "center" }} numberOfLines={2}>{item.display_name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.record_summary ?? item.weight_class ?? ""}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Empty title="Sin atletas todavía" />}
      />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rank: { width: 26, color: colors.textDim, fontWeight: "800" },
  name: { flex: 1 },
  num: { width: 44, textAlign: "center", color: colors.textDim, fontSize: 12, fontVariant: ["tabular-nums"] },
  tile: { flex: 1 / 3, alignItems: "center", gap: 6, padding: 10, margin: 4, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
});
