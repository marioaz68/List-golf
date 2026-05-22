import { usgaAllowanceForFormat } from "../usgaAllowances";
import type {
  MatchPlayHandicapAllowance,
  MatchPlayMatchType,
  MatchPlayPairFormat,
} from "../types";

/** % de HI aplicado a cada jugador en el partido. */
export function resolveMatchHandicapPct(params: {
  match_type: MatchPlayMatchType;
  pair_format: MatchPlayPairFormat;
  handicap_allowance: MatchPlayHandicapAllowance;
  handicap_allowance_custom_pct: number | null;
}): number {
  const { match_type, pair_format, handicap_allowance, handicap_allowance_custom_pct } =
    params;

  if (handicap_allowance === "scratch") return 0;

  if (handicap_allowance === "custom") {
    const custom = Number(handicap_allowance_custom_pct);
    if (Number.isFinite(custom) && custom >= 0) return custom;
    return usgaAllowanceForFormat(match_type, pair_format).match_play_pct ?? 100;
  }

  if (handicap_allowance === "fourball_85") {
    return usgaAllowanceForFormat(match_type, pair_format).match_play_pct ?? 90;
  }

  if (handicap_allowance === "foursomes_50_combined") {
    return usgaAllowanceForFormat(match_type, pair_format).match_play_pct ?? 50;
  }

  if (handicap_allowance === "full_relative") {
    return 100;
  }

  const row = usgaAllowanceForFormat(match_type, pair_format);
  return row.match_play_pct ?? row.custom_pct ?? 100;
}
