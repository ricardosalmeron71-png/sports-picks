import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Avatar, Empty, SectionTitle, TeamLogo } from "@/components/ui";
import { searchAll } from "@/lib/api";
import { colors, leagueEmoji } from "@/lib/theme";
import type { Athlete, Team } from "@/lib/types";

export default function Search() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ teams: Partial<Team>[]; athletes: Partial<Athlete>[] }>({ teams: [], athletes: [] });
  useEffect(() => {
    if (q.trim().length < 2) return setRes({ teams: [], athletes: [] });
    const t = setTimeout(() => searchAll(q).then(setRes), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Equipo, jugador, peleador o piloto…" placeholderTextColor={colors.textMuted}
        style={{ margin: 16, backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border }} />
      {res.teams.length ? <SectionTitle title="Equipos" /> : null}
      {res.teams.map((t) => (
        <Pressable key={t.id} onPress={() => router.replace(`/team/${t.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
          <TeamLogo uri={t.logo_url} name={t.abbreviation} size={34} />
          <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{t.display_name}</Text>
          <Text>{leagueEmoji[t.league_id ?? ""]}</Text>
        </Pressable>
      ))}
      {res.athletes.length ? <SectionTitle title="Atletas" /> : null}
      {res.athletes.map((a) => (
        <Pressable key={a.id} onPress={() => router.replace(`/athlete/${a.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Avatar uri={a.headshot_url} name={a.display_name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{a.display_name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{[a.position, a.weight_class, a.record_summary].filter(Boolean).join(" · ")}</Text>
          </View>
          <Text>{leagueEmoji[a.league_id ?? ""]}</Text>
        </Pressable>
      ))}
      {q.length >= 2 && !res.teams.length && !res.athletes.length ? <Empty icon="search" title="Sin resultados" /> : null}
    </ScrollView>
  );
}
