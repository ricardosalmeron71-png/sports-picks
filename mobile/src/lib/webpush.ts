// Notificaciones push en la versión web (iPhone: Safari → "Agregar a pantalla de inicio", iOS 16.4+).
// Solo se usa cuando Platform.OS === "web"; en el celular nativo se usa notifications.ts.
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type WebPushState = "on" | "off" | "denied" | "need-install" | "unsupported";

const g = globalThis as unknown as {
  navigator?: Navigator & { standalone?: boolean };
  Notification?: typeof Notification;
  matchMedia?: (q: string) => MediaQueryList;
  location?: Location;
  atob?: (s: string) => string;
};

const base = () => (g.location?.pathname.startsWith("/sports-picks") ? "/sports-picks" : "");
const isIOS = () => /iphone|ipad|ipod/i.test(g.navigator?.userAgent ?? "");
const isStandalone = () => !!g.navigator?.standalone || !!g.matchMedia?.("(display-mode: standalone)").matches;
const hasPush = () => !!g.navigator && "serviceWorker" in g.navigator && "PushManager" in globalThis && !!g.Notification;

function urlBase64ToUint8Array(b64url: string) {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = g.atob!((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const reg = await g.navigator!.serviceWorker.register(`${base()}/sw.js`, { scope: `${base()}/` });
  await g.navigator!.serviceWorker.ready;
  return reg;
}

export async function getWebPushState(): Promise<WebPushState> {
  if (Platform.OS !== "web") return "unsupported";
  if (isIOS() && !isStandalone()) return "need-install";
  if (!hasPush()) return "unsupported";
  if (g.Notification!.permission === "denied") return "denied";
  if (g.Notification!.permission !== "granted") return "off";
  try {
    const reg = await g.navigator!.serviceWorker.getRegistration(`${base()}/`);
    return (await reg?.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Debe llamarse directamente desde un toque del usuario (iOS lo exige para pedir el permiso). */
export async function enableWebPush(userId: string): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS !== "web") return { ok: false, message: "Solo para la versión web." };
  if (isIOS() && !isStandalone()) {
    return { ok: false, message: "En iPhone primero instala la app: toca Compartir → «Agregar a pantalla de inicio», ábrela desde el ícono y vuelve a intentar." };
  }
  if (!hasPush()) return { ok: false, message: "Este navegador no soporta notificaciones push. En iPhone necesitas iOS 16.4 o más nuevo." };

  const permission = await g.Notification!.requestPermission(); // primero, para conservar el gesto del usuario
  if (permission !== "granted") return { ok: false, message: "Permiso denegado. Actívalo en Ajustes del teléfono → Notificaciones → Sports Picks." };

  const { data, error } = await supabase.functions.invoke("vapid-key");
  if (error || !data?.publicKey) return { ok: false, message: "No se pudo obtener la llave del servidor. ¿Ya desplegaste las funciones?" };

  try {
    const reg = await registration();
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource }));
    const { error: dbError } = await supabase.from("push_tokens").upsert(
      { token: JSON.stringify(sub.toJSON()), user_id: userId, platform: "web", device_name: (g.navigator?.userAgent ?? "").slice(0, 80), updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
    if (dbError) return { ok: false, message: `No se pudo guardar la suscripción: ${dbError.message}` };
    return { ok: true, message: "¡Notificaciones activadas en este dispositivo!" };
  } catch (e) {
    return { ok: false, message: `No se pudo activar: ${(e as Error).message}` };
  }
}

export async function disableWebPush() {
  if (Platform.OS !== "web" || !hasPush()) return;
  const reg = await g.navigator!.serviceWorker.getRegistration(`${base()}/`);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_tokens").delete().eq("token", JSON.stringify(sub.toJSON()));
  await sub.unsubscribe();
}

/** Si el permiso ya estaba concedido, renueva la suscripción en la base de datos al abrir la app. */
export async function refreshWebPush(userId: string) {
  if ((await getWebPushState()) === "on") await enableWebPush(userId).catch(() => {});
}
