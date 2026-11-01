// Envío de Web Push (VAPID + cifrado aes128gcm) con la librería web-push.
import webpush from "npm:web-push@3.6.7";
import type { Vapid } from "./vapid.ts";

export interface WebSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebResult {
  ok: boolean;
  /** true si la suscripción ya no existe (404/410) y hay que borrarla */
  gone: boolean;
  status?: number;
  error?: string;
}

export function parseSubscription(token: string): WebSub | null {
  try {
    const s = JSON.parse(token);
    return s?.endpoint && s?.keys?.p256dh && s?.keys?.auth ? s : null;
  } catch {
    return null;
  }
}

export async function sendWebPush(sub: WebSub, payload: Record<string, unknown>, vapid: Vapid): Promise<WebResult> {
  try {
    const res = await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 3600,
      urgency: "high",
    });
    return { ok: true, gone: false, status: res.statusCode };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, status, error: (e as Error).message };
  }
}
