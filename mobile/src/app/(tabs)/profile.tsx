// Perfil: mis estadísticas de picks, zona horaria y preferencias de notificaciones
import { router } from "expo-router";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bars } from "@/components/Charts";
import { Avatar, Button, Card, Chip, H1, KPI, SectionTitle } from "@/components/ui";
import { useMyStats, useProfile, useUpdateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { unregisterPush } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { colors, leagueColor } from "@/lib/theme";
import { fmtPts, offsetLabel, setUtcOffset } from "@/lib/time";
import type { Profile } from "@/lib/types";

const OFFSETS = [-480, -420, -360, -300, -240, 0, 60];
const NOTIFS: { key: keyof Profile; label: string; desc: string }[] = [
  { key: "notify_game_start", label: "Inicio de juego", desc: "Cuando empieza un juego donde tienes pick" },
  { key: "notify_lead_change", label: "Cambio de líder", desc: "En el último cuarto / últimas entradas" },
  { key: "notify_pick_result", label: "Resultado de mis picks", desc: "Ganado, perdido o push al terminar" },
  { key: "notify_final", label: "Finales de mis favoritos", desc: "Marcador final de equipos/atletas que sigues" },
  { key: "notify_favorites", label: "Mis favoritos en vivo", desc: "Cuando juegan los que sigues" },
  { key: "notify_group", label: "Actividad de grupos", desc: "Nuevos miembros y avisos" },
];

export default function ProfileTab() {
  const { userId, session } = useAuth();
  const profile = useProfile(userId);
  const stats = useMyStats(userId);
  const update = useUpdateProfile(userId);
  const p = profile.data;

  const totals = (stats.data ?? []).reduce((acc, r) => ({ w: acc.w + Number(r.wins), l: acc.l + Number(r.losses), pts: acc.pts + Number(r.points) }), { w: 0, l: 0, pts: 0 });
  const pct = totals.w + totals.l ? Math.round((100 * totals.w) / (totals.w + totals.l)) : 0;

  const set = (patch: Partial<Profile>) => update.mutate(patch, { onError: (e) => Alert.alert("Error", e.message) });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar uri={p?.avatar_url} name={p?.display_name ?? session?.user.email} size={64} color="0E7490" />
          <View style={{ flex: 1 }}>
            <H1 style={{ fontSize: 22 }}>{p?.display_name ?? "—"}</H1>
            <Text style={{ color: colors.textDim }}>@{p?.username} · {session?.user.email}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16 }}>
          <KPI label="Récord" value={`${totals.w}-${totals.l}`} />
          <KPI label="Efectividad" value={`${pct}%`} color={pct >= 55 ? colors.win : pct >= 45 ? colors.push : colors.loss} />
          <KPI label="Puntos" value={fmtPts(totals.pts)} />
        </View>

        {stats.data?.length ? (
          <>
            <SectionTitle title="Efectividad por liga" icon="stats-chart" />
            <Card style={{ marginHorizontal: 16 }}>
              <Bars data={stats.data.map((r) => ({ label: r.league_id.toUpperCase(), value: Number(r.win_pct ?? 0), color: leagueColor[r.league_id], top: `${r.wins}-${r.losses}` }))} />
            </Card>
          </>
        ) : null}

        <SectionTitle title={`Zona horaria (${offsetLabel(p?.utc_offset_minutes)})`} icon="time" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 }}>
          {OFFSETS.map((o) => (
            <Chip key={o} label={offsetLabel(o) + (o === -420 ? " (Sonora/AZ)" : "")} active={p?.utc_offset_minutes === o}
              onPress={() => { setUtcOffset(o); set({ utc_offset_minutes: o }); }} />
          ))}
        </View>

        <SectionTitle title="Notificaciones" icon="notifications" />
        <Card style={{ marginHorizontal: 16, paddingVertical: 4 }}>
          {NOTIFS.map((n) => (
            <View key={n.key} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{n.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{n.desc}</Text>
              </View>
              <Switch value={!!p?.[n.key]} onValueChange={(v) => set({ [n.key]: v } as Partial<Profile>)}
                trackColor={{ true: colors.primaryDim, false: colors.cardAlt }} thumbColor={p?.[n.key] ? colors.primary : colors.textMuted} />
            </View>
          ))}
        </Card>

        <View style={{ padding: 16, gap: 10 }}>
          <Button title="Ver bandeja de notificaciones" variant="ghost" icon="mail-unread" onPress={() => router.push("/notifications")} />
          <Button title="Cerrar sesión" variant="danger" icon="log-out" onPress={async () => { await unregisterPush(); await supabase.auth.signOut(); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
