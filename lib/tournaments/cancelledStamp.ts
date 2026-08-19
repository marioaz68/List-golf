/** Prueba Calcuta Varonil — no confundir con el torneo oficial. */
export const PRUEBA_CALCUTA_TOURNAMENT_ID =
  "03b3dde9-fa40-4604-ac10-bb433e3086a2";

export function tournamentShowsCancelledStamp(
  tournamentId: string,
  opts?: { shortName?: string | null; name?: string | null }
): boolean {
  if (tournamentId === PRUEBA_CALCUTA_TOURNAMENT_ID) return true;
  const hay = `${opts?.shortName ?? ""} ${opts?.name ?? ""}`.toLowerCase();
  return hay.includes("prueba") && hay.includes("calcuta");
}
