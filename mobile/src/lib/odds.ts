// Utilidades de momios (formato americano) y probabilidades implícitas.
export const fmtOdds = (p?: number | null) => (p === null || p === undefined ? "—" : p > 0 ? `+${p}` : `${p}`);

export const fmtLine = (p?: number | null, signed = true) =>
  p === null || p === undefined ? "—" : signed && p > 0 ? `+${p}` : `${p}`;

/** Probabilidad implícita 0..1 de un momio americano */
export function impliedProb(price: number) {
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

/** Quita el margen (vig) de la casa en un mercado de 2 resultados */
export function noVig(a: number, b: number): [number, number] {
  const pa = impliedProb(a), pb = impliedProb(b);
  return [pa / (pa + pb), pb / (pa + pb)];
}

export function toDecimal(price: number) {
  return price > 0 ? 1 + price / 100 : 1 + 100 / -price;
}

/** Ganancia por 1 unidad apostada */
export function profitPerUnit(price: number) {
  return toDecimal(price) - 1;
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const BOOK_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  williamhill_us: "Caesars",
  pointsbetus: "PointsBet",
  betrivers: "BetRivers",
  bovada: "Bovada",
  betonlineag: "BetOnline",
  mybookieag: "MyBookie",
  espnbet: "ESPN BET",
  fanatics: "Fanatics",
  lowvig: "LowVig",
  betus: "BetUS",
};
export const bookName = (k: string) => BOOK_NAMES[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
