// Notificaciones push: permisos, canales Android, token Expo y navegación al tocar.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { supabase } from "./supabase";

if (Platform.OS !== "web") Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("live", {
    name: "En vivo (inicio y cambios de líder)",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 120, 250],
    lightColor: "#EF4444",
  });
  await Notifications.setNotificationChannelAsync("results", {
    name: "Resultados de picks y finales",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#22C55E",
  });
  await Notifications.setNotificationChannelAsync("groups", {
    name: "Actividad de grupos",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PushResult = { ok: boolean; message: string };

/** Pide permiso, obtiene el ExponentPushToken y lo guarda en push_tokens. */
export async function registerForPush(userId: string): Promise<PushResult> {
  if (Platform.OS === "web") return { ok: false, message: "En la web se usa webpush.ts" };
  await ensureChannels();
  if (!Device.isDevice) return { ok: false, message: "Las notificaciones push solo funcionan en un celular físico." };
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return { ok: false, message: "Permiso denegado. Actívalo en Ajustes del teléfono → Apps → Sports Picks → Notificaciones." };

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId) return { ok: false, message: "Falta el projectId de Expo en la configuración de la app." };
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.from("push_tokens").upsert(
      { token, user_id: userId, platform: Platform.OS, device_name: Device.deviceName ?? null, updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
    if (error) return { ok: false, message: `No se pudo guardar el token: ${error.message}` };
    return { ok: true, message: "¡Notificaciones activadas en este dispositivo!" };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/firebase|fcm|google-services/i.test(msg)) {
      return { ok: false, message: "Esta versión de la app se compiló sin Firebase. Falta google-services.json y volver a compilar el APK." };
    }
    return { ok: false, message: `No se pudo obtener el token: ${msg}` };
  }
}

export async function getNativePushGranted(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await Notifications.getPermissionsAsync()).status === "granted";
}

export async function unregisterPush() {
  if (Platform.OS === "web") return;
  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from("push_tokens").delete().eq("token", token);
  } catch {
    // sin token registrado
  }
}

function openFromNotification(n: Notifications.Notification) {
  const route = n.request.content.data?.route;
  if (typeof route === "string" && route.startsWith("/")) router.push(route as never);
}

/** Navega a la pantalla correcta al tocar una notificación (también en arranque en frío). */
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    // Arranque en frío: la app se abrió tocando una notificación
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) openFromNotification(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r.notification));
    return () => sub.remove();
  }, []);
}
