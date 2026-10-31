// Mis grupos de picks
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, Button, Card, Empty, H1, Loading } from "@/components/ui";
import { useMyGroups } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, leagueEmoji } from "@/lib/theme";

export default function Groups() {
  const { userId } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useMyGroups(userId);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(g) => g.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <H1>Grupos</H1>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button title="Crear grupo" icon="add-circle" onPress={() => router.push("/group/new")} /></View>
              <View style={{ flex: 1 }}><Button title="Unirme" variant="ghost" icon="key" onPress={() => router.push("/group/join")} /></View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/group/${item.id}`)} style={{ marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar uri={item.avatar_url} name={item.name} size={50} color="7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: colors.textDim, fontSize: 12 }}>
                {item.leagues?.length ? item.leagues.map((l) => leagueEmoji[l]).join(" ") : "🏈🏀⚾🥊🏎️ Todas las ligas"} · {item.scoring?.mode === "units" ? "Unidades (momios)" : "Puntos"}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.role === "owner" ? "👑 Creador" : item.role === "admin" ? "Admin" : "Miembro"} · Código {item.invite_code}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Card>
        )}
        ListEmptyComponent={isLoading ? <Loading /> : <Empty icon="people-outline" title="Aún no estás en ningún grupo" subtitle="Crea uno e invita a tus amigos con el código, o únete con el código de alguien más." />}
      />
    </SafeAreaView>
  );
}
