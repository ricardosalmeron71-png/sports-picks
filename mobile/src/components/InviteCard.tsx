// Código de invitación del grupo: copiar código, copiar link o compartir por WhatsApp, etc.
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { inviteLink, inviteMessage } from "@/lib/config";
import { colors, radius } from "@/lib/theme";

type Copied = "code" | "link" | "msg" | null;

export function InviteCard({ name, code }: { name: string; code: string }) {
  const [copied, setCopied] = useState<Copied>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (what: Exclude<Copied, null>, text: string) => {
    await Clipboard.setStringAsync(text);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(what);
  };

  const share = async () => {
    const message = inviteMessage(name, code);
    try {
      // En web sin menú nativo de compartir se copia el mensaje completo
      if (Platform.OS === "web" && !(globalThis.navigator as Navigator | undefined)?.share) return copy("msg", message);
      await Share.share({ message });
    } catch {
      copy("msg", message);
    }
  };

  return (
    <View style={st.card}>
      <Text style={st.label}>CÓDIGO DE INVITACIÓN</Text>
      <Pressable onPress={() => copy("code", code)} style={st.codeRow}>
        <Text selectable style={st.code}>{code}</Text>
        <Ionicons name={copied === "code" ? "checkmark-circle" : "copy-outline"} size={22} color={copied === "code" ? colors.win : colors.primary} />
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Btn wide icon={copied === "code" ? "checkmark" : "copy-outline"} label={copied === "code" ? "¡Copiado!" : "Copiar código"} onPress={() => copy("code", code)} done={copied === "code"} />
        <Btn icon={copied === "link" ? "checkmark" : "link-outline"} label={copied === "link" ? "¡Copiado!" : "Copiar link"} onPress={() => copy("link", inviteLink(code))} done={copied === "link"} />
        <Btn icon={copied === "msg" ? "checkmark" : "share-social-outline"} label={copied === "msg" ? "¡Copiado!" : "Compartir"} onPress={share} done={copied === "msg"} primary />
      </View>
    </View>
  );
}

function Btn({ icon, label, onPress, done, primary, wide }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; done?: boolean; primary?: boolean; wide?: boolean }) {
  const color = done ? colors.win : primary ? colors.bg : colors.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.btn, wide && { flex: 1.5 }, primary && !done && { backgroundColor: colors.primary, borderColor: colors.primary }, done && { borderColor: colors.win }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 4, padding: 12, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 8 },
  label: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  code: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 6 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
});
