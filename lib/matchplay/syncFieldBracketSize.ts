import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countMatchPlayFieldUnits,
  fieldBracketSize,
  isCountableMatchPlayEntryStatus,
  roundCountForBracketSize,
} from "@/lib/matchplay/bracketUtils";

export type SyncFieldBracketSizeResult = {
  ok: true;
  skipped?: boolean;
  unitCount: number;
  unitLabel: "parejas" | "jugadores";
  bracketSize: number;
  roundCount: number;
};

/**
 * Fija `bracket_main_pairs` a 8 / 16 / 32 / 64 según el campo:
 * max(equipos activos, inscritos o floor(inscritos/2) en parejas).
 */
export async function syncMatchPlayBracketSizeFromField(
  admin: SupabaseClient,
  tournamentId: string
): Promise<SyncFieldBracketSizeResult | { ok: false; error: string }> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) {
    return { ok: false, error: "Torneo no encontrado." };
  }

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("id, match_type")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!rules) {
    return { ok: true, skipped: true, unitCount: 0, unitLabel: "parejas", bracketSize: 0, roundCount: 0 };
  }

  const individual = rules.match_type === "individual";
  const unitLabel: "parejas" | "jugadores" = individual
    ? "jugadores"
    : "parejas";

  const { count: teamCount } = await admin
    .from("matchplay_pair_teams")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  const { data: entries } = await admin
    .from("tournament_entries")
    .select("id, status")
    .eq("tournament_id", tournamentId);

  const activeEntries = (entries ?? []).filter((e) =>
    isCountableMatchPlayEntryStatus(e.status)
  ).length;

  const unitCount = countMatchPlayFieldUnits({
    matchType: rules.match_type,
    activeTeamCount: teamCount ?? 0,
    activeEntryCount: activeEntries,
  });

  const bracketSize = fieldBracketSize(unitCount, 64);
  const roundCount = roundCountForBracketSize(bracketSize);

  const { error } = await admin
    .from("tournament_matchplay_rules")
    .update({
      bracket_main_pairs: bracketSize,
      bracket_round_count: roundCount,
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", tournamentId);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    unitCount,
    unitLabel,
    bracketSize,
    roundCount,
  };
}
