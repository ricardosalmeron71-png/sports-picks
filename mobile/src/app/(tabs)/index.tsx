// Inicio: en vivo, mis picks en juego, hoy y próximos (agrupados por día, hora UTC-7)
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { MyPickCard } from "@/components/PickCards";
import { Empty, H1, LeaguePill, Loading, SectionTitle } from "@/components/ui";
import { useEvents, useLeagues, useLiveEvents, useMyActivePicks, useNotifications } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import { dayKey, offsetLabel, relativeDay } from "@/lib/time";
import type { LeagueId, SportEvent } from "@/lib/types";

export default function Home() {
  const { userId } = useAuth();
  const [league, setLeague] = useState<LeagueId | null>(null);
  const leagues = useLeagues();
  const live = useLiveEvents();
  const myPicks = useMyActivePicks(userId);
  const notifs = useNotifications(userId);
  const unread = notifs.data?.filter((n) => !n.read_at).length ?? 0;

  const range = useMemo(() => {
    const from = new Date(Date.now() - 12 * 3600_000).toISOString();
    const to = new Date(Date.now() + 8 * 86400_000).toISOString();
    return { from, to };
  }, []);
  const upcoming = useEvents({ ...range, leagues: league ? [league] : undefined, status: ["scheduled", "live", "final", "delayed"] });

  const liveList = (live.data ?? []).filter((e) => !league || e.league_id === league);
  const sections = useMemo(() => {
    const groups = new Map<string, SportEvent[]>();
    for (const e of upcoming.data ?? []) {
      if (e.status === "live") continue; // ya aparecen arriba
      if (e.status === "final" && dayKey(e.starts_at) !== dayKey(new Date())) continue;
      const k = dayKey(e.starts_at);
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, data]) => ({ title: relativeDay(data[0].starts_at), key: k, data }));
  }, [upcoming.data]);

  const refreshing = upcoming.isRefetching || live.isRefetching;
  const onRefresh = () => {
    upcoming.refetch();
    live.refetch();
    myPicks.refetch();
  };

  const activePicks = (myPicks.data ?? []).filter((p) => p.competitions.status === "live" || Date.parse(p.competitions.starts_at) - Date.now() < 86400_000);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <View style={st.top}>
              <View>
                <H1>En vivo</H1>
                <Text style={{ color: colors.textDim, fontSize: 12 }}>Horarios en {offsetLabel()}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <Pressable onPress={() => router.push("/search")} hitSlop={10}>
                  <Ionicons name="search" size={24} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
                  <Ionicons name="notifications" size={24} color={colors.text} />
                  {unread > 0 ? <View style={st.badge}><Text style={st.badgeText}>{unread > 9 ? "9+" : unread}</Text></View> : null}
                </Pressable>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              <LeaguePill id="all" label="Todo" active={!league} onPress={() => setLeague(null)} />
              {(leagues.data ?? []).map((l) => (
                <LeaguePill key={l.id} id={l.id} label={l.short_name} logo={l.logo_url} active={league === l.id} onPress={() => setLeague(league === l.id ? null : l.id)} />
              ))}
            </ScrollView>

            {activePicks.length ? (
              <>
                <SectionTitle title="Mis picks en juego" icon="flash" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {activePicks.map((p) => <MyPickCard key={p.id} pick={p} />)}
                </ScrollView>
              </>
            ) : null}

            <SectionTitle title={`En vivo ahora${liveList.length ? ` (${liveList.length})` : ""}`} icon="radio" />
            {live.isLoading ? <Loading /> : liveList.length ? liveList.map((e) => <EventCard key={e.id} event={e} />) : (
              <Text style={{ color: colors.textMuted, paddingHorizontal: 16 }}>No hay eventos en vivo en este momento.</Text>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => <SectionTitle title={section.title} icon="calendar" />}
        renderItem={({ item }) => <EventCard event={item} />}
        ListEmptyComponent={upcoming.isLoading ? <Loading /> : <Empty title="Sin eventos próximos" subtitle="Cuando el backend sincronice el calendario aparecerán aquí." />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  badge: { position: "absolute", top: -6, right: -8, backgroundColor: colors.live, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
