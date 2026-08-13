/** Nota visible ante el comité cuando no hay 365 días de revisiones de índice. */

import { WHS_LOW_HI_LOOKBACK_DAYS } from "@/lib/ghin-report/whsCaps";

export const WHS_INDEX_HISTORY_REQUIRED_DAYS = WHS_LOW_HI_LOOKBACK_DAYS;

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** «1 de mayo de 2026» desde YYYY-MM-DD. */
export function formatDateLongEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso.slice(0, 10);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

export function formatInsufficientIndexHistoryNote(
  daysAvailable: number
): string {
  return `Sin histórico suficiente de índice — soft/hard cap no evaluable (se requieren ${WHS_INDEX_HISTORY_REQUIRED_DAYS} días, disponibles ${daysAvailable})`;
}

export function isIndexHistoryInsufficient(daysAvailable: number): boolean {
  return daysAvailable < WHS_INDEX_HISTORY_REQUIRED_DAYS;
}

/** Aviso de club: el dataset entero no llega a 365d. Días/fechas ya calculados. */
export function formatClubIndexHistoryBanner(params: {
  firstRevisionIso: string;
  daysAvailable: number;
  requiredDays: number;
  availableFromIso: string;
}): string {
  return (
    `Soft cap y hard cap no evaluables para ningún jugador: el histórico ` +
    `de índices del club arranca el ${formatDateLongEs(params.firstRevisionIso)} ` +
    `(${params.daysAvailable} días) y WHS requiere ${params.requiredDays}. ` +
    `Disponible a partir del ${formatDateLongEs(params.availableFromIso)}.`
  );
}

export function formatNoIndexRevisionsNote(): string {
  return "Sin revisiones de índice";
}

export function formatShortIndexHistoryNote(daysAvailable: number): string {
  return `Solo ${daysAvailable} días de historial de índice`;
}

/** Peor que el resto: menos de la mitad de los días que ya tiene el club. */
export function isIndexHistoryNotablyShort(
  playerDays: number,
  clubDays: number
): boolean {
  if (playerDays <= 0) return false;
  if (clubDays <= 0) return false;
  return playerDays < clubDays / 2;
}
