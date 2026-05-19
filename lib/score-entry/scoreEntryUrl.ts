export type ScoreEntryMode = "capture" | "modify";

export function parseScoreEntryMode(
  value: string | undefined
): ScoreEntryMode {
  return String(value ?? "").trim().toLowerCase() === "modify"
    ? "modify"
    : "capture";
}

export function buildScoreEntryHref(params: {
  mode?: ScoreEntryMode;
  tournamentId?: string | null;
  q?: string | null;
  entryId?: string | null;
  roundNo?: number | null;
}): string {
  const qs = new URLSearchParams();
  if (params.mode === "modify") qs.set("mode", "modify");
  const tid = String(params.tournamentId ?? "").trim();
  if (tid) qs.set("tournament_id", tid);
  const q = String(params.q ?? "").trim();
  if (q) qs.set("q", q);
  const entryId = String(params.entryId ?? "").trim();
  if (entryId) qs.set("entry_id", entryId);
  if (params.roundNo != null && params.roundNo >= 1) {
    qs.set("round_no", String(params.roundNo));
  }
  const query = qs.toString();
  return query ? `/score-entry?${query}` : "/score-entry";
}
