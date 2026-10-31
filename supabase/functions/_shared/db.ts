import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { LeagueConf } from "./espn.ts";

export type DB = SupabaseClient;

export function adminClient(): DB {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Las funciones de sincronización solo aceptan llamadas del cron (secreto compartido) o del service role. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  const header = req.headers.get("x-cron-secret");
  if (secret && header && header === secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!service && auth === `Bearer ${service}`;
}

export async function readBody<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

export async function loadLeagues(db: DB, ids?: string[]): Promise<(LeagueConf & { odds_api_key: string | null; thesportsdb_id: string | null })[]> {
  let q = db.from("leagues").select("id, kind, espn_sport, espn_league, odds_api_key, thesportsdb_id").eq("active", true);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Envuelve un job registrando su ejecución en sync_runs. */
export async function track<T>(db: DB, job: string, leagueId: string | null, fn: () => Promise<number>): Promise<{ job: string; league: string | null; items?: number; error?: string }> {
  const { data: run } = await db.from("sync_runs").insert({ job, league_id: leagueId }).select("id").single();
  try {
    const items = await fn();
    if (run) await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: true, items }).eq("id", run.id);
    return { job, league: leagueId, items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error(job, leagueId, msg);
    if (run) await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: false, error: msg.slice(0, 2000) }).eq("id", run.id);
    return { job, league: leagueId, error: msg };
  }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function uniqBy<T>(arr: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of arr) m.set(key(x), x);
  return [...m.values()];
}

/** Compara valores ignorando diferencias de formato (timestamps, numeric, orden de llaves). */
export function same(a: unknown, b: unknown): boolean {
  return canon(a) === canon(b);
}
function canon(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return `"${new Date(t).toISOString()}"`;
  }
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v)) return String(Number(v));
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${k}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** Devuelve solo las filas nuevas o que cambiaron respecto a lo existente. */
export function changedRows<T extends Record<string, unknown>>(
  rows: T[],
  existing: Map<string, Record<string, unknown>>,
  key: (r: T) => string,
): T[] {
  return rows.filter((r) => {
    const old = existing.get(key(r));
    if (!old) return true;
    return Object.keys(r).some((k) => !same(r[k], old[k]));
  });
}
