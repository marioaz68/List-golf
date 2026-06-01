import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";

const PRODUCTION_FALLBACK = "https://www.listgolf.club";

function normalizeBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  // Ignorar valores localhost / 127.0.0.1 / 0.0.0.0 cuando estamos en server o build de Vercel.
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function appBaseUrl(): string {
  const explicit = normalizeBase(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;

  // Vercel auto-set: dominio de producción (sin protocolo) si está disponible.
  const prodDomain = normalizeBase(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  );
  if (prodDomain) return prodDomain;

  // En preview: usar URL del deployment.
  const vercelUrl = normalizeBase(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  );
  if (vercelUrl) return vercelUrl;

  return PRODUCTION_FALLBACK;
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
  /** entry_id del jugador receptor — habilita su fila privada. */
  meEntryId?: string | null;
  /** caddie_id receptor — habilita filas privadas de jugadores asignados. */
  caddieId?: string | null;
}): string {
  const base = normalizeBase(params.base) ?? appBaseUrl();
  const sp = new URLSearchParams();
  sp.set("group_id", params.groupId);
  if (params.tournamentId) sp.set("tournament_id", params.tournamentId);
  if (params.roundId) sp.set("round_id", params.roundId);
  const me = String(params.meEntryId ?? "").trim();
  if (me) sp.set("me", me);
  const caddie = String(params.caddieId ?? "").trim();
  if (caddie) sp.set("caddie", caddie);
  if (params.tournamentId) {
    sp.set(
      "back",
      buildScoreEntryHref({ tournamentId: params.tournamentId })
    );
  }
  return `${base}/captura/tarjeta?${sp.toString()}`;
}
