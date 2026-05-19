/**
 * Simula corte como la página pública (R2 vista, corte informativo → R3).
 * Uso: npx tsx scripts/diagnose-cut-simulation.ts <tournament_id> [selected_round_no]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { buildLiveLeaderboard } from "../lib/leaderboard/buildLiveLeaderboard";
import { applyStandings } from "../lib/leaderboard/applyStandings";
import { applyCompetitionRules } from "../lib/leaderboard/applyCompetitionRules";
import { applyCompetitionStandings } from "../lib/leaderboard/competitionStandings";
import { buildInscribedCountByCategory } from "../lib/cuts/cutAdvancementPolicy";
import { computeDisplayCutLines } from "../lib/cuts/computeCutLine";
import { rankValueForAdvancementRule } from "../lib/cuts/cutRanking";
import { pickPrimaryAdvancementRule } from "../lib/cuts/computeCutLine";
import {
  fetchAllTournamentEntries,
  fetchHoleScoresForRoundScores,
  fetchRoundScoresForPublicLeaderboard,
} from "../app/torneos/[id]/lib/data";
import {
  getPlayerCode,
  holesPlayedCount,
  isDQScore,
  isDQStatus,
  normalizeClubLabel,
  subtotal,
  toValidEntry,
} from "../app/torneos/[id]/lib/utils";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const tournamentId = process.argv[2]?.trim();
const selectedRoundNo = Number(process.argv[3] ?? 2);
if (!tournamentId) {
  console.error("Uso: npx tsx scripts/diagnose-cut-simulation.ts <tournament_id> [round_no]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const entriesRaw = await fetchAllTournamentEntries(admin, tournamentId);
  const allEntries = entriesRaw
    .map((row) => toValidEntry(row as Parameters<typeof toValidEntry>[0]))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const { data: categories } = await admin
    .from("categories")
    .select("id, code, name")
    .eq("tournament_id", tournamentId);

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, round_no, round_date, category_id, start_type, start_time, wave")
    .eq("tournament_id", tournamentId)
    .order("round_no");

  const selectedRound =
    rounds?.find((r) => Number(r.round_no) === selectedRoundNo) ?? rounds?.[0];

  const { data: compRules } = await admin
    .from("category_competition_rules")
    .select(
      "category_id, scoring_format, leaderboard_basis, prize_basis, handicap_percentage, gross_prize_places, net_prize_places, is_active"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  const { data: advRules } = await admin
    .from("round_advancement_rules")
    .select(
      "from_round_no, to_round_no, scope_type, scope_value, ranking_basis, ranking_mode, advancement_type, advancement_value, include_ties, gross_exemption_enabled, gross_exemption_top_n, tie_break_profile_id, sort_order, is_active"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  const playerIds = allEntries.map((e) => e.player_id);
  const roundIds = (rounds ?? []).map((r) => r.id);
  const roundScores = await fetchRoundScoresForPublicLeaderboard(
    admin,
    playerIds,
    roundIds
  );
  const holeScores =
    roundScores.length > 0
      ? await fetchHoleScoresForRoundScores(
          admin,
          roundScores.map((r) => r.id)
        )
      : [];

  const { data: holes } = await admin
    .from("tournament_holes")
    .select("hole_number, par, handicap_index")
    .eq("tournament_id", tournamentId);

  const parByHole = new Map<number, number>();
  const strokeIndexByHole = new Map<number, number>();
  for (const h of holes ?? []) {
    const n = Number(h.hole_number);
    if (n) parByHole.set(n, Number(h.par));
    const si = Number(h.handicap_index);
    if (si >= 1 && si <= 18) strokeIndexByHole.set(n, si);
  }

  const holeScoresByRoundScoreId = new Map<string, typeof holeScores>();
  for (const row of holeScores) {
    const b = holeScoresByRoundScoreId.get(row.round_score_id) ?? [];
    b.push(row);
    holeScoresByRoundScoreId.set(row.round_score_id, b);
  }

  const handicapByPlayerId = new Map<string, number | null>();
  for (const e of allEntries) {
    const h =
      e.handicap_index ??
      e.player.handicap_torneo ??
      e.player.handicap_index ??
      null;
    handicapByPlayerId.set(e.player_id, h == null ? null : Number(h));
  }

  const catA = categories?.find((c) => c.code === "A");
  const filteredEntries = catA
    ? allEntries.filter((e) => e.category_id === catA.id)
    : allEntries;

  const base = buildLiveLeaderboard({
    filteredEntries,
    rounds: rounds ?? [],
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

  const includeIncompleteRounds = true;
  const withStandings = applyStandings({
    leaderboardBase: base,
    rounds: rounds ?? [],
    selectedRound: selectedRound!,
    holesPlayedCount,
    includeIncompleteRounds,
  });
  const scored = applyCompetitionStandings({
    leaderboard: applyCompetitionRules({
      leaderboard: withStandings,
      competitionRules: compRules ?? [],
      handicapByPlayerId,
      maxRoundNo: selectedRoundNo,
      strokeIndexByHole,
      includeIncompleteRounds,
    }),
    rounds: rounds ?? [],
    selectedRound: selectedRound!,
    competitionRules: compRules ?? [],
    handicapByPlayerId,
    strokeIndexByHole,
    includeIncompleteRounds,
  });

  const inscribed = buildInscribedCountByCategory(allEntries);
  const cutLines = computeDisplayCutLines({
    leaderboard: scored,
    advancementRules: advRules ?? [],
    competitionRules: compRules ?? [],
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      code: c.code,
    })),
    selectedRoundNo,
    selectedCategoryId: catA?.id ?? null,
    handicapByPlayerId,
    tieBreakStepsByProfileId: new Map(),
    strokeIndexByHole,
    inscribedCountByCategoryId: inscribed,
    alignWithLeaderboardDisplay: includeIncompleteRounds,
  });

  const line = cutLines[0];
  const rowsInCat = scored.filter((r) => !r.is_disqualified);
  const enforcing = (advRules ?? []).filter(
    (r) => r.is_active && r.to_round_no > selectedRoundNo
  );
  const rule = catA
    ? pickPrimaryAdvancementRule(enforcing as any, rowsInCat[0]!, (categories ?? []).map((c) => ({ id: c.id, code: c.code })))
    : null;

  let withPrimary = 0;
  let withSort = 0;
  let withDisplayAlign = 0;
  const rulesMap = new Map((compRules ?? []).map((r) => [r.category_id, r]));

  if (rule && catA) {
    for (const row of rowsInCat) {
      const v = rankValueForAdvancementRule(
        row,
        rule as any,
        selectedRoundNo,
        rulesMap as any,
        handicapByPlayerId,
        strokeIndexByHole,
        null,
        { alignWithLeaderboardDisplay: false }
      );
      const vd = rankValueForAdvancementRule(
        row,
        rule as any,
        selectedRoundNo,
        rulesMap as any,
        handicapByPlayerId,
        strokeIndexByHole,
        null,
        { alignWithLeaderboardDisplay: true }
      );
      if (v.primary != null) withPrimary++;
      if (vd.primary != null) withDisplayAlign++;
      if (row.leaderboard_sort_value != null) withSort++;
    }
  }

  const madeCut = line?.madeCutEntryIds.size ?? 0;

  console.log({
    selectedRoundNo,
    leaderboardRows: rowsInCat.length,
    inscribedA: catA ? inscribed.get(catA.id) : null,
    cutLine: line
      ? {
          label: line.label,
          fieldSize: line.fieldSize,
          cutSlots: line.cutSlots,
          afterPosition: line.afterPosition,
          madeCut,
        }
      : null,
    withLeaderboardSortValue: withSort,
    withPrimaryStrict: withPrimary,
    withPrimaryDisplayAlign: withDisplayAlign,
    rule: rule
      ? {
          scope: `${rule.scope_type}:${rule.scope_value}`,
          mode: rule.ranking_mode,
          type: rule.advancement_type,
          value: rule.advancement_value,
        }
      : null,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
