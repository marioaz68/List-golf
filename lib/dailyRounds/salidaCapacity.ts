/**
 * Cupo de jugadores por salida en rondas del día (no torneos):
 *   - Lunes a viernes: hasta 7 jugadores
 *   - Sábado y domingo: hasta 5 jugadores
 *
 * Se deriva de la fecha de la ronda (YYYY-MM-DD). Usamos las 12:00 locales
 * para evitar corrimientos de zona horaria al calcular el día de la semana.
 */
export const WEEKDAY_SALIDA_CAPACITY = 7;
export const WEEKEND_SALIDA_CAPACITY = 5;

export function maxPlayersForDate(dateIso: string | null | undefined): number {
  if (!dateIso) return WEEKDAY_SALIDA_CAPACITY;
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return WEEKDAY_SALIDA_CAPACITY;
  const day = d.getDay(); // 0=domingo, 6=sábado
  return day === 0 || day === 6
    ? WEEKEND_SALIDA_CAPACITY
    : WEEKDAY_SALIDA_CAPACITY;
}
