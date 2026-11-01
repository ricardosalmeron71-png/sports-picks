// Jugadas clave de un juego de la NFL (anotaciones y cambios de balón), más reciente primero.
import { StyleSheet, Text, View } from "react-native";
import { useGameEvents } from "@/lib/api";
import { colors } from "@/lib/theme";
import type { GameEvent } from "@/lib/types";
import { Card, SectionTitle, TeamLogo } from "./ui";

const LABEL: Record<GameEvent["kind"], { icon: string; text: string; color: string }> = {
  touchdown: { icon: "🏈", text: "TOUCHDOWN", color: colors.win },
  field_goal: { icon: "🦵", text: "Gol de campo", color: colors.primary },
  safety: { icon: "🛡️", text: "Safety", color: colors.push },
  two_point: { icon: "✌️", text: "Conversión de 2", color: colors.primary },
  interception: { icon: "🧤", text: "Intercepción", color: colors.loss },
  fumble: { icon: "💥", text: "Fumble recuperado", color: colors.loss },
};

export function PlaysFeed({ competitionId, away, home }: { competitionId: string; away?: string | null; home?: string | null }) {
  const { data } = useGameEvents(competitionId);
  if (!data?.length) return null;
  return (
    <>
      <SectionTitle title="Anotaciones y jugadas clave" icon="flash" />
      <Card style={{ marginHorizontal: 16, paddingVertical: 4 }}>
        {data.map((p) => {
          const l = LABEL[p.kind];
          return (
            <View key={p.id} style={st.row}>
              <Text style={{ fontSize: 22 }}>{l.icon}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {p.teams ? <TeamLogo uri={p.teams.logo_url} name={p.teams.abbreviation} size={18} /> : null}
                  <Text style={{ color: l.color, fontWeight: "900" }}>{l.text}{p.teams?.abbreviation ? ` · ${p.teams.abbreviation}` : ""}</Text>
                </View>
                {p.description ? <Text style={{ color: colors.textDim, fontSize: 12 }} numberOfLines={3}>{p.description}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{p.away_score ?? "-"}–{p.home_score ?? "-"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{p.period ? (p.period > 4 ? "TE" : `Q${p.period}`) : ""} {p.clock ?? ""}</Text>
              </View>
            </View>
          );
        })}
        {away && home ? <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center", paddingVertical: 6 }}>Marcador: {away} – {home}</Text> : null}
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
