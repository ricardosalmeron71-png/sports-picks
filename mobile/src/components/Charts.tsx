// Gráficos (react-native-gifted-charts) con estilo consistente para fondo oscuro.
import { useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { BarChart, LineChart, PieChart, RadarChart } from "react-native-gifted-charts";
import { colors, series } from "@/lib/theme";

const axis = {
  xAxisColor: colors.border,
  yAxisColor: "transparent",
  yAxisTextStyle: { color: colors.textMuted, fontSize: 10 },
  xAxisLabelTextStyle: { color: colors.textMuted, fontSize: 9 },
  rulesColor: "rgba(255,255,255,0.06)",
  rulesType: "solid" as const,
};

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width) };
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: it.color }} />
          <Text style={{ color: colors.textDim, fontSize: 12 }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Líneas múltiples (ej. puntos acumulados por miembro, tendencia de un jugador) */
export function TrendChart({ seriesData, height = 180, labels, showDots = true, area = false }: {
  seriesData: { label: string; values: number[]; color?: string }[];
  height?: number;
  labels?: string[];
  showDots?: boolean;
  area?: boolean;
}) {
  const { w, onLayout } = useWidth();
  const n = Math.max(1, ...seriesData.map((s) => s.values.length));
  const spacing = Math.max(14, (w - 90) / Math.max(1, n - 1));
  const dataSet = seriesData.slice(0, 8).map((s, i) => ({
    data: s.values.map((v, j) => ({ value: v, label: labels && (n <= 8 || j % Math.ceil(n / 6) === 0) ? labels[j] : undefined })),
    color: s.color ?? series[i % series.length],
    dataPointsColor: s.color ?? series[i % series.length],
    thickness: 2.5,
    areaChart: area && i === 0,
    startFillColor: s.color ?? series[i % series.length],
    endFillColor: colors.bg,
    startOpacity: 0.35,
    endOpacity: 0,
  }));
  const all = seriesData.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  return (
    <View onLayout={onLayout}>
      {w > 0 && all.length ? (
        <LineChart
          dataSet={dataSet}
          height={height}
          width={w - 64}
          spacing={spacing}
          initialSpacing={8}
          endSpacing={8}
          curved
          isAnimated
          hideDataPoints={!showDots}
          dataPointsRadius={3}
          noOfSections={4}
          mostNegativeValue={min < 0 ? min : undefined}
          {...axis}
        />
      ) : null}
      {seriesData.length > 1 ? <Legend items={seriesData.slice(0, 8).map((s, i) => ({ label: s.label, color: s.color ?? series[i % series.length] }))} /> : null}
    </View>
  );
}

/** Barras (ej. puntos por partido, comparativo de equipos) */
export function Bars({ data, height = 170, color = colors.primary }: {
  data: { label: string; value: number; color?: string; top?: string }[];
  height?: number;
  color?: string;
}) {
  const { w, onLayout } = useWidth();
  const n = Math.max(1, data.length);
  const usable = w - 80;
  const barWidth = Math.max(8, Math.min(28, usable / n - 8));
  return (
    <View onLayout={onLayout}>
      <BarChart
        data={data.map((d) => ({
          value: d.value,
          label: d.label,
          frontColor: d.color ?? color,
          topLabelComponent: d.top ? () => <Text style={{ color: colors.textDim, fontSize: 9, marginBottom: 2 }}>{d.top}</Text> : undefined,
        }))}
        height={height}
        width={w - 64}
        barWidth={barWidth}
        initialSpacing={6}
        spacing={Math.max(4, (usable - barWidth * n) / n)}
        roundedTop
        isAnimated
        noOfSections={4}
        {...axis}
      />
    </View>
  );
}

/** Dona (ej. consenso del grupo, probabilidad implícita) */
export function Donut({ slices, center, size = 120 }: {
  slices: { value: number; color: string; label?: string }[];
  center?: { title: string; subtitle?: string };
  size?: number;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <PieChart
        data={slices.map((s) => ({ value: Math.max(s.value, 0.0001), color: s.color }))}
        donut
        radius={size / 2}
        innerRadius={size / 2 - 14}
        innerCircleColor={colors.card}
        isAnimated
        centerLabelComponent={() =>
          center ? (
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18 }}>{center.title}</Text>
              {center.subtitle ? <Text style={{ color: colors.textDim, fontSize: 10 }}>{center.subtitle}</Text> : null}
            </View>
          ) : null}
      />
      {slices.some((s) => s.label) ? <Legend items={slices.filter((s) => s.label).map((s) => ({ label: s.label!, color: s.color }))} /> : null}
    </View>
  );
}

/** Radar para comparar perfiles (atributos normalizados 0..100) */
export function Radar({ labels, a, b, aColor = colors.primary, bColor = colors.accent, size = 260 }: {
  labels: string[]; a: number[]; b?: number[]; aColor?: string; bColor?: string; size?: number;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <RadarChart
        labels={labels}
        dataSet={b ? [a, b] : [a]}
        maxValue={100}
        chartSize={size}
        noOfSections={4}
        labelConfig={{ stroke: colors.textDim, fontSize: 11, fontWeight: "700" }}
        polygonConfigArray={[
          { fill: aColor, stroke: aColor, strokeWidth: 2, opacity: 0.35 },
          { fill: bColor, stroke: bColor, strokeWidth: 2, opacity: 0.35 },
        ]}
        gridConfig={{ stroke: colors.border, fill: colors.card }}
        asterLinesConfig={{ stroke: colors.border }}
        isAnimated
      />
    </View>
  );
}
