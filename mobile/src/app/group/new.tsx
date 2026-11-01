import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Button, Chip, LeaguePill } from "@/components/ui";
import { useCreateGroup, useLeagues } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { showAlert } from "@/lib/dialog";
import { colors } from "@/lib/theme";
import type { LeagueId } from "@/lib/types";

export default function NewGroup() {
  const { userId } = useAuth();
  const leagues = useLeagues();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<LeagueId[]>([]);
  const [mode, setMode] = useState<"points" | "units">("points");
  const [busy, setBusy] = useState(false);

  const toggle = (id: LeagueId) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (name.trim().length < 2) return showAlert("Nombre muy corto", "Escribe al menos 2 letras.");
    setBusy(true);
    try {
      const g = await create.mutateAsync({
        name: name.trim(), description, leagues: selected, ownerId: userId!,
        scoring: mode === "units" ? { mode: "units" } : { mode: "points", winner: 1, spread: 1, total: 1, method: 3, podium: 2, underdog_bonus: true },
      });
      router.replace(`/group/${g.id}`);
    } catch (e) {
      showAlert("No se pudo crear el grupo", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Label text="Nombre del grupo" />
      <TextInput value={name} onChangeText={setName} placeholder="Ej. Los Compas del Domingo" placeholderTextColor={colors.textMuted} style={inp} />
      <Label text="Descripción (opcional)" />
      <TextInput value={description} onChangeText={setDescription} placeholder="Reglas, premio, etc." placeholderTextColor={colors.textMuted} style={[inp, { minHeight: 70 }]} multiline />
      <Label text="Ligas (vacío = todas)" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(leagues.data ?? []).map((l) => <LeaguePill key={l.id} id={l.id} label={l.short_name} logo={l.logo_url} active={selected.includes(l.id)} onPress={() => toggle(l.id)} />)}
      </View>
      <Label text="Sistema de puntuación" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Puntos fijos" active={mode === "points"} onPress={() => setMode("points")} />
        <Chip label="Unidades (según momio)" active={mode === "units"} onPress={() => setMode("units")} />
      </View>
      <Text style={{ color: colors.textDim, fontSize: 12 }}>
        {mode === "points"
          ? "Ganador/Spread/Total = 1 pt · Método de victoria = 3 pts · Podio F1 = 2 pts · Bonus por underdog (momio +)"
          : "Cada pick apuesta 1 unidad: ganas lo que pagaría el momio (+150 = +1.5u) y pierdes -1u. Como un apostador real."}
      </Text>
      <Button title="Crear grupo" icon="checkmark" onPress={submit} loading={busy} />
    </ScrollView>
  );
}

const Label = ({ text }: { text: string }) => <Text style={{ color: colors.textDim, fontWeight: "800", fontSize: 12, textTransform: "uppercase" }}>{text}</Text>;
const inp = { backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16 } as const;
