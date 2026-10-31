// Deportes: tarjetas grandes por liga
import { router } from "expo-router";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Gradient, H1, Loading } from "@/components/ui";
import { useLeagues } from "@/lib/api";
import { colors, leagueColor, leagueEmoji } from "@/lib/theme";

const BLURB: Record<string, string> = {
  nfl: "Juegos, standings por división, rosters y momios",
  nba: "Marcador en vivo, líderes y clasificación por conferencia",
  mlb: "Entradas en vivo, cuenta, bases y temporada",
  ufc: "Carteleras actuales y próximas, récords e historial de peleas",
  boxing: "Peleas próximas y resultados",
  f1: "Grandes Premios, sesiones, podios y campeonato de pilotos",
};

export default function Sports() {
  const { data, isLoading } = useLeagues();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <H1>Deportes</H1>
        {isLoading ? <Loading /> : null}
        {(data ?? []).map((l) => {
          const c = leagueColor[l.id] ?? colors.primary;
          return (
            <Pressable key={l.id} onPress={() => router.push(`/league/${l.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <Gradient colors={[`${c}55`, colors.card]} style={st.card}>
                <View style={st.logo}>
                  {l.logo_url ? <Image source={{ uri: l.logo_url }} style={{ width: 52, height: 52 }} contentFit="contain" /> : <Text style={{ fontSize: 36 }}>{leagueEmoji[l.id]}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.title}>{l.short_name}</Text>
                  <Text style={st.sub}>{l.name}</Text>
                  <Text style={st.blurb}>{BLURB[l.id]}</Text>
                </View>
              </Gradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  logo: { width: 70, height: 70, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  sub: { color: colors.textDim, fontSize: 12 },
  blurb: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
