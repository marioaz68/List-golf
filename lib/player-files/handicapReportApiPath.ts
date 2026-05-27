/** Ruta API que redirige al reporte GHIN firmado (usable en <a href> en cliente). */
export function handicapReportApiPath(playerId: string): string {
  return `/api/players/${encodeURIComponent(playerId)}/handicap-report`;
}
