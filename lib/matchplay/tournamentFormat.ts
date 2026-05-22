import type { TournamentSettings } from "@/types/tournament";

export type TournamentFormatType =
  | "stroke"
  | "stableford"
  | "matchplay"
  | "scramble"
  | "shamble"
  | "bestball"
  | "calcutta";

export function getFormatTypeFromSettings(
  settings: TournamentSettings | null | undefined
): TournamentFormatType {
  const raw = settings?.format?.format_type;
  if (raw === "matchplay") return "matchplay";
  if (raw === "stableford") return "stableford";
  return "stroke";
}

export function isMatchPlayFormat(
  settings: TournamentSettings | null | undefined
): boolean {
  return getFormatTypeFromSettings(settings) === "matchplay";
}

export function buildMatchPlayTournamentSettings(
  existing: TournamentSettings | null | undefined,
  params: {
    bracket_round_count: number;
    holes_per_match: 9 | 18;
  }
): TournamentSettings {
  return {
    ...existing,
    format: {
      ...existing?.format,
      format_type: "matchplay",
      round_count: params.bracket_round_count,
      holes: params.holes_per_match,
      scoring_mode: existing?.format?.scoring_mode ?? "gross",
    },
  };
}
