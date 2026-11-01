import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router, Stack, useGlobalSearchParams, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useProfile } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerForPush, useNotificationRouting } from "@/lib/notifications";
import { useGlobalLiveSync, useNotificationsRealtime } from "@/lib/realtime";
import { isConfigured } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { setUtcOffset } from "@/lib/time";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true } },
});

function Gate() {
  const { session, userId, loading } = useAuth();
  const segments = useSegments();
  const params = useGlobalSearchParams<{ code?: string }>();
  const profile = useProfile(userId);

  // Link de invitación abierto sin sesión: se guarda el código y se usa al entrar
  const seg = segments as string[];
  const isJoinLink = seg[0] === "group" && seg[1] === "join" && !!params.code;
  useEffect(() => {
    if (!loading && !session && isJoinLink) AsyncStorage.setItem("pendingInviteCode", String(params.code).toUpperCase()).catch(() => {});
  }, [loading, session, isJoinLink, params.code]);
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem("pendingInviteCode").then((code) => {
      if (!code) return;
      AsyncStorage.removeItem("pendingInviteCode").catch(() => {});
      router.push(`/group/join?code=${code}`);
    }).catch(() => {});
  }, [userId]);

  useGlobalLiveSync(!!session);
  useNotificationsRealtime(userId);
  useNotificationRouting();

  useEffect(() => {
    if (userId) registerForPush(userId).catch((e) => console.warn("push", e));
  }, [userId]);

  useEffect(() => {
    if (profile.data) setUtcOffset(profile.data.utc_offset_minutes);
  }, [profile.data]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const inAuth = segments[0] === "login";
  if (!session && !inAuth) return <Redirect href="/login" />;
  if (session && inAuth) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerBackTitle: "Atrás",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ title: "" }} />
      <Stack.Screen name="team/[id]" options={{ title: "" }} />
      <Stack.Screen name="athlete/[id]" options={{ title: "" }} />
      <Stack.Screen name="league/[id]" options={{ title: "" }} />
      <Stack.Screen name="group/[id]" options={{ title: "" }} />
      <Stack.Screen name="group/new" options={{ title: "Nuevo grupo", presentation: "modal" }} />
      <Stack.Screen name="group/join" options={{ title: "Unirme a un grupo", presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ title: "Notificaciones" }} />
      <Stack.Screen name="search" options={{ title: "Buscar", presentation: "modal" }} />
    </Stack>
  );
}

function NotConfigured() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>Configura Supabase</Text>
      <Text style={{ color: colors.textDim }}>
        Copia mobile/.env.example a mobile/.env y define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY. Luego reinicia con
        "npx expo start -c".
      </Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          {isConfigured ? <Gate /> : <NotConfigured />}
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
