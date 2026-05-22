import { createAdminClient } from "@/utils/supabase/admin";
import { loadBracketView, type BracketView } from "./loadBracketView";
import { roundLabel } from "./bracketUtils";
import type { LowHighHoleBreakdown } from "./scoring/lowHigh";
import type { MatchPlayPairFormat } from "./types";

export type PublicMatchHoleRow = {
  hole_no: number;
  top_points: number | null;
  bottom_points: number | null;
  match_status_after: string | null;
  breakdown: LowHighHoleBreakdown | null;
};

export type PublicBracketMatch = BracketView["matches"][number] & {
  holes: PublicMatchHoleRow[];
  top_total_pts: number | null;
  bottom_total_pts: number | null;
};

export type PublicBracketView = Omit<BracketView, "matches"> & {
  pair_format: MatchPlayPairFormat;
  allowance_pct: number | null;
  matches: PublicBracketMatch[];
  rounds: Array<{
    roundNo: number;
    label: string;
    matches: PublicBracketMatch[];
  }>;
};

function sumPoints(
  holes: PublicMatchHoleRow[],
  side: "top" | "bottom"
): number | null {
  let sum = 0;
  let any = false;
  for (const h of holes) {
    const v = side === "top" ? h.top_points : h.bottom_points;
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

export async function loadPublicBracket(
  tournamentId: string
): Promise<PublicBracketView | null> {
  const base = await loadBracketView(tournamentId);
  if (!base || base.status !== "published") return null;

  const supabase = createAdminClient();

  const { data: rules } = await supabase
    .from("tournament_matchplay_rules")
    .select("pair_format, handicap_allowance_pct")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const pair_format = (rules?.pair_format ?? "fourball") as MatchPlayPairFormat;
  const matchIds = base.matches.map((m) => m.id);

  const holesByMatch = new Map<string, PublicMatchHoleRow[]>();

  if (matchIds.length > 0 && pair_format === "low_high") {
    const { data: holeRows } = await supabase
      .from("matchplay_hole_results")
      .select(
        "match_id, hole_no, top_points, bottom_points, match_status_after, detail_json, scoring_format"
      )
      .in("match_id", matchIds)
      .eq("scoring_format", "low_high")
      .order("hole_no", { ascending: true });

    for (const row of holeRows ?? []) {
      const list = holesByMatch.get(row.match_id) ?? [];
      const detail = row.detail_json as { breakdown?: LowHighHoleBreakdown } | null;
      list.push({
        hole_no: row.hole_no,
        top_points: row.top_points != null ? Number(row.top_points) : null,
        bottom_points:
          row.bottom_points != null ? Number(row.bottom_points) : null,
        match_status_after: row.match_status_after,
        breakdown: detail?.breakdown ?? null,
      });
      holesByMatch.set(row.match_id, list);
    }
  }

  const bracketSize = (base.config_json?.bracket_size as number) ?? 0;

  const matches: PublicBracketMatch[] = base.matches.map((m) => {
    const holes = holesByMatch.get(m.id) ?? [];
    return {
      ...m,
      holes,
      top_total_pts: sumPoints(holes, "top"),
      bottom_total_pts: sumPoints(holes, "bottom"),
    };
  });

  const rounds = Array.from({ length: base.roundCount }, (_, i) => {
    const roundNo = i + 1;
    return {
      roundNo,
      label: roundLabel(roundNo, base.roundCount, bracketSize),
      matches: matches.filter((m) => m.round_no === roundNo),
    };
  });

  return {
    ...base,
    pair_format,
    allowance_pct:
      rules?.handicap_allowance_pct != null
        ? Number(rules.handicap_allowance_pct)
        : null,
    matches,
    rounds,
  };
}
