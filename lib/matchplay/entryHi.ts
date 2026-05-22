/** HI efectivo del inscrito (prioriza HI del torneo sobre el del jugador). */
export function effectiveEntryHi(entry: {
  handicap_index?: number | null;
  player?: {
    handicap_index?: number | null;
    handicap_torneo?: number | null;
  } | null;
}): number {
  const fromEntry = entry.handicap_index;
  if (fromEntry !== null && fromEntry !== undefined && Number.isFinite(fromEntry)) {
    return Number(fromEntry);
  }
  const fromPlayer =
    entry.player?.handicap_torneo ?? entry.player?.handicap_index;
  if (fromPlayer !== null && fromPlayer !== undefined && Number.isFinite(fromPlayer)) {
    return Number(fromPlayer);
  }
  return 0;
}

export function formatPlayerName(p: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}
