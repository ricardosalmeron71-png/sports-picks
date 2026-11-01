// Actualizaciones por aire (EAS Update): la app baja los cambios de JavaScript sola, sin reinstalar el APK.
// Al abrir la app: busca, descarga y reinicia una vez. Si vuelves de segundo plano, avisa con un banner
// (para no borrarte picks que estés eligiendo).
import * as Updates from "expo-updates";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

const MIN_INTERVAL_MS = 5 * 60_000;

export function useAutoUpdate() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web" || !Updates.isEnabled) return;
    let last = 0;
    let cancelled = false;
    const check = async (reloadNow: boolean) => {
      if (Date.now() - last < MIN_INTERVAL_MS) return;
      last = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        if (reloadNow) await Updates.reloadAsync();
        else setReady(true);
      } catch {
        // sin internet o sin actualización: se intenta de nuevo la próxima vez
      }
    };
    check(true);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check(false);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const apply = useCallback(() => Updates.reloadAsync().catch(() => {}), []);
  return { ready, apply };
}

/** Texto para mostrar en Perfil: "v1.0.0 · actualización del 1 nov, 5:30 am" */
export function versionLabel() {
  if (Platform.OS === "web") return "Versión web (siempre actualizada)";
  const base = "v1.0.0";
  if (!Updates.isEnabled) return `${base} · sin actualizaciones por aire`;
  if (Updates.isEmbeddedLaunch) return `${base} · versión de fábrica`;
  const d = Updates.createdAt;
  return d ? `${base} · actualización ${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : base;
}
