import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) =>
  <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "En vivo", tabBarIcon: icon("pulse") }} />
      <Tabs.Screen name="sports" options={{ title: "Deportes", tabBarIcon: icon("trophy") }} />
      <Tabs.Screen name="groups" options={{ title: "Grupos", tabBarIcon: icon("people") }} />
      <Tabs.Screen name="compare" options={{ title: "Comparar", tabBarIcon: icon("git-compare") }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil", tabBarIcon: icon("person-circle") }} />
    </Tabs>
  );
}
