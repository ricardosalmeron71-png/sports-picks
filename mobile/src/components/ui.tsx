// Componentes visuales base reutilizables.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { colors, hex, leagueColor, leagueEmoji, radius } from "@/lib/theme";

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const body = <View style={[s.card, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      {body}
    </Pressable>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}
export function Dim({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[s.dim, style]}>{children}</Text>;
}

export function SectionTitle({ title, right, icon }: { title: string; right?: ReactNode; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={s.sectionRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon && <Ionicons name={icon} size={18} color={colors.primary} />}
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Logo de equipo / foto de jugador con respaldo de iniciales. */
export function Avatar({ uri, name, size = 40, color, rounded = true, contain = false }: {
  uri?: string | null; name?: string | null; size?: number; color?: string | null; rounded?: boolean; contain?: boolean;
}) {
  const initials = (name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [uri]);
  const style = { width: size, height: size, borderRadius: rounded ? size / 2 : radius.sm };
  return (
    <View style={[style, { backgroundColor: contain ? "transparent" : hex(color, colors.cardAlt), overflow: "hidden", alignItems: "center", justifyContent: "center" }]}>
      {!uri || !loaded ? <Text style={{ position: "absolute", color: colors.text, fontWeight: "800", fontSize: size * 0.36 }}>{initials}</Text> : null}
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={contain ? "contain" : "cover"} transition={200} cachePolicy="memory-disk"
          onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
      ) : null}
    </View>
  );
}

export function TeamLogo({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  return <Avatar uri={uri} name={name} size={size} rounded={false} contain />;
}

export function LeaguePill({ id, label, active, onPress, logo }: { id: string; label: string; active?: boolean; onPress?: () => void; logo?: string | null }) {
  const c = leagueColor[id] ?? colors.primary;
  return (
    <Pressable onPress={onPress} style={[s.pill, active && { backgroundColor: c, borderColor: c }]}>
      {logo ? <Image source={{ uri: logo }} style={{ width: 16, height: 16 }} contentFit="contain" /> : <Text>{leagueEmoji[id] ?? "🏆"}</Text>}
      <Text style={[s.pillText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: color ?? colors.primary, borderColor: color ?? colors.primary }]}>
      <Text style={[s.chipText, active && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

/** Indicador "EN VIVO" con pulso */
export function LiveBadge({ label = "EN VIVO" }: { label?: string }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={s.live}>
      <Animated.View style={[s.liveDot, { opacity: a }]} />
      <Text style={s.liveText}>{label}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: "won" | "lost" | "push" | "pending" | "void" }) {
  const map = {
    won: { c: colors.win, t: "GANADO", i: "checkmark-circle" },
    lost: { c: colors.loss, t: "PERDIDO", i: "close-circle" },
    push: { c: colors.push, t: "PUSH", i: "remove-circle" },
    pending: { c: colors.textDim, t: "PENDIENTE", i: "time" },
    void: { c: colors.textMuted, t: "ANULADO", i: "ban" },
  } as const;
  const m = map[status];
  return (
    <View style={[s.status, { borderColor: m.c }]}>
      <Ionicons name={m.i} size={12} color={m.c} />
      <Text style={{ color: m.c, fontSize: 10, fontWeight: "800" }}>{m.t}</Text>
    </View>
  );
}

export function Gradient({ colors: c, children, style }: { colors: [string, string, ...string[]]; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>{children}</LinearGradient>;
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function Empty({ icon = "calendar-outline", title, subtitle }: { icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, textAlign: "center" }}>{title}</Text>
      {subtitle ? <Dim style={{ textAlign: "center" }}>{subtitle}</Dim> : null}
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", icon, disabled, loading }: {
  title: string; onPress?: () => void; variant?: "primary" | "ghost" | "danger"; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: boolean;
}) {
  const bg = variant === "primary" ? colors.primary : variant === "danger" ? colors.loss : "transparent";
  const fg = variant === "ghost" ? colors.primary : colors.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, variant === "ghost" && { borderWidth: 1, borderColor: colors.primary }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "800", fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

/** Barra comparativa A vs B (para comparativos de estadísticas) */
export function CompareBar({ label, a, b, aLabel, bLabel, aColor = colors.primary, bColor = colors.accent, lowerIsBetter = false }: {
  label: string; a: number; b: number; aLabel?: string; bLabel?: string; aColor?: string; bColor?: string; lowerIsBetter?: boolean;
}) {
  const total = Math.abs(a) + Math.abs(b) || 1;
  const pa = Math.abs(a) / total;
  const aWins = lowerIsBetter ? a < b : a > b;
  const bWins = lowerIsBetter ? b < a : b > a;
  return (
    <View style={{ marginVertical: 7 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: aWins ? aColor : colors.textDim, fontWeight: aWins ? "800" : "600" }}>{aLabel ?? a}</Text>
        <Text style={{ color: colors.textDim, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: bWins ? bColor : colors.textDim, fontWeight: bWins ? "800" : "600" }}>{bLabel ?? b}</Text>
      </View>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.cardAlt }}>
        <View style={{ flex: pa, backgroundColor: aColor, opacity: aWins ? 1 : 0.45 }} />
        <View style={{ width: 2 }} />
        <View style={{ flex: 1 - pa, backgroundColor: bColor, opacity: bWins ? 1 : 0.45 }} />
      </View>
    </View>
  );
}

/** Píldoras W/L de forma reciente */
export function FormDots({ results }: { results: ("W" | "L" | "T" | "D" | null)[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {results.map((r, i) => (
        <View key={i} style={[s.formDot, { backgroundColor: r === "W" ? colors.win : r === "L" ? colors.loss : colors.push }]}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>{r === "W" ? "G" : r === "L" ? "P" : "E"}</Text>
        </View>
      ))}
    </View>
  );
}

export function KPI({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={{ color: colors.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: color ?? colors.text, fontSize: 22, fontWeight: "900", marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  h1: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  h2: { color: colors.text, fontSize: 18, fontWeight: "800" },
  dim: { color: colors.textDim, fontSize: 13 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10, paddingHorizontal: 16 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  pillText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textDim, fontWeight: "700", fontSize: 12 },
  live: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  liveText: { color: colors.live, fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  status: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md },
  formDot: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  kpi: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
});
