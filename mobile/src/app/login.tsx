import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Gradient } from "@/components/ui";
import { showAlert } from "@/lib/dialog";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || password.length < 6) return showAlert("Datos incompletos", "Correo y contraseña de al menos 6 caracteres.");
    setBusy(true);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() || undefined, full_name: username.trim() || undefined } } });
    setBusy(false);
    if (error) showAlert("Error", error.message);
    else if (mode === "up") showAlert("¡Listo!", "Cuenta creada. Si tu proyecto exige confirmación, revisa tu correo.");
  };

  return (
    <Gradient colors={["#0B0F1A", "#14213D", "#0B0F1A"]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center", gap: 14 }}>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 54 }}>🏆</Text>
              <Text style={st.brand}>SPORTS PICKS</Text>
              <Text style={{ color: colors.textDim, textAlign: "center", marginTop: 6 }}>
                NFL · NBA · MLB · UFC · Box · F1{"\n"}Marcadores en vivo, estadísticas y picks con tus amigos
              </Text>
            </View>
            {mode === "up" ? (
              <Field icon="person-outline" placeholder="Nombre de usuario" value={username} onChangeText={setUsername} />
            ) : null}
            <Field icon="mail-outline" placeholder="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Field icon="lock-closed-outline" placeholder="Contraseña" value={password} onChangeText={setPassword} secure />
            <Button title={mode === "in" ? "Entrar" : "Crear cuenta"} onPress={submit} loading={busy} />
            <Button variant="ghost" title={mode === "in" ? "¿Nuevo? Crea tu cuenta" : "Ya tengo cuenta"} onPress={() => setMode(mode === "in" ? "up" : "in")} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Gradient>
  );
}

function Field({ icon, secure, ...props }: { icon: keyof typeof Ionicons.glyphMap; secure?: boolean; placeholder: string; value: string; onChangeText: (s: string) => void; keyboardType?: "email-address" }) {
  return (
    <View style={st.field}>
      <Ionicons name={icon} size={18} color={colors.textDim} />
      <TextInput {...props} secureTextEntry={secure} autoCapitalize="none" placeholderTextColor={colors.textMuted} style={st.input} />
    </View>
  );
}

const st = StyleSheet.create({
  brand: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 2, marginTop: 8 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, paddingVertical: 14, fontSize: 16 },
});
