import { matchPlayMachote } from "@/lib/convocatoria/templates/matchPlayMachote";
import type { ConvocatoriaDraft } from "@/lib/convocatoria/types";
import type {
  MatchPlayAuctionConfig,
  MatchPlayConsolationRule,
  MatchPlayConvocatoriaConfig,
} from "./types";
import { DEFAULT_STROKE_AGGREGATE_TIEBREAKERS } from "./types";

function normalizeConsolations(
  list: MatchPlayConsolationRule[] | undefined
): MatchPlayConsolationRule[] {
  if (!Array.isArray(list)) return [];
  return list.map((c) => {
    if (c.consolation_format !== "stroke_play_aggregate") {
      return {
        ...c,
        match_play_tiebreaker: c.match_play_tiebreaker ?? "sudden_death",
      };
    }
    const tiebreakers =
      c.stroke_aggregate_tiebreakers?.length
        ? c.stroke_aggregate_tiebreakers
        : [...DEFAULT_STROKE_AGGREGATE_TIEBREAKERS];
    return {
      ...c,
      stroke_aggregate_tiebreakers: tiebreakers,
    };
  });
}

const DEFAULT_AUCTION: MatchPlayAuctionConfig = {
  enabled: false,
  pot_percent_of_total: 100,
  min_bid: null,
  max_bid: null,
  player_cover_percent: null,
  currency: "MXN",
};

export function isMatchPlayConvocatoriaDraft(
  draft: ConvocatoriaDraft | null | undefined
): boolean {
  return draft?.tournament_mode === "matchplay";
}

export function normalizeMatchPlayConvocatoriaDraft(
  draft: ConvocatoriaDraft | null | undefined
): ConvocatoriaDraft {
  const defaults = matchPlayMachote();
  const base =
    draft && typeof draft === "object" ? draft : ({} as ConvocatoriaDraft);

  const baseMp = base.matchplay ?? ({} as Partial<MatchPlayConvocatoriaConfig>);
  const matchplay: MatchPlayConvocatoriaConfig = {
    ...defaults.matchplay!,
    ...baseMp,
    auction: {
      ...DEFAULT_AUCTION,
      ...(defaults.matchplay?.auction ?? {}),
      ...(baseMp.auction ?? {}),
    },
    consolations: normalizeConsolations(
      Array.isArray(baseMp.consolations)
        ? baseMp.consolations
        : defaults.matchplay?.consolations
    ),
    prize_shares: Array.isArray(baseMp.prize_shares)
      ? baseMp.prize_shares
      : defaults.matchplay?.prize_shares ?? [],
    trophies: Array.isArray(baseMp.trophies)
      ? baseMp.trophies
      : defaults.matchplay?.trophies ?? [],
  };

  const round_count =
    base.meta?.round_count ?? matchplay.bracket_round_count ?? 4;

  return {
    ...defaults,
    ...base,
    tournament_mode: "matchplay",
    meta: {
      ...defaults.meta,
      ...base.meta,
      total_holes: matchplay.holes_per_match,
      round_count,
      cut_after_holes: null,
      cut_percent: null,
    },
    matchplay,
    categories: Array.isArray(base.categories) && base.categories.length
      ? base.categories
      : defaults.categories,
    competition_rules: [],
    cut_rules: [],
    prize_rules: Array.isArray(base.prize_rules)
      ? base.prize_rules
      : defaults.prize_rules,
    warnings: Array.isArray(base.warnings) ? base.warnings : defaults.warnings,
  };
}
