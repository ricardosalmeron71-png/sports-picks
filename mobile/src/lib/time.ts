// Formato de fecha/hora con desplazamiento fijo (por defecto UTC-7, Hermosillo/Arizona).
// Se implementa sin Intl para que sea idéntico en iOS, Android y web.
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let OFFSET_MIN = -420; // UTC-7
export const setUtcOffset = (minutes: number) => (OFFSET_MIN = minutes);
export const getUtcOffset = () => OFFSET_MIN;

export function offsetLabel(min = OFFSET_MIN) {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function local(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() + OFFSET_MIN * 60_000);
}

export function fmtTime(iso: string) {
  const d = local(iso);
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function fmtDate(iso: string) {
  const d = local(iso);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function fmtDateLong(iso: string) {
  const d = local(iso);
  return `${DIAS_LARGO[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateTime(iso: string) {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

/** Clave de día local (yyyy-mm-dd) para agrupar */
export function dayKey(iso: string | Date) {
  return local(iso).toISOString().slice(0, 10);
}

export function relativeDay(iso: string) {
  const today = dayKey(new Date());
  const key = dayKey(iso);
  const tomorrow = dayKey(new Date(Date.now() + 86400_000));
  const yesterday = dayKey(new Date(Date.now() - 86400_000));
  if (key === today) return "Hoy";
  if (key === tomorrow) return "Mañana";
  if (key === yesterday) return "Ayer";
  return fmtDate(iso);
}

export function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Ya comenzó";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (d > 0) return `en ${d}d ${h}h`;
  if (h > 0) return `en ${h}h ${m}m`;
  return `en ${m} min`;
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/** Traduce los estados de ESPN ("Final/OT", "End of 3rd", "Halftime"…) al español. */
export function statusEs(s?: string | null) {
  if (!s) return "";
  return s
    .replace(/^Final\/OT$/i, "Final (TE)")
    .replace(/^Final\/(\d+)$/i, "Final ($1 entradas)")
    .replace(/^Final$/i, "Final")
    .replace(/In Progress/i, "En curso")
    .replace(/Halftime/i, "Medio tiempo")
    .replace(/End of (\d)(st|nd|rd|th)/i, "Fin del $1º")
    .replace(/Top (\d+)(st|nd|rd|th)/i, "Alta $1ª")
    .replace(/Bot(tom)? (\d+)(st|nd|rd|th)/i, "Baja $2ª")
    .replace(/Mid (\d+)(st|nd|rd|th)/i, "Mitad $1ª")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1º")
    .replace(/\bQtr\b/i, "C")
    .replace(/Delayed/i, "Retrasado")
    .replace(/Postponed/i, "Pospuesto")
    .replace(/Canceled|Cancelled/i, "Cancelado")
    .replace(/Rain Delay/i, "Retraso por lluvia")
    .replace(/Scheduled/i, "Programado")
    .replace(/^OT$/i, "Tiempo extra");
}

/** Redondea puntos a 2 decimales sin ceros sobrantes */
export const fmtPts = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return String(Math.round(v * 100) / 100);
};

/** Inicio y fin (ISO) de un día local (UTC-7 por defecto); dayOffset 0 = hoy */
export function localDayBounds(dayOffset = 0) {
  const nowLocal = new Date(Date.now() + OFFSET_MIN * 60_000);
  const startLocal = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()) + dayOffset * 86400_000;
  const from = startLocal - OFFSET_MIN * 60_000;
  return { from: new Date(from).toISOString(), to: new Date(from + 86400_000 - 1).toISOString() };
}
