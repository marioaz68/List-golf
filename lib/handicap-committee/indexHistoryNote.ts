/** Nota visible ante el comité cuando no hay 365 días de revisiones de índice. */

export const WHS_INDEX_HISTORY_REQUIRED_DAYS = 365;

export function formatInsufficientIndexHistoryNote(
  daysAvailable: number
): string {
  return `Sin histórico suficiente de índice — soft/hard cap no evaluable (se requieren ${WHS_INDEX_HISTORY_REQUIRED_DAYS} días, disponibles ${daysAvailable})`;
}

export function isIndexHistoryInsufficient(daysAvailable: number): boolean {
  return daysAvailable < WHS_INDEX_HISTORY_REQUIRED_DAYS;
}
