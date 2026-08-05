/**
 * Criterio de “en vivo” vs “cerrado” para ritmo / capturas retrasadas
 * (horario México, fechas YYYY-MM-DD).
 *
 * Una ronda deja de acumular retraso cuando:
 *  - su `round_date` es anterior a hoy, o
 *  - el `end_date` del torneo es anterior a hoy
 *    (si no hay end_date, se usa start_date solo si no hay round_date).
 */

export function todayMexicoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isYmd(s: string | null | undefined): s is string {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}/.test(s));
}

/** Solo la parte fecha (por si llega ISO con hora). */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (isYmd(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return todayMexicoDate(d);
}

/**
 * true = ronda/torneo ya no deben medirse para ops en vivo
 * (retraso de ritmo o captura no debe seguir creciendo).
 */
export function isOpsRoundClosed(args: {
  roundDate?: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  today?: string;
}): boolean {
  const today = args.today ?? todayMexicoDate();
  const roundDate = toDateOnly(args.roundDate);
  const endDate = toDateOnly(args.tournamentEndDate);
  const startDate = toDateOnly(args.tournamentStartDate);

  if (roundDate && roundDate < today) return true;
  if (endDate && endDate < today) return true;
  // Torneo sin end_date ni round_date: cerrar el día siguiente al start.
  if (!roundDate && !endDate && startDate && startDate < today) return true;
  return false;
}

/** true si la ronda es de hoy (ops en vivo por calendario). */
export function isOpsRoundLive(args: {
  roundDate?: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  today?: string;
}): boolean {
  return !isOpsRoundClosed(args);
}
