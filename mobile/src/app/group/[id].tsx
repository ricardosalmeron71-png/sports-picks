// Grupo: tabla de posiciones, gráfico de carrera, picks en vivo y chat
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Bars, TrendChart } from "@/components/Charts";
import { PickRow } from "@/components/PickCards";
import { Avatar, Card, Chip, Empty, Gradient, KPI, Loading, SectionTitle } from "@/components/ui";
import { useGroup, useGroupMessages, useGroupPicks, useLeaderboard, useTimeline } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useGroupRealtime } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";
import { colors, leagueEmoji, series } from "@/lib/theme";
import { fmtPts, fmtTime, timeAgo } from "@/lib/time";

type Tab = "table" | "picks" | "chat";

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const [tab, setTab] = useState<Tab>("table");
  useGroupRealtime(id);

  if (group.isLoading || !group.data) return <Loading />;
  const g = group.data;

  const share = () =>
    Share.share({
      message: `¡Únete a mi grupo "${g.name}" en Sports Picks! 🏆\nCódigo: ${g.invite_code}\nsportspicks://group/join?code=${g.invite_code}`,
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: g.name }} />
      <Gradient colors={["#4C1D95", colors.bg]} style={st.hero}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{g.name}</Text>
          {g.description ? <Text style={{ color: colors.textDim }} numberOfLines={2}>{g.description}</Text> : null}
          <Text style={{ color: colors.textDim, marginTop: 4, fontSize: 12 }}>
            {g.leagues?.length ? g.leagues.map((l) => leagueEmoji[l]).join(" ") : "Todas las ligas"} · {g.scoring?.mode === "units" ? "Unidades" : "Puntos"}
          </Text>
        </View>
        <Pressable onPress={share} style={st.code}>
          <Text style={{ color: colors.textDim, fontSize: 10, fontWeight: "800" }}>INVITAR</Text>
          <Text style={{ color: colors.text, fontWeight: "900", letterSpacing: 2 }}>{g.invite_code}</Text>
          <Ionicons name="share-social" size={16} color={colors.primary} />
        </Pressable>
      </Gradient>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Chip label="🏆 Tabla" active={tab === "table"} onPress={() => setTab("table")} />
        <Chip label="🎯 Picks" active={tab === "picks"} onPress={() => setTab("picks")} />
        <Chip label="💬 Chat" active={tab === "chat"} onPress={() => setTab("chat")} />
      </View>
      {tab === "table" ? <Table groupId={g.id} units={g.scoring?.mode === "units"} /> : null}
      {tab === "picks" ? <Picks groupId={g.id} /> : null}
      {tab === "chat" ? <Chat groupId={g.id} /> : null}
    </View>
  );
}

function Table({ groupId, units }: { groupId: string; units: boolean }) {
  const { userId } = useAuth();
  const board = useLeaderboard(groupId);
  const [days, setDays] = useState(30);
  const timeline = useTimeline(groupId, days);

  const chart = useMemo(() => {
    const rows = timeline.data ?? [];
    const daysList = [...new Set(rows.map((r) => r.day))].sort();
    const users = [...new Set(rows.map((r) => r.user_id))];
    return {
      labels: daysList.map((d) => String(Number(d.slice(8)))),
      series: users.slice(0, 8).map((u, i) => {
        let last = 0;
        const name = rows.find((r) => r.user_id === u)?.display_name ?? "";
        return {
          label: name,
          color: series[i % series.length],
          values: daysList.map((d) => {
            const r = rows.find((x) => x.user_id === u && x.day === d);
            if (r) last = Number(r.cumulative);
            return last;
          }),
        };
      }),
    };
  }, [timeline.data]);

  if (board.isLoading) return <Loading />;
  const rows = board.data ?? [];
  const me = rows.find((r) => r.user_id === userId);
  const top3 = rows.slice(0, 3);
  const medal = [colors.gold, colors.silver, colors.bronze];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {me ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
          <KPI label="Mi lugar" value={`#${me.rank}`} sub={`de ${rows.length}`} />
          <KPI label={units ? "Unidades" : "Puntos"} value={fmtPts(me.points)} color={Number(me.points) >= 0 ? colors.win : colors.loss} />
          <KPI label="Récord" value={`${me.wins}-${me.losses}`} sub={me.win_pct !== null ? `${me.win_pct}% efectividad` : undefined} />
        </View>
      ) : null}

      {top3.length ? (
        <View style={st.podium}>
          {[1, 0, 2].map((i) => top3[i] ? (
            <View key={top3[i].user_id} style={{ alignItems: "center", flex: 1 }}>
              <Avatar uri={top3[i].avatar_url} name={top3[i].display_name} size={i === 0 ? 68 : 54} />
              <Text style={{ color: colors.text, fontWeight: "800", marginTop: 4 }} numberOfLines={1}>{top3[i].display_name}</Text>
              <View style={[st.step, { height: i === 0 ? 70 : i === 1 ? 50 : 36, backgroundColor: medal[i] }]}>
                <Text style={{ color: colors.bg, fontWeight: "900", fontSize: 18 }}>{i + 1}</Text>
                <Text style={{ color: colors.bg, fontWeight: "800", fontSize: 11 }}>{fmtPts(top3[i].points)}</Text>
              </View>
            </View>
          ) : <View key={i} style={{ flex: 1 }} />)}
        </View>
      ) : null}

      <SectionTitle title="Carrera por el primer lugar" icon="trending-up" />
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 16, marginBottom: 8 }}>
        {[7, 30, 90].map((d) => <Chip key={d} label={`${d} días`} active={days === d} onPress={() => setDays(d)} />)}
      </View>
      <Card style={{ marginHorizontal: 16 }}>
        {chart.series.length ? <TrendChart seriesData={chart.series} labels={chart.labels} height={190} /> : <Empty icon="analytics-outline" title="Aún no hay picks calificados" />}
      </Card>

      {rows.length > 1 ? (
        <>
          <SectionTitle title="Efectividad (%)" icon="stats-chart" />
          <Card style={{ marginHorizontal: 16 }}>
            <Bars data={rows.slice(0, 10).map((r, i) => ({ label: (r.display_name ?? "").slice(0, 5), value: Number(r.win_pct ?? 0), color: series[i % series.length], top: r.win_pct !== null ? `${r.win_pct}` : "-" }))} />
          </Card>
        </>
      ) : null}

      <SectionTitle title="Tabla general" icon="list" />
      <Card style={{ marginHorizontal: 16, paddingVertical: 4 }}>
        {rows.map((r) => (
          <View key={r.user_id} style={[st.row, r.user_id === userId && { backgroundColor: "rgba(34,211,238,0.08)" }]}>
            <Text style={[st.rank, r.rank <= 3 && { color: medal[r.rank - 1] }]}>{r.rank}</Text>
            <Avatar uri={r.avatar_url} name={r.display_name} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }} numberOfLines={1}>{r.display_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{r.wins}G · {r.losses}P · {r.pushes}E · {r.pending} pendientes</Text>
            </View>
            <Text style={{ color: Number(r.points) >= 0 ? colors.text : colors.loss, fontWeight: "900", fontSize: 18 }}>{fmtPts(r.points)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Picks({ groupId }: { groupId: string }) {
  const { data, isLoading } = useGroupPicks(groupId);
  const [filter, setFilter] = useState<"live" | "pending" | "graded">("live");
  const list = (data ?? []).filter((p) =>
    filter === "live" ? p.competitions.status === "live" : filter === "pending" ? p.status === "pending" && p.competitions.status !== "live" : p.status !== "pending"
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Chip label="🔴 En vivo" active={filter === "live"} onPress={() => setFilter("live")} />
        <Chip label="Próximos" active={filter === "pending"} onPress={() => setFilter("pending")} />
        <Chip label="Calificados" active={filter === "graded"} onPress={() => setFilter("graded")} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PickRow pick={item} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={isLoading ? <Loading /> : <Empty icon="eye-outline" title={filter === "live" ? "No hay picks en juego ahora" : "Sin picks"} subtitle={filter === "pending" ? "Los picks de los demás se revelan cuando empieza el juego." : undefined} />}
      />
    </View>
  );
}

function Chat({ groupId }: { groupId: string }) {
  const { userId } = useAuth();
  const { data } = useGroupMessages(groupId);
  const [text, setText] = useState("");
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    await supabase.from("group_messages").insert({ group_id: groupId, user_id: userId, body });
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <FlatList
        inverted
        data={data ?? []}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const mine = item.user_id === userId;
          return (
            <View style={{ flexDirection: mine ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
              {!mine ? <Avatar uri={item.profiles?.avatar_url} name={item.profiles?.display_name} size={28} /> : null}
              <View style={[st.bubble, mine ? { backgroundColor: colors.primaryDim } : { backgroundColor: colors.card }]}>
                {!mine ? <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>{item.profiles?.display_name}</Text> : null}
                <Text style={{ color: colors.text }}>{item.body}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 9, alignSelf: "flex-end" }}>{fmtTime(item.created_at)} · {timeAgo(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
      />
      <View style={st.inputBar}>
        <TextInput value={text} onChangeText={setText} placeholder="Escribe algo… 🔥" placeholderTextColor={colors.textMuted} style={st.input} onSubmitEditing={send} returnKeyType="send" />
        <Pressable onPress={send} style={st.send}><Ionicons name="send" size={18} color={colors.bg} /></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  code: { alignItems: "center", backgroundColor: colors.card, borderRadius: 12, padding: 10, gap: 2, borderWidth: 1, borderColor: colors.border },
  podium: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 24, marginTop: 20 },
  step: { width: "80%", borderTopLeftRadius: 10, borderTopRightRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 8 },
  rank: { color: colors.textDim, fontWeight: "900", width: 22, textAlign: "center" },
  bubble: { maxWidth: "78%", borderRadius: 14, padding: 10, gap: 2 },
  inputBar: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgElevated },
  input: { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
