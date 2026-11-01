// Sincronización en vivo: escucha cambios de Postgres (Supabase Realtime) y
// parchea en caliente todas las consultas en caché que contienen esa competencia.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import type { Competition, Competitor, SportEvent } from "./types";

type Patch<T> = Partial<T> & { id: string };

function patchEventList(data: unknown, fn: (e: SportEvent) => SportEvent): unknown {
  if (Array.isArray(data)) return data.map((x) => (x && typeof x === "object" && "competitions" in x ? fn(x as SportEvent) : x));
  if (data && typeof data === "object" && "competitions" in (data as object)) return fn(data as SportEvent);
  return data;
}

function applyCompetition(qc: QueryClient, row: Patch<Competition>) {
  const fn = (e: SportEvent): SportEvent => {
    if (!e.competitions?.some((c) => c.id === row.id)) return e;
    const competitions = e.competitions.map((c) => (c.id === row.id ? { ...c, ...row, competitors: c.competitors, odds: c.odds } : c));
    const anyLive = competitions.some((c) => c.status === "live");
    return { ...e, competitions, status: anyLive ? "live" : e.status };
  };
  qc.setQueriesData({ queryKey: ["events"] }, (d: unknown) => patchEventList(d, fn));
  qc.setQueriesData({ queryKey: ["event"] }, (d: unknown) => patchEventList(d, fn));
  qc.setQueriesData({ queryKey: ["upcoming"] }, (d: unknown) => patchEventList(d, fn));
}

function applyCompetitor(qc: QueryClient, row: Patch<Competitor>) {
  const fn = (e: SportEvent): SportEvent => {
    if (!e.competitions?.some((c) => c.id === row.competition_id)) return e;
    return {
      ...e,
      competitions: e.competitions.map((c) =>
        c.id !== row.competition_id ? c : {
          ...c,
          competitors: c.competitors?.map((k) => (k.id === row.id ? { ...k, ...row, teams: k.teams, athletes: k.athletes } : k)),
        }
      ),
    };
  };
  qc.setQueriesData({ queryKey: ["events"] }, (d: unknown) => patchEventList(d, fn));
  qc.setQueriesData({ queryKey: ["event"] }, (d: unknown) => patchEventList(d, fn));
  qc.setQueriesData({ queryKey: ["upcoming"] }, (d: unknown) => patchEventList(d, fn));
}

/** Montar una vez en el layout raíz: mantiene todos los marcadores al segundo. */
export function useGlobalLiveSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const softRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        qc.invalidateQueries({ queryKey: ["my_active_picks"] });
        qc.invalidateQueries({ queryKey: ["my_picks"] });
        qc.invalidateQueries({ queryKey: ["group_picks"] });
        qc.invalidateQueries({ queryKey: ["leaderboard"] });
        qc.invalidateQueries({ queryKey: ["timeline"] });
      }, 1500);
    };

    const channel = supabase
      .channel("live-scores")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "competitions" }, (p) => {
        const row = p.new as Competition;
        applyCompetition(qc, row);
        const old = p.old as Partial<Competition>;
        if (old?.status !== row.status) {
          softRefresh();
          if (row.status === "live" || row.status === "final") qc.invalidateQueries({ queryKey: ["events", "live"] });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "competitors" }, (p) => {
        applyCompetitor(qc, p.new as Competitor);
        softRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "odds" }, (p) => {
        const row = (p.new ?? p.old) as { competition_id?: string };
        if (row?.competition_id) qc.invalidateQueries({ queryKey: ["event"] });
      })
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

/** Picks y chat de un grupo en tiempo real. */
export function useGroupRealtime(groupId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "picks", filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["group_picks", groupId] });
        qc.invalidateQueries({ queryKey: ["leaderboard", groupId] });
        qc.invalidateQueries({ queryKey: ["timeline", groupId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["group_messages", groupId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, qc]);
}

/** Bandeja de notificaciones en vivo */
export function useNotificationsRealtime(userId?: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ["notifications", userId] }))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
}
