import type { AllowedRole } from "./requireTournamentAccess";

/** Roles que pueden capturar / revisar tarjetas en un torneo (backoffice). */
export const SCORE_CAPTURE_TOURNAMENT_ROLES: AllowedRole[] = [
  "super_admin",
  "club_admin",
  "tournament_director",
  "score_capture",
  "marshal",
];

/**
 * Usuario operativo de captura (marshal o capturista): en listados de torneos
 * no debe ver acciones de configuración / publicar, solo flujos de captura.
 */
export function isOperationalCaptureUser(roles: string[]): boolean {
  return roles.includes("marshal") || roles.includes("score_capture");
}
