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

/** Pide permiso, obtiene el ExponentPushToken y lo guarda en push_tokens. */
export async function registerForPush(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  await ensureChannels();
  if (!Device.isDevice) {
    console.log("Las notificaciones push requieren un dispositivo físico");
    return null;
  }
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  if (!projectId || String(projectId).startsWith("REEMPLAZA")) {
    console.warn("Configura extra.eas.projectId en app.json (npx eas-cli init)");
    return null;
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await supabase.from("push_tokens").upsert(
    { token, user_id: userId, platform: Platform.OS, device_name: Device.deviceName ?? null, updated_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  return token;
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
