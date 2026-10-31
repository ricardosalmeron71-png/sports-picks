// Comparativos: equipo vs equipo, jugador vs jugador, peleador vs peleador
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Radar } from "@/components/Charts";
import { Avatar, Card, Chip, CompareBar, Dim, FormDots, H1, SectionTitle, TeamLogo } from "@/components/ui";
import { searchAll, useAthlete, useHeadToHead, useTeam, useTeamForm } from "@/lib/api";
import { colors, series } from "@/lib/theme";
import type { Athlete, Team } from "@/lib/types";

type Kind = "team" | "athlete";
const num = (v?: string | number | null) => {
  if (v === null || v === undefined) return NaN;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return n;
};
const parseWL = (s?: string | null) => {
  const [w, l, d] = (s ?? "").split("-").map((x) => Number(x) || 0);
  return { w, l, d };
};
const inches = (s?: string | null) => {
  if (!s) return NaN;
  const m = s.match(/(\d+)'\s*(\d+)?/);
  if (m) return Number(m[1]) * 12 + Number(m[2] ?? 0);
  return num(s);
};

export default function Compare() {
  const params = useLocalSearchParams<{ a?: string; b?: string; kind?: Kind }>();
  const [kind, setKind] = useState<Kind>(params.kind ?? "team");
  const [a, setA] = useState<string | undefined>(params.a);
  const [b, setB] = useState<string | undefined>(params.b);
  useEffect(() => {
    if (params.kind) setKind(params.kind);
    if (params.a) setA(params.a);
    if (params.b) setB(params.b);
  }, [params.a, params.b, params.kind]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 16, gap: 12 }}>
          <H1>Comparar</H1>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Equipos" active={kind === "team"} onPress={() => { setKind("team"); setA(undefined); setB(undefined); }} />
            <Chip label="Jugadores / Peleadores / Pilotos" active={kind === "athlete"} onPress={() => { setKind("athlete"); setA(undefined); setB(undefined); }} />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Picker kind={kind} id={a} onPick={setA} color={series[0]} />
            <Picker kind={kind} id={b} onPick={setB} color={series[1]} />
          </View>
        </View>
        {a && b ? (kind === "team" ? <TeamCompare a={a} b={b} /> : <AthleteCompare a={a} b={b} />) : (
          <Dim style={{ paddingHorizontal: 16 }}>Elige dos {kind === "team" ? "equipos" : "atletas"} de la misma liga para ver el comparativo.</Dim>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Picker({ kind, id, onPick, color }: { kind: Kind; id?: string; onPick: (id?: string) => void; color: string }) {
  const team = useTeam(kind === "team" ? id : undefined);
  const ath = useAthlete(kind === "athlete" ? id : undefined);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; img: string | null; sub: string }[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const r = await searchAll(q);
      setResults(kind === "team"
        ? r.teams.map((t) => ({ id: t.id!, name: t.display_name!, img: t.logo_url ?? null, sub: t.league_id!.toUpperCase() }))
        : r.athletes.map((x) => ({ id: x.id!, name: x.display_name!, img: x.headshot_url ?? null, sub: `${x.league_id?.toUpperCase()} · ${x.position ?? x.weight_class ?? ""}` })));
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  const selected = kind === "team" ? team.data : ath.data;
  if (id && selected) {
    const name = selected.display_name;
    const img = kind === "team" ? (selected as Team).logo_url : (selected as Athlete).headshot_url;
    return (
      <Pressable onPress={() => onPick(undefined)} style={[st.slot, { borderColor: color }]}>
        {kind === "team" ? <TeamLogo uri={img} name={name} size={56} /> : <Avatar uri={img} name={name} size={64} />}
        <Text style={{ color: colors.text, fontWeight: "900", textAlign: "center" }} numberOfLines={2}>{name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>Toca para cambiar</Text>
      </Pressable>
    );
  }
  return (
    <View style={[st.slot, { borderColor: color, alignItems: "stretch" }]}>
      <TextInput value={q} onChangeText={setQ} placeholder="Buscar…" placeholderTextColor={colors.textMuted} style={st.search} />
      {results.slice(0, 6).map((r) => (
        <Pressable key={r.id} onPress={() => { onPick(r.id); setQ(""); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 }}>
          <Avatar uri={r.img} name={r.name} size={24} contain={kind === "team"} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{r.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 9 }}>{r.sub}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TeamCompare({ a, b }: { a: string; b: string }) {
  const ta = useTeam(a).data;
  const tb = useTeam(b).data;
  const fa = useTeamForm(a, 10).data ?? [];
  const fb = useTeamForm(b, 10).data ?? [];
  const h2h = useHeadToHead(a, b).data ?? [];
  if (!ta || !tb) return null;
  const sa = ta.stats ?? {}, sb = tb.stats ?? {};
  const rows: { label: string; a: number; b: number; lower?: boolean; fmt?: (n: number) => string }[] = [
    { label: "Victorias", a: num(sa.wins), b: num(sb.wins) },
    { label: "% Victorias", a: num(sa.winPercent), b: num(sb.winPercent), fmt: (n) => n.toFixed(3) },
    { label: "Puntos a favor / juego", a: num(sa.avgPointsFor ?? sa.pointsFor), b: num(sb.avgPointsFor ?? sb.pointsFor) },
    { label: "Puntos en contra / juego", a: num(sa.avgPointsAgainst ?? sa.pointsAgainst), b: num(sb.avgPointsAgainst ?? sb.pointsAgainst), lower: true },
    { label: "Diferencial", a: num(sa.differential ?? sa.pointDifferential), b: num(sb.differential ?? sb.pointDifferential) },
  ];
  const formPct = (f: typeof fa) => (f.length ? (100 * f.filter((r) => r.result === "W").length) / f.length : NaN);
  rows.push({ label: "Forma (últ. 10) %", a: formPct(fa), b: formPct(fb), fmt: (n) => `${n.toFixed(0)}%` });

  // Estadísticas de temporada en común (primera categoría)
  const cat = Object.keys(ta.season_stats ?? {})[0];
  const common = cat ? Object.keys(ta.season_stats[cat] ?? {}).filter((k) => tb.season_stats?.[cat]?.[k] !== undefined).slice(0, 10) : [];

  const wa = h2h.filter((x) => x.winner === "a").length, wb = h2h.filter((x) => x.winner === "b").length;
  return (
    <>
      <SectionTitle title="Resumen" icon="git-compare" />
      <Card style={{ marginHorizontal: 16 }}>
        {rows.filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b)).map((r) => (
          <CompareBar key={r.label} label={r.label} a={r.a} b={r.b} lowerIsBetter={r.lower} aLabel={r.fmt ? r.fmt(r.a) : String(r.a)} bLabel={r.fmt ? r.fmt(r.b) : String(r.b)} aColor={series[0]} bColor={series[1]} />
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
          <FormDots results={fa.slice(0, 5).map((r) => r.result)} />
          <FormDots results={fb.slice(0, 5).map((r) => r.result)} />
        </View>
      </Card>
      {h2h.length ? (
        <>
          <SectionTitle title="Historial directo" icon="swap-horizontal" />
          <Card style={{ marginHorizontal: 16 }}>
            <CompareBar label={`${h2h.length} juegos`} a={wa} b={wb} aLabel={`${ta.abbreviation} ${wa}`} bLabel={`${wb} ${tb.abbreviation}`} aColor={series[0]} bColor={series[1]} />
          </Card>
        </>
      ) : null}
      {common.length ? (
        <>
          <SectionTitle title={`Temporada · ${cat}`} icon="stats-chart" />
          <Card style={{ marginHorizontal: 16 }}>
            {common.map((k) => {
              const x = num(ta.season_stats[cat][k]), y = num(tb.season_stats[cat][k]);
              return Number.isFinite(x) && Number.isFinite(y) ? (
                <CompareBar key={k} label={k} a={x} b={y} aLabel={ta.season_stats[cat][k]} bLabel={tb.season_stats[cat][k]} aColor={series[0]} bColor={series[1]} lowerIsBetter={/TO|turnover|PF|INT|Fum/i.test(k)} />
              ) : null;
            })}
          </Card>
        </>
      ) : null}
    </>
  );
}

function AthleteCompare({ a, b }: { a: string; b: string }) {
  const xa = useAthlete(a).data;
  const xb = useAthlete(b).data;
  const h2h = useHeadToHead(a, b).data ?? [];
  if (!xa || !xb) return null;
  const combat = ["ufc", "boxing"].includes(xa.league_id);

  const rows: { label: string; a: number; b: number; aL?: string; bL?: string; lower?: boolean }[] = [];
  if (combat) {
    const ra = parseWL(xa.stats?.summary?.["W-L-D"] ?? xa.record_summary), rb = parseWL(xb.stats?.summary?.["W-L-D"] ?? xb.record_summary);
    const ka = parseWL(xa.stats?.summary?.["(T)KO"]), kb = parseWL(xb.stats?.summary?.["(T)KO"]);
    const sa = parseWL(xa.stats?.summary?.SUB), sb = parseWL(xb.stats?.summary?.SUB);
    rows.push(
      { label: "Victorias", a: ra.w, b: rb.w },
      { label: "Derrotas", a: ra.l, b: rb.l, lower: true },
      { label: "% Victorias", a: ra.w / Math.max(1, ra.w + ra.l) * 100, b: rb.w / Math.max(1, rb.w + rb.l) * 100, aL: `${(ra.w / Math.max(1, ra.w + ra.l) * 100).toFixed(0)}%`, bL: `${(rb.w / Math.max(1, rb.w + rb.l) * 100).toFixed(0)}%` },
      { label: "Victorias por KO/TKO", a: ka.w, b: kb.w },
      { label: "Victorias por sumisión", a: sa.w, b: sb.w },
      { label: "Alcance (in)", a: num(xa.reach), b: num(xb.reach), aL: xa.reach ?? "-", bL: xb.reach ?? "-" },
      { label: "Altura (in)", a: inches(xa.height), b: inches(xb.height), aL: xa.height ?? "-", bL: xb.height ?? "-" },
      { label: "Edad", a: Number(xa.age), b: Number(xb.age), lower: true },
    );
  } else {
    const cat = Object.keys(xa.stats?.season ?? {}).find((c) => xb.stats?.season?.[c]) ?? "";
    const sa = xa.stats?.season?.[cat] ?? {}, sb = xb.stats?.season?.[cat] ?? {};
    for (const k of Object.keys(sa).filter((k) => sb[k] !== undefined).slice(0, 14)) {
      rows.push({ label: k, a: num(sa[k]), b: num(sb[k]), aL: sa[k], bL: sb[k], lower: /TO|PF|INT/i.test(k) });
    }
  }
  const valid = rows.filter((r) => Number.isFinite(r.a) && Number.isFinite(r.b));
  // Radar normalizado (0..100 relativo al mayor de los dos)
  const radar = valid.filter((r) => !r.lower).slice(0, 6);
  const norm = (v: number, o: number) => (Math.max(v, o) ? (100 * v) / Math.max(v, o) : 0);

  return (
    <>
      {radar.length >= 3 ? (
        <>
          <SectionTitle title="Perfil" icon="analytics" />
          <Card style={{ marginHorizontal: 16 }}>
            <Radar labels={radar.map((r) => r.label.slice(0, 10))} a={radar.map((r) => norm(r.a, r.b))} b={radar.map((r) => norm(r.b, r.a))} aColor={series[0]} bColor={series[1]} />
          </Card>
        </>
      ) : null}
      <SectionTitle title="Cara a cara" icon="git-compare" />
      <Card style={{ marginHorizontal: 16 }}>
        {valid.length ? valid.map((r) => (
          <CompareBar key={r.label} label={r.label} a={r.a} b={r.b} aLabel={r.aL ?? String(r.a)} bLabel={r.bL ?? String(r.b)} lowerIsBetter={r.lower} aColor={series[0]} bColor={series[1]} />
        )) : <Dim>Abriendo perfiles para traer estadísticas… vuelve a intentar en unos segundos.</Dim>}
      </Card>
      {h2h.length ? (
        <>
          <SectionTitle title="Se han enfrentado" icon="flame" />
          <Card style={{ marginHorizontal: 16 }}>
            {h2h.map((x) => (
              <Text key={x.competition_id} style={{ color: colors.textDim }}>
                {new Date(x.starts_at).getFullYear()} · Ganó {x.winner === "a" ? xa.display_name : x.winner === "b" ? xb.display_name : "nadie (empate)"}{x.method ? ` por ${x.method}` : ""}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  slot: { flex: 1, minHeight: 150, borderRadius: 16, borderWidth: 1.5, padding: 10, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.card },
  search: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
