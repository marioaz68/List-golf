function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

/**
 * URL del link de captura grupal que se comparte por Telegram.
 *
 * Apunta a /captura/tarjeta?group_id=... — el módulo móvil rápido que ya
 * existe en el proyecto y que carga automáticamente a los jugadores del
 * grupo desde pairing_group_members. Tanto el caddie del jugador como
 * el jugador (o cualquiera del grupo) pueden capturar desde ahí en
 * tiempo real.
 *
 * Mantenemos `tournament_id` y `round_id` como parámetros opcionales en
 * la URL por trazabilidad, aunque el módulo actual solo necesita
 * group_id; así cuando agreguemos contexto del torneo en el header ya
 * está disponible sin romper links viejos.
 */
export function buildGroupCaptureUrl(params: {
  tournamentId: string;
  roundId: string;
  groupId: string;
  base?: string;
}): string {
  const base = (params.base ?? appBaseUrl()).replace(/\/$/, "");
  const sp = new URLSearchParams();
  sp.set("group_id", params.groupId);
  if (params.tournamentId) sp.set("tournament_id", params.tournamentId);
  if (params.roundId) sp.set("round_id", params.roundId);
  return `${base}/captura/tarjeta?${sp.toString()}`;
}
