// Estadísticas de una pelea (UFC): comparativa previa, en vivo y final.
// "c_*" = promedios de carrera (antes de la pelea) · "o_*" = momios por método · resto = estadísticas de esta pelea
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fmtOdds } from "@/lib/odds";
import { colors, series } from "@/lib/theme";
import { statusEs } from "@/lib/time";
import type { Competition, Competitor } from "@/lib/types";
import { competitorImage, competitorName } from "./EventCard";
import { Avatar, Card, CompareBar, Dim, LiveBadge, SectionTitle } from "./ui";

const A = series[0];
const B = series[1];

const num = (v?: string | number | null) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
/** "40/65" → { landed: 40, att: 65 } */
const frac = (v?: string) => {
  const [l, t] = String(v ?? "").split("/").map(Number);
  return { landed: Number.isFinite(l) ? l : NaN, att: Number.isFinite(t) ? t : NaN };
};
const secs = (v?: string) => {
  const [m, s] = String(v ?? "").split(":").map(Number);
  return Number.isFinite(m) ? m * 60 + (s || 0) : NaN;
};
const inches = (v?: string | null) => {
  if (!v) return NaN;
  const m = v.match(/(\d+)'\s*(\d+)?/);
  return m ? Number(m[1]) * 12 + Number(m[2] ?? 0) : num(v);
};

const CAREER: { key: string; label: string; suffix?: string }[] = [
  { key: "c_strikeLPM", label: "Golpes conectados / min" },
  { key: "c_strikeAccuracy", label: "Precisión de golpeo", suffix: "%" },
  { key: "c_takedownAvg", label: "Derribos / 15 min" },
  { key: "c_takedownAccuracy", label: "Precisión de derribos", suffix: "%" },
  { key: "c_submissionAvg", label: "Intentos de sumisión / 15 min" },
];

const FIGHT: { key: string; label: string }[] = [
  { key: "sigStrikes", label: "Golpes significativos" },
  { key: "totalStrikes", label: "Golpes totales" },
  { key: "headStrikes", label: "A la cabeza" },
  { key: "bodyStrikes", label: "Al cuerpo" },
  { key: "legStrikes", label: "A las piernas" },
  { key: "takedowns", label: "Derribos" },
];

export function FightStats({ comp }: { comp: Competition }) {
  const [a, b] = comp.competitors ?? [];
  if (!a || !b) return null;
  const sa = a.stats ?? {}, sb = b.stats ?? {};
  const hasCareer = CAREER.some((c) => sa[c.key] || sb[c.key]);
  const hasFight = FIGHT.some((f) => sa[f.key] || sb[f.key]);
  const hasProps = ["o_ko", "o_sub", "o_dec"].some((k) => sa[k] || sb[k]);
  const live = comp.status === "live";

  return (
    <>
      <SectionTitle title="Estadísticas de la pelea" icon="stats-chart" right={live ? <LiveBadge label={statusEs(comp.status_detail) || "EN VIVO"} /> : null} />
      <Card style={{ marginHorizontal: 16, gap: 6 }}>
        <Header a={a} b={b} comp={comp} />

        {hasFight ? (
          <>
            <Text style={st.block}>{live ? "🔴 En vivo" : comp.status === "final" ? "🏁 Resultado" : "Pelea"}</Text>
            {FIGHT.map(({ key, label }) => {
              const x = frac(sa[key]), y = frac(sb[key]);
              if (!Number.isFinite(x.landed) || !Number.isFinite(y.landed)) return null;
              const pa = x.att ? ` (${Math.round((100 * x.landed) / x.att)}%)` : "";
              const pb = y.att ? ` (${Math.round((100 * y.landed) / y.att)}%)` : "";
              return <CompareBar key={key} label={label} a={x.landed} b={y.landed} aLabel={`${sa[key]}${pa}`} bLabel={`${sb[key]}${pb}`} aColor={A} bColor={B} />;
            })}
            <Row label="Knockdowns" a={sa.knockDowns} b={sb.knockDowns} bar />
            <Row label="Tiempo de control" a={sa.timeInControl} b={sb.timeInControl} bar parse={secs} />
            <Row label="Intentos de sumisión" a={sa.submissions} b={sb.submissions} bar />
            <TargetSplit a={sa} b={sb} />
          </>
        ) : null}

        <Text style={st.block}>📏 Comparativa física</Text>
        <Row label="Récord" a={a.athletes?.record_summary ?? a.record_summary} b={b.athletes?.record_summary ?? b.record_summary} />
        <Row label="Edad" a={a.athletes?.age} b={b.athletes?.age} />
        <Row label="Altura" a={a.athletes?.height} b={b.athletes?.height} bar parse={inches} />
        <Row label="Alcance" a={a.athletes?.reach} b={b.athletes?.reach} bar parse={inches} />
        <Row label="Guardia" a={a.athletes?.stance} b={b.athletes?.stance} />

        {hasCareer ? (
          <>
            <Text style={st.block}>📊 Promedios de carrera (antes de la pelea)</Text>
            {CAREER.map(({ key, label, suffix }) => {
              const x = num(sa[key]), y = num(sb[key]);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return <CompareBar key={key} label={label} a={x} b={y} aLabel={`${sa[key]}${suffix ?? ""}`} bLabel={`${sb[key]}${suffix ?? ""}`} aColor={A} bColor={B} />;
            })}
          </>
        ) : null}

        {hasProps ? (
          <>
            <Text style={st.block}>💵 Momios por método (DraftKings)</Text>
            <View style={st.propHead}>
              <Text style={[st.propCell, { color: A }]}>{competitorName(a, true)}</Text>
              <Text style={st.propLabel} />
              <Text style={[st.propCell, { color: B }]}>{competitorName(b, true)}</Text>
            </View>
            {([["o_ko", "KO / TKO"], ["o_sub", "Sumisión"], ["o_dec", "Decisión"]] as const).map(([k, label]) => (
              <View key={k} style={st.propRow}>
                <Text style={st.propCell}>{sa[k] ? fmtOdds(Number(sa[k])) : "—"}</Text>
                <Text style={st.propLabel}>{label}</Text>
                <Text style={st.propCell}>{sb[k] ? fmtOdds(Number(sb[k])) : "—"}</Text>
              </View>
            ))}
          </>
        ) : null}

        {!hasFight && !hasCareer ? (
          <Dim style={{ marginTop: 6 }}>ESPN publica los promedios de carrera unos días antes de la cartelera; durante la pelea aquí verás los golpes en vivo.</Dim>
        ) : null}
      </Card>
    </>
  );
}

function Header({ a, b, comp }: { a: Competitor; b: Competitor; comp: Competition }) {
  const side = (k: Competitor, color: string, right?: boolean) => (
    <Pressable onPress={() => k.athlete_id && router.push(`/athlete/${k.athlete_id}`)} style={{ flex: 1, alignItems: right ? "flex-end" : "flex-start", gap: 4 }}>
      <View style={{ borderWidth: 2, borderColor: color, borderRadius: 30 }}>
        <Avatar uri={competitorImage(k)} name={competitorName(k)} size={52} />
      </View>
      <Text style={{ color: colors.text, fontWeight: "900", textAlign: right ? "right" : "left" }} numberOfLines={2}>{competitorName(k)}</Text>
      {comp.status === "final" && k.is_winner ? <Text style={{ color: colors.win, fontWeight: "900", fontSize: 11 }}>✓ GANÓ</Text> : null}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
      {side(a, A)}
      <View style={{ alignItems: "center", paddingHorizontal: 6 }}>
        <Text style={{ color: colors.textMuted, fontWeight: "900" }}>VS</Text>
        {comp.label ? <Text style={{ color: colors.textDim, fontSize: 10 }}>{comp.label}</Text> : null}
        {comp.result_method ? (
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800", textAlign: "center" }}>
            {comp.result_method}{comp.result_round ? `\nR${comp.result_round} ${comp.result_time ?? ""}` : ""}
          </Text>
        ) : comp.scheduled_rounds ? <Text style={{ color: colors.textMuted, fontSize: 10 }}>{comp.scheduled_rounds} rounds</Text> : null}
      </View>
      {side(b, B, true)}
    </View>
  );
}

function Row({ label, a, b, bar, parse = num }: { label: string; a?: string | number | null; b?: string | number | null; bar?: boolean; parse?: (v?: string) => number }) {
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return null;
  const x = parse(a === null || a === undefined ? undefined : String(a)), y = parse(b === null || b === undefined ? undefined : String(b));
  if (bar && Number.isFinite(x) && Number.isFinite(y) && (x || y)) {
    return <CompareBar label={label} a={x} b={y} aLabel={String(a ?? "—")} bLabel={String(b ?? "—")} aColor={A} bColor={B} />;
  }
  return (
    <View style={st.row}>
      <Text style={[st.val, { textAlign: "left" }]}>{a ?? "—"}</Text>
      <Text style={st.label}>{label}</Text>
      <Text style={[st.val, { textAlign: "right" }]}>{b ?? "—"}</Text>
    </View>
  );
}

/** Distribución de golpes conectados: cabeza / cuerpo / piernas */
function TargetSplit({ a, b }: { a: Record<string, string>; b: Record<string, string> }) {
  const parts = (s: Record<string, string>) => [frac(s.headStrikes).landed, frac(s.bodyStrikes).landed, frac(s.legStrikes).landed].map((v) => (Number.isFinite(v) ? v : 0));
  const pa = parts(a), pb = parts(b);
  if (!pa.some(Boolean) && !pb.some(Boolean)) return null;
  const tones = ["#F43F5E", "#FBBF24", "#34D399"];
  const bar = (p: number[]) => {
    const t = p.reduce((x, y) => x + y, 0) || 1;
    return (
      <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: colors.cardAlt }}>
        {p.map((v, i) => <View key={i} style={{ flex: v / t, backgroundColor: tones[i] }} />)}
      </View>
    );
  };
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={{ color: colors.textDim, fontSize: 12, textAlign: "center" }}>Dónde conectó cada uno</Text>
      {bar(pa)}
      {bar(pb)}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
        {["Cabeza", "Cuerpo", "Piernas"].map((l, i) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: tones[i] }} />
            <Text style={{ color: colors.textDim, fontSize: 11 }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  block: { color: colors.text, fontWeight: "900", marginTop: 12, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  val: { flex: 1, color: colors.text, fontWeight: "800" },
  label: { flex: 1.2, color: colors.textDim, fontSize: 12, textAlign: "center" },
  propHead: { flexDirection: "row", marginTop: 4 },
  propRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  propCell: { flex: 1, color: colors.text, fontWeight: "900", textAlign: "center" },
  propLabel: { flex: 1, color: colors.textDim, fontSize: 12, textAlign: "center" },
});
