// Vacía la cola de notificaciones hacia Expo Push (iOS + Android).
import { adminClient, isAuthorizedCron, json } from "../_shared/db.ts";
import { flushPushQueue } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return json({ error: "unauthorized" }, 401);
  try {
    return json({ ok: true, ...(await flushPushQueue(adminClient())) });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
