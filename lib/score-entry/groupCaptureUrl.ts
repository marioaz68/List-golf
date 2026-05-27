function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

/**
 * URL del link de captura grupal que se comparte por Telegram.
 * Apunta a /score-entry/mobile?... con tournament_id, round_id, group_id.
 * El módulo móvil consumirá esos parámetros para cargar dinámicamente al
 * grupo cuando se implemente la captura en tiempo real.
 */
export function buildGroupCaptureUrl(params: {
  tournamentId: string;
  roundId: string;
  groupId: string;
  base?: string;
}): string {
  const base = (params.base ?? appBaseUrl()).replace(/\/$/, "");
  const sp = new URLSearchParams();
  sp.set("tournament_id", params.tournamentId);
  sp.set("round_id", params.roundId);
  sp.set("group_id", params.groupId);
  return `${base}/score-entry/mobile?${sp.toString()}`;
}
