// Perfil: mis estadísticas de picks, zona horaria y preferencias de notificaciones
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bars } from "@/components/Charts";
import { Avatar, Button, Card, Chip, H1, KPI, SectionTitle } from "@/components/ui";
import { useMyPushTokens, useMyStats, useProfile, useUpdateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { showAlert } from "@/lib/dialog";
import { getNativePushGranted, registerForPush, unregisterPush } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { colors, leagueColor } from "@/lib/theme";
import { fmtPts, offsetLabel, setUtcOffset } from "@/lib/time";
import { checkNow, versionLabel } from "@/lib/updates";
import type { Profile } from "@/lib/types";
import { disableWebPush, enableWebPush, getWebPushState, type WebPushState } from "@/lib/webpush";

const OFFSETS = [-480, -420, -360, -300, -240, 0, 60];
const NOTIFS: { key: keyof Profile; label: string; desc: string }[] = [
  { key: "notify_game_start", label: "Inicio de juego", desc: "Cuando empieza un juego donde tienes pick" },
  { key: "notify_lead_change", label: "Cambio de líder", desc: "En el último cuarto / últimas entradas" },
  { key: "notify_plays", label: "Jugadas de la NFL", desc: "Touchdowns, goles de campo, safeties, intercepciones y fumbles de tus juegos" },
  { key: "notify_chat", label: "Mensajes del chat", desc: "Cuando alguien escribe en tus grupos" },
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

  // ---- Notificaciones push de ESTE dispositivo ----
  const tokens = useMyPushTokens(userId);
  const [perm, setPerm] = useState<WebPushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const refreshPerm = useCallback(async () => {
    if (Platform.OS === "web") setPerm(await getWebPushState());
    else setPerm((await getNativePushGranted()) ? "on" : "off");
  }, []);
  useEffect(() => { refreshPerm(); }, [refreshPerm]);
  const registered = (tokens.data ?? []).some((t) => t.platform === Platform.OS);
  const pushOn = perm === "on" && registered;

  const activate = async () => {
    if (!userId) return;
    setBusy(true);
    const r = Platform.OS === "web" ? await enableWebPush(userId) : await registerForPush(userId);
    await Promise.all([refreshPerm(), tokens.refetch()]);
    setBusy(false);
    showAlert(r.ok ? "Listo ✅" : "No se pudo activar", r.message);
  };
  const deactivate = async () => {
    if (Platform.OS === "web") await disableWebPush();
    else await unregisterPush();
    await Promise.all([refreshPerm(), tokens.refetch()]);
  };
  const sendTest = async () => {
    const { error } = await supabase.rpc("send_test_notification");
    if (error) showAlert("No se pudo enviar la prueba", error.message);
    else showAlert("Prueba enviada 🔔", "Debe llegar en unos segundos. Si no llega, mándame el mensaje que salga en «Activar notificaciones».");
  };

  const totals = (stats.data ?? []).reduce((acc, r) => ({ w: acc.w + Number(r.wins), l: acc.l + Number(r.losses), pts: acc.pts + Number(r.points) }), { w: 0, l: 0, pts: 0 });
  const pct = totals.w + totals.l ? Math.round((100 * totals.w) / (totals.w + totals.l)) : 0;

  const set = (patch: Partial<Profile>) => update.mutate(patch, { onError: (e) => showAlert("Error", e.message) });

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
        <Card style={{ marginHorizontal: 16, marginBottom: 10, gap: 10, borderColor: pushOn ? colors.win : colors.border }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            {pushOn ? "✅ Activadas en este dispositivo" : perm === "denied" ? "🚫 Permiso bloqueado" : "🔕 Desactivadas en este dispositivo"}
          </Text>
          {perm === "need-install" ? (
            <Text style={{ color: colors.textDim, fontSize: 13 }}>
              En iPhone las notificaciones solo funcionan con la app instalada: toca el botón Compartir de Safari → «Agregar a pantalla de inicio», abre Sports Picks desde su ícono y vuelve aquí.
            </Text>
          ) : null}
          {perm === "unsupported" ? <Text style={{ color: colors.textDim, fontSize: 13 }}>Este navegador no soporta notificaciones push (en iPhone necesitas iOS 16.4 o más nuevo).</Text> : null}
          {perm === "denied" ? <Text style={{ color: colors.textDim, fontSize: 13 }}>Actívalas en Ajustes del teléfono → Notificaciones → Sports Picks y vuelve a intentar.</Text> : null}
          {perm === "on" && !registered && !tokens.isLoading ? (
            <Text style={{ color: colors.push, fontSize: 13 }}>El permiso está dado pero este dispositivo no quedó registrado. Presiona «Activar» para reintentar y ver el motivo.</Text>
          ) : null}
          {!pushOn && perm !== "unsupported" ? <Button title="🔔 Activar notificaciones" onPress={activate} loading={busy} /> : null}
          {pushOn ? (
            <View style={{ gap: 8 }}>
              <Button title="Enviar notificación de prueba" variant="ghost" icon="paper-plane" onPress={sendTest} />
              <Button title="Desactivar en este dispositivo" variant="ghost" onPress={deactivate} />
            </View>
          ) : null}
          {tokens.data?.length ? (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Dispositivos registrados: {tokens.data.map((t) => (t.platform === "web" ? "🌐 web" : t.platform === "ios" ? "📱 iPhone" : "🤖 Android")).join(" · ")}
            </Text>
          ) : null}
        </Card>
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
          <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: "center" }}>{versionLabel()}</Text>
          {Platform.OS !== "web" ? <Button title="Buscar actualización" variant="ghost" icon="cloud-download" onPress={async () => showAlert("Actualizaciones", await checkNow())} /> : null}
          <Button title="Cerrar sesión" variant="danger" icon="log-out" onPress={async () => { await unregisterPush(); await supabase.auth.signOut(); }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
