import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui";
import { joinGroup } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function JoinGroup() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const id = await joinGroup(code);
      router.replace(`/group/${id}`);
    } catch (e) {
      Alert.alert("No se pudo unir", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 14 }}>
      <Text style={{ color: colors.textDim }}>Pide a tu amigo el código de invitación de 8 caracteres.</Text>
      <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} placeholder="A1B2C3D4"
        placeholderTextColor={colors.textMuted}
        style={{ backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 16, fontSize: 28, fontWeight: "900", letterSpacing: 6, textAlign: "center", borderWidth: 1, borderColor: colors.border }} />
      <Button title="Unirme" icon="log-in" onPress={submit} loading={busy} disabled={code.length < 6} />
    </View>
  );
}
