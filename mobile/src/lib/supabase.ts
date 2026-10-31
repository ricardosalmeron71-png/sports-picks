import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isConfigured = url.startsWith("http") && anonKey.length > 20;

export const supabase = createClient(isConfigured ? url : "https://example.supabase.co", isConfigured ? anonKey : "public-anon-key-missing", {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
  realtime: { params: { eventsPerSecond: 20 } },
});

// Refresca el token solo con la app en primer plano (recomendado por Supabase en móvil)
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
