// Envío de notificaciones push vía Expo Push Service (APNs + FCM con un solo API).
import { chunk, type DB } from "./db.ts";
import { getVapid, type Vapid } from "./vapid.ts";
import { parseSubscription, sendWebPush } from "./webpush.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface Claimed { id: number; user_id: string; title: string; body: string; data: Record<string, unknown>; kind: string }

const CHANNEL: Record<string, string> = {
  test: "results",
  game_start: "live",
  lead_change: "live",
  final: "results",
  pick_result: "results",
  group: "groups",
  chat: "groups",
  play: "live",
};

export async function flushPushQueue(db: DB, maxBatches = 5): Promise<{ sent: number; failed: number; invalidTokens: number }> {
  let sent = 0, failed = 0, invalidTokens = 0;
  for (let b = 0; b < maxBatches; b++) {
    const { data: claimed, error } = await db.rpc("claim_notifications", { p_limit: 500 });
    if (error) throw error;
    const items = (claimed ?? []) as Claimed[];
    if (!items.length) break;

    const userIds = [...new Set(items.map((n) => n.user_id))];
    const { data: tokens } = await db.from("push_tokens").select("token, user_id").in("user_id", userIds);
    const byUser = new Map<string, string[]>();
    for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);

    const badges = new Map<string, number>();
    await Promise.all(userIds.map(async (u) => {
      const { data } = await db.rpc("unread_count", { p_user: u });
      badges.set(u, Number(data ?? 0));
    }));

    // Expo (APNs/FCM nativo) y Web Push (iPhone/web instalada) usan tokens distintos
    const isWeb = (t: string) => t.startsWith("{");
    const messages = items.flatMap((n) =>
      (byUser.get(n.user_id) ?? []).filter((t) => !isWeb(t)).map((to) => ({
        to,
        title: n.title,
        body: n.body,
        data: { ...n.data, notificationId: n.id },
        sound: "default",
        badge: badges.get(n.user_id) ?? undefined,
        channelId: CHANNEL[n.kind] ?? "default",
        priority: n.kind === "game_start" || n.kind === "lead_change" ? "high" : "default",
        _nid: n.id,
      }))
    );

    const retry: number[] = [];
    const badTokens: string[] = [];

    // ---- Web Push ----
    const webJobs = items.flatMap((n) => (byUser.get(n.user_id) ?? []).filter(isWeb).map((token) => ({ n, token })));
    if (webJobs.length) {
      let vapid: Vapid | null = null;
      try {
        vapid = await getVapid(db);
      } catch (e) {
        console.error("vapid", e);
      }
      if (vapid) {
        const queue = [...webJobs];
        await Promise.all(Array.from({ length: Math.min(15, queue.length) }, async () => {
          while (queue.length) {
            const { n, token } = queue.shift()!;
            const sub = parseSubscription(token);
            if (!sub) {
              badTokens.push(token);
              continue;
            }
            const r = await sendWebPush(sub, { title: n.title, body: n.body, tag: (n.data?.tag as string | undefined) ?? `${n.kind}-${n.id}`, data: { ...n.data, notificationId: n.id } }, vapid!);
            if (r.ok) sent++;
            else {
              failed++;
              if (r.gone) badTokens.push(token);
              else console.error("webpush", r.status, r.error);
            }
          }
        }));
      }
    }
    for (const part of chunk(messages, 100)) {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(Deno.env.get("EXPO_ACCESS_TOKEN") ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` } : {}),
          },
          body: JSON.stringify(part.map(({ _nid, ...m }) => m)),
        });
        if (!res.ok) {
          retry.push(...part.map((m) => m._nid));
          failed += part.length;
          continue;
        }
        const out = await res.json();
        (out.data ?? []).forEach((ticket: { status: string; details?: { error?: string } }, i: number) => {
          if (ticket.status === "ok") sent++;
          else {
            failed++;
            if (ticket.details?.error === "DeviceNotRegistered") badTokens.push(part[i].to);
          }
        });
      } catch (_) {
        retry.push(...part.map((m) => m._nid));
        failed += part.length;
      }
    }
    if (retry.length) await db.rpc("release_notifications", { p_ids: [...new Set(retry)] });
    if (badTokens.length) {
      await db.from("push_tokens").delete().in("token", badTokens);
      invalidTokens += badTokens.length;
    }
    if (items.length < 500) break;
  }
  return { sent, failed, invalidTokens };
}
