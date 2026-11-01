// Devuelve la llave pública VAPID (la app web la necesita para suscribirse a notificaciones).
import { adminClient, cors, json } from "../_shared/db.ts";
import { getVapid } from "../_shared/vapid.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const v = await getVapid(adminClient());
    return json({ publicKey: v.publicKey });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
