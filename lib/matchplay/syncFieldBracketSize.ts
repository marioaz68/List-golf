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
    .select("id, settings")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) {
    return { ok: false, error: "Torneo no encontrado." };
  }

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("id, match_type, config_json")
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

  const prevCfg =
    rules.config_json && typeof rules.config_json === "object"
      ? (rules.config_json as Record<string, unknown>)
      : {};

  const { error } = await admin
    .from("tournament_matchplay_rules")
    .update({
      bracket_main_pairs: bracketSize,
      bracket_round_count: roundCount,
      max_pairs_per_category: bracketSize,
      config_json: {
        ...prevCfg,
        bracket_main_pairs: bracketSize,
        bracket_round_count: roundCount,
        max_pairs_per_category: bracketSize,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", tournamentId);

  if (error) return { ok: false, error: error.message };

  const prevSettings =
    tournament.settings && typeof tournament.settings === "object"
      ? (tournament.settings as Record<string, unknown>)
      : {};
  const prevFormat =
    prevSettings.format && typeof prevSettings.format === "object"
      ? (prevSettings.format as Record<string, unknown>)
      : {};
  const prevMatchplay =
    prevSettings.matchplay && typeof prevSettings.matchplay === "object"
      ? (prevSettings.matchplay as Record<string, unknown>)
      : {};

  await admin
    .from("tournaments")
    .update({
      settings: {
        ...prevSettings,
        format: {
          ...prevFormat,
          round_count: roundCount,
        },
        matchplay: {
          ...prevMatchplay,
          bracket_main_pairs: bracketSize,
        },
      },
    })
    .eq("id", tournamentId);

  return {
    ok: true,
    unitCount,
    unitLabel,
    bracketSize,
    roundCount,
  };
}
