import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, Text, View } from "react-native";
import { Card, Empty, Loading } from "@/components/ui";
import { markAllRead, useNotifications } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import { timeAgo } from "@/lib/time";

const ICON: Record<string, { i: keyof typeof Ionicons.glyphMap; c: string }> = {
  game_start: { i: "radio", c: colors.live },
  lead_change: { i: "flash", c: colors.push },
  final: { i: "flag", c: colors.textDim },
  pick_result: { i: "checkmark-done", c: colors.win },
  group: { i: "people", c: colors.accent },
};

export default function Notifications() {
  const { userId } = useAuth();
  const { data, isLoading, refetch } = useNotifications(userId);
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => markAllRead(userId).then(() => refetch()), 1500);
    return () => clearTimeout(t);
  }, [userId, refetch]);
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={data ?? []}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      renderItem={({ item }) => {
        const ic = ICON[item.kind] ?? { i: "notifications" as const, c: colors.primary };
        return (
          <Card onPress={() => item.data?.route && router.push(item.data.route as never)} style={[{ flexDirection: "row", gap: 12, alignItems: "center" }, !item.read_at && { borderColor: colors.primary }]}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `${ic.c}22`, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={ic.i} size={20} color={ic.c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{item.title}</Text>
              <Text style={{ color: colors.textDim, fontSize: 13 }}>{item.body}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(item.created_at)}</Text>
          </Card>
        );
      }}
      ListEmptyComponent={isLoading ? <Loading /> : <Empty icon="notifications-off-outline" title="Sin notificaciones" subtitle="Haz picks y sigue equipos para recibir alertas en vivo." />}
    />
  );
}
