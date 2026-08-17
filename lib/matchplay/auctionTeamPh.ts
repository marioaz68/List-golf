import type { MatchPlayEntryRow, MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";

/** Handicap de torneo (PH): override → playing_handicap guardado. */
export function entryTournamentPh(
  entry: MatchPlayEntryRow | null | undefined
): number | null {
  if (!entry) return null;
  if (
    entry.playing_handicap_override != null &&
    Number.isFinite(Number(entry.playing_handicap_override))
  ) {
    return Math.round(Number(entry.playing_handicap_override));
  }
  if (
    entry.playing_handicap != null &&
    Number.isFinite(Number(entry.playing_handicap))
  ) {
    return Math.round(Number(entry.playing_handicap));
  }
  return null;
}

export function teamPlayerName(t: MatchPlayTeamRow, which: "a" | "b"): string {
  const row = which === "a" ? t.player_a : t.player_b;
  if (row) return formatPlayerName(row.player);
  if (which === "a") return t.team_name?.split("/")[0]?.trim() || "—";
  const parts = (t.team_name ?? "").split("/");
  return parts[1]?.trim() || "";
}

/** "Nombre (PH)" — handicap de torneo al final del nombre. */
export function teamPlayerNameWithPh(
  t: MatchPlayTeamRow,
  which: "a" | "b"
): string {
  const name = teamPlayerName(t, which);
  if (!name) return "";
  const entry = which === "a" ? t.player_a : t.player_b;
  const ph = entryTournamentPh(entry);
  return ph != null ? `${name} (${ph})` : name;
}

export function teamTournamentPhSum(t: MatchPlayTeamRow): number | null {
  const a = entryTournamentPh(t.player_a);
  const b = entryTournamentPh(t.player_b);
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

export function formatPhSum(sum: number | null): string {
  if (sum == null || !Number.isFinite(sum)) return "—";
  return String(sum);
}
