// Tema oscuro, alto contraste, pensado para ver marcadores de noche.
export const colors = {
  bg: "#0B0F1A",
  bgElevated: "#121829",
  card: "#161D31",
  cardAlt: "#1C2540",
  border: "#26304D",
  text: "#F4F6FB",
  textDim: "#9AA4BF",
  textMuted: "#6B7591",
  primary: "#22D3EE",
  primaryDim: "#0E7490",
  accent: "#A78BFA",
  live: "#EF4444",
  win: "#22C55E",
  loss: "#F43F5E",
  push: "#EAB308",
  gold: "#FBBF24",
  silver: "#CBD5E1",
  bronze: "#D97706",
};

// Paleta categórica para series en gráficos (validada para fondo oscuro)
export const series = ["#22D3EE", "#A78BFA", "#F472B6", "#FBBF24", "#34D399", "#FB923C", "#60A5FA", "#F87171"];

export const leagueColor: Record<string, string> = {
  nfl: "#3B82F6",
  nba: "#F97316",
  mlb: "#EF4444",
  ufc: "#DC2626",
  boxing: "#EAB308",
  f1: "#E11D48",
};

export const leagueEmoji: Record<string, string> = {
  nfl: "🏈",
  nba: "🏀",
  mlb: "⚾",
  ufc: "🥊",
  boxing: "🥊",
  f1: "🏎️",
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 24 };
export const space = (n: number) => n * 4;

export const hex = (c?: string | null, fallback = colors.primary) => (c ? (c.startsWith("#") ? c : `#${c}`) : fallback);
