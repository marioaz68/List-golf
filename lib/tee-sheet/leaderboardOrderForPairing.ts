import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  fetchAllTournamentEntries,
  fetchHoleScoresForRoundScores,
  fetchRoundScoresForPublicLeaderboard,
} from "@/app/torneos/[id]/lib/data";
import {
  getPlayerCode,
  holesPlayedCount,
  isDQScore,
  isDQStatus,
  normalizeClubLabel,
  subtotal,
  toValidEntry,
} from "@/app/torneos/[id]/lib/utils";
import { applyCompetitionRules } from "@/lib/leaderboard/applyCompetitionRules";
import { applyCompetitionStandings } from "@/lib/leaderboard/competitionStandings";
import { applyStandings } from "@/lib/leaderboard/applyStandings";
import { buildLiveLeaderboard } from "@/lib/leaderboard/buildLiveLeaderboard";
import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { effectiveUsesNetLeaderboard } from "@/lib/leaderboard/leaderboardViewOverride";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import { buildInscribedCountByCategory } from "@/lib/cuts/cutAdvancementPolicy";
import {
  computePublicCutLines,
  cutEnforcesAtTargetRound,
  getAdvancementRulesForTargetRound,
  primaryCutLineForCategory,
  type RoundAdvancementRule,
} from "@/lib/cuts/computeCutLine";
import type { TieBreakStep } from "@/lib/cuts/tieBreak";
import { formatScoreOrDQ } from "@/app/torneos/[id]/lib/utils";

export type TeeSheetEntryOrderInfo = {
  position: number | null;
  madeCut: boolean | null;
  /** Total a mostrar en salidas R2+ (R1 o R1+R2 según ronda objetivo). */
  standingDisplay: string | null;
};

export type TeeSheetEntryOrderResult = {
  orderMap: Map<string, TeeSheetEntryOrderInfo>;
  /** Solo true si hay regla activa con `to_round_no === targetRoundNo`. */
  cutEnforces: boolean;
};

/** Puntuación acumulada hasta `throughRoundNo` para la columna de salidas. */
export function formatTeeSheetPairingScore(
  row: LeaderboardRow,
  rule: CategoryCompetitionRule | undefined,
  throughRoundNo: number
): string {
  if (row.is_disqualified) return "DQ";

  if (rule && isStablefordCategory(rule)) {
    if (row.stableford_total != null) {
      return formatScoreOrDQ(row.stableford_total, false);
    }
    if (row.leaderboard_sort_value != null) {
      return formatScoreOrDQ(row.leaderboard_sort_value, false);
    }
    if (row.total_to_par != null) {
      return formatScoreOrDQ(row.total_to_par, false);
    }
    return "—";
  }

  if (row.leaderboard_sort_value != null && rule) {
    return formatScoreOrDQ(row.leaderboard_sort_value, false);
  }

  const useNet = rule ? effectiveUsesNetLeaderboard(rule, null) : false;

  let total = 0;
  let count = 0;
  for (const r of row.rounds) {
    if (r.round_no > throughRoundNo) continue;
    if (r.is_dq) return "DQ";
    if (!useNet && r.gross_score != null && Number.isFinite(r.gross_score)) {
      total += Number(r.gross_score);
      count += 1;
    }
  }
  if (count > 0) return formatScoreOrDQ(total, false);
  if (!useNet && row.total_gross != null) {
    return formatScoreOrDQ(row.total_gross, false);
  }
  return "—";
}

function isCountableEntry(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  return s === "active" || s === "confirmed";
}

/**
 * Posición en tabla (`category_competition_rules`) y corte (`round_advancement_rules`)
 * para armar salidas de R2+ — misma lógica que la clasificación pública.
 */
export async function buildTeeSheetEntryOrderMap(
  admin: SupabaseClient,
  tournamentId: string,
  targetRoundNo: number
): Promise<TeeSheetEntryOrderResult> {
  const out = new Map<string, TeeSheetEntryOrderInfo>();
  if (targetRoundNo <= 1) {
    return { orderMap: out, cutEnforces: false };
  }

  const standingsThroughRoundNo = targetRoundNo - 1;

  const { data: competitionRows, error: compErr } = await admin
    .from("category_competition_rules")
    .select(
      "category_id, scoring_format, leaderboard_basis, prize_basis, handicap_percentage, gross_prize_places, net_prize_places, is_active"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  if (compErr) {
    throw new Error(
      `No se pudieron leer reglas de competencia: ${compErr.message}`
    );
  }

  const competitionRules = (competitionRows ?? []) as CategoryCompetitionRule[];
  if (competitionRules.length === 0) {
    throw new Error(
      "Configura reglas de competencia antes de generar salidas de ronda 2 o 3."
    );
  }

  const { data: advancementRows, error: advErr } = await admin
    .from("round_advancement_rules")
    .select(
      "from_round_no, to_round_no, scope_type, scope_value, ranking_basis, ranking_mode, advancement_type, advancement_value, include_ties, gross_exemption_enabled, gross_exemption_top_n, tie_break_profile_id, sort_order, is_active"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  if (advErr) {
    throw new Error(`No se pudieron leer reglas de corte: ${advErr.message}`);
  }

  const advancementRules = (advancementRows ?? []) as RoundAdvancementRule[];

  const profileIds = [
    ...new Set(
      advancementRules
        .map((r) => String(r.tie_break_profile_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const tieBreakStepsByProfileId = new Map<string, TieBreakStep[]>();
  if (profileIds.length > 0) {
    const { data: tieSteps, error: tieErr } = await admin
      .from("tie_break_steps")
      .select(
        "tie_break_profile_id, step_no, method, basis, round_scope, hole_scope, handicap_mode, direction, value_text"
      )
      .in("tie_break_profile_id", profileIds)
      .order("step_no", { ascending: true });

    if (tieErr) {
      throw new Error(`No se pudieron leer desempates: ${tieErr.message}`);
    }

    for (const step of tieSteps ?? []) {
      const pid = String(step.tie_break_profile_id ?? "");
      if (!pid) continue;
      const bucket = tieBreakStepsByProfileId.get(pid) ?? [];
      bucket.push(step as TieBreakStep);
      tieBreakStepsByProfileId.set(pid, bucket);
    }
  }

  const { data: categoriesData } = await admin
    .from("categories")
    .select("id, code, name")
    .eq("tournament_id", tournamentId);

  const categories = (categoriesData ?? []).map((c) => ({
    id: String(c.id),
    code: c.code as string | null,
  }));

  const { data: roundsData, error: roundsErr } = await admin
    .from("rounds")
    .select(
      "id, round_no, round_date, category_id, start_type, start_time, wave"
    )
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });

  if (roundsErr) {
    throw new Error(`No se pudieron leer rondas: ${roundsErr.message}`);
  }

  const rounds = roundsData ?? [];
  const selectedRound =
    rounds.find((r) => Number(r.round_no) === standingsThroughRoundNo) ??
    rounds[rounds.length - 1] ??
    null;

  if (!selectedRound) {
    throw new Error(
      `No hay ronda ${standingsThroughRoundNo} configurada para calcular posiciones.`
    );
  }

  const entriesRaw = await fetchAllTournamentEntries(admin, tournamentId);
  type ValidEntry = NonNullable<ReturnType<typeof toValidEntry>>;

  const filteredEntries = entriesRaw
    .map((row) => toValidEntry(row as Parameters<typeof toValidEntry>[0]))
    .filter((e): e is ValidEntry => !!e && isCountableEntry(e.status));

  if (filteredEntries.length === 0) {
    return { orderMap: out, cutEnforces: false };
  }

  const playerIds = filteredEntries.map((e) => e.player_id);
  const roundIds = rounds.map((r) => r.id);

  const roundScores = await fetchRoundScoresForPublicLeaderboard(
    admin,
    playerIds,
    roundIds
  );
  const holeScores =
    roundScores.length > 0
      ? await fetchHoleScoresForRoundScores(
          admin,
          roundScores.map((row) => row.id)
        )
      : [];

  const { data: tournamentHolesData, error: holesErr } = await admin
    .from("tournament_holes")
    .select("hole_number, par, handicap_index")
    .eq("tournament_id", tournamentId)
    .order("hole_number", { ascending: true });

  if (holesErr) {
    throw new Error(`No se pudieron leer hoyos del torneo: ${holesErr.message}`);
  }

  const parByHole = new Map<number, number>();
  const strokeIndexByHole: StrokeIndexByHole = new Map();
  for (const row of tournamentHolesData ?? []) {
    const holeNumber = Number(row.hole_number ?? 0);
    const par = Number(row.par ?? 0);
    if (!holeNumber || !par) continue;
    parByHole.set(holeNumber, par);
    const si = Number(row.handicap_index ?? 0);
    if (si >= 1 && si <= 18) strokeIndexByHole.set(holeNumber, si);
  }

  const holeScoresByRoundScoreId = new Map<string, typeof holeScores>();
  for (const row of holeScores) {
    const current = holeScoresByRoundScoreId.get(row.round_score_id) ?? [];
    current.push(row);
    holeScoresByRoundScoreId.set(row.round_score_id, current);
  }

  const handicapByPlayerId = new Map<string, number | null>();
  for (const entry of filteredEntries) {
    const h =
      entry.handicap_index ??
      entry.player.handicap_torneo ??
      entry.player.handicap_index ??
      null;
    handicapByPlayerId.set(entry.player_id, h == null ? null : Number(h));
  }

  const leaderboardBase = buildLiveLeaderboard({
    filteredEntries,
    rounds,
    roundScores,
    holeScoresByRoundScoreId,
    parByHole,
    selectedRound,
    normalizeClubLabel,
    isDQScore,
    isDQStatus,
    subtotal,
    getPlayerCode,
  });

  const leaderboardWithStandings = applyStandings({
    leaderboardBase,
    rounds,
    selectedRound,
    holesPlayedCount,
  });

  const leaderboardScored = applyCompetitionStandings({
    leaderboard: applyCompetitionRules({
      leaderboard: leaderboardWithStandings,
      competitionRules,
      handicapByPlayerId,
      maxRoundNo: standingsThroughRoundNo,
      strokeIndexByHole,
      leaderboardViewOverride: null,
    }),
    rounds,
    selectedRound,
    competitionRules,
    handicapByPlayerId,
    strokeIndexByHole,
    leaderboardViewOverride: null,
  });

  const cutEnforces = cutEnforcesAtTargetRound(advancementRules, targetRoundNo);
  const cutRulesForRound = getAdvancementRulesForTargetRound(
    advancementRules,
    targetRoundNo
  );

  let rowsForOrder: LeaderboardRow[] = leaderboardScored;

  if (cutEnforces && cutRulesForRound.length > 0) {
    const inscribedCountByCategoryId =
      buildInscribedCountByCategory(filteredEntries);

    const publicCutLines = computePublicCutLines({
      leaderboard: leaderboardScored,
      advancementRules,
      competitionRules,
      categories,
      selectedRoundNo: targetRoundNo,
      selectedCategoryId: null,
      handicapByPlayerId,
      tieBreakStepsByProfileId,
      strokeIndexByHole,
      inscribedCountByCategoryId,
    });

    rowsForOrder = leaderboardScored.map((row) => {
      if (row.is_disqualified) {
        return { ...row, made_cut: false };
      }
      const line = primaryCutLineForCategory(
        publicCutLines.filter(
          (l) => l.categoryId === String(row.category_id ?? "")
        ),
        row.category_id
      );
      if (!line) return { ...row, made_cut: null };
      return {
        ...row,
        made_cut: line.madeCutEntryIds.has(row.entry_id),
      };
    });
  }

  const ruleByCategoryId = new Map(
    competitionRules.map((r) => [String(r.category_id), r])
  );

  for (const row of rowsForOrder) {
    const rule = ruleByCategoryId.get(String(row.category_id ?? ""));
    out.set(row.entry_id, {
      position: row.selected_round_position_category,
      madeCut: row.made_cut ?? null,
      standingDisplay: formatTeeSheetPairingScore(
        row,
        rule,
        standingsThroughRoundNo
      ),
    });
  }

  return { orderMap: out, cutEnforces };
}

/**
 * R2+: orden por posición de clasificación.
 * Solo excluye jugadores si `cutEnforces === true` (regla con destino = ronda objetivo).
 */
export function sortEntriesForTeeSheetRound<T extends { id: string }>(
  entries: T[],
  targetRoundNo: number,
  orderMap: Map<string, TeeSheetEntryOrderInfo>,
  options?: { cutEnforces?: boolean }
): T[] {
  if (targetRoundNo <= 1) return entries;

  const kept =
    options?.cutEnforces === true
      ? entries.filter((e) => {
          const info = orderMap.get(e.id);
          if (!info || info.madeCut === null) return true;
          return info.madeCut !== false;
        })
      : entries;

  kept.sort((a, b) => {
    const pa = orderMap.get(a.id)?.position;
    const pb = orderMap.get(b.id)?.position;
    const rankA = pa == null || pa <= 0 ? 999_999 : pa;
    const rankB = pb == null || pb <= 0 ? 999_999 : pb;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.id).localeCompare(String(b.id));
  });

  return kept;
}
