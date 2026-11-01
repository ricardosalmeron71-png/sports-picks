// Llaves VAPID para Web Push. Se generan una sola vez y quedan en la tabla app_secrets
// (solo accesible con service_role), así no hace falta configurar secretos a mano.
import type { DB } from "./db.ts";

export interface Vapid {
  publicKey: string; // base64url, 65 bytes (punto sin comprimir)
  privateKey: string; // base64url, 32 bytes
  subject: string;
}

const SUBJECT = "https://ricardosalmeron71-png.github.io/sports-picks";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function generate(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(pub), privateKey: jwk.d! };
}

export async function getVapid(db: DB): Promise<Vapid> {
  const read = async () => {
    const { data, error } = await db.from("app_secrets").select("name, value").in("name", ["vapid_public", "vapid_private"]);
    if (error) throw new Error(`app_secrets: ${error.message}`);
    const m = new Map((data ?? []).map((r) => [r.name as string, r.value as string]));
    return m.get("vapid_public") && m.get("vapid_private") ? { publicKey: m.get("vapid_public")!, privateKey: m.get("vapid_private")!, subject: SUBJECT } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const k = await generate();
  // ignoreDuplicates: si dos funciones generan a la vez gana la primera
  await db.from("app_secrets").upsert(
    [{ name: "vapid_public", value: k.publicKey }, { name: "vapid_private", value: k.privateKey }],
    { onConflict: "name", ignoreDuplicates: true },
  );
  const stored = await read();
  if (!stored) throw new Error("No se pudieron guardar las llaves VAPID");
  return stored;
}
