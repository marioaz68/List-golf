import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";

/** URL pública de resultados en vivo según formato del torneo. */
export function buildLiveResultsUrl(params: {
  tournamentId: string;
  settings?: TournamentSettings | null;
}): string {
  const tid = String(params.tournamentId ?? "").trim();
  if (!tid) return "/";
  const variant = (
    params.settings as { format?: { matchplay_variant?: string } } | null
  )?.format?.matchplay_variant;
  if (variant === "ryder") {
    return `/torneos/${tid}/ryder`;
  }
  if (isMatchPlayFormat(params.settings ?? null)) {
    return `/torneos/${tid}/matches-vivo`;
  }
  return `/torneos/${tid}?view=live`;
}
