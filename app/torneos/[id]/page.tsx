import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  buildLockedScorecardLookups,
  isEntryRoundClosed,
} from "@/lib/leaderboard/lockedScorecards";
import { fetchLockedScorecardsForTournament } from "@/lib/leaderboard/fetchLockedScorecards";
import FavoritesView from "@/components/public/FavoritesView";
import { buildLiveLeaderboard } from "@/lib/leaderboard/buildLiveLeaderboard";
import { applyStandings } from "@/lib/leaderboard/applyStandings";
import { applyCompetitionRules } from "@/lib/leaderboard/applyCompetitionRules";
import { applyCompetitionStandings } from "@/lib/leaderboard/competitionStandings";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import {
  computeDisplayCutLines,
  cutEnforcesAtTargetRound,
  primaryCutLineForCategory,
  type RoundAdvancementRule,
} from "@/lib/cuts/computeCutLine";
import {
  activeCutLineForUi,
  annotateCutDividers,
  sortLeaderboardForCutAlignment,
} from "@/lib/cuts/publicCutDisplay";
import type { TieBreakStep } from "@/lib/cuts/tieBreak";
import {
  categoryShowsGrossNetToggle,
  rulesByCategoryId,
} from "@/lib/leaderboard/categoryCompetitionRules";
import {
  filterPublicPrizeRulesForCategory,
  type PublicPrizeRuleRow,
} from "@/lib/leaderboard/filterPublicPrizeRules";
import { parseLeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import PublicLeaderboardWithSearch from "./components/PublicLeaderboardWithSearch";
import PublicCategoryCompetitionInfo from "./components/PublicCategoryCompetitionInfo";
import PublicPrizesPanel from "./components/PublicPrizesPanel";
import PublicRulesBlockedView from "./components/PublicRulesBlockedView";
import {
  collectRulesBlockers,
  hasRulesBlockers,
} from "@/lib/tournament-rules/collectRulesBlockers";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import OfficialCategoryClosePanel from "./components/OfficialCategoryClosePanel";
import { buildCategoryRoundCloseCards } from "./lib/categoryRoundCloseStatus";
import {
  resolveDefaultPublicLeaderboardRound,
  resolvePublicRoundIdForCategory,
} from "@/lib/rounds/resolveDefaultPublicLeaderboardRound";
import PublicTeeSheetView from "./components/PublicTeeSheetView";
import { buildTeeSheetEntryOrderMap } from "@/lib/tee-sheet/leaderboardOrderForPairing";
import { buildPairingGroupLabelsBySession } from "@/lib/tee-sheet/pairingGroupLabels";
import {
  categoryRoundIdInSession,
  roundsInSameSession,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { detailLabelsFromPublicTournament } from "./lib/publicDetailTableLabels";
import {
  fetchAllTournamentEntries,
  fetchHoleScoresForRoundScores,
  fetchRoundScoresForPublicLeaderboard,
} from "./lib/data";

import type {
  Tournament,
  EntryCategory,
  TournamentEntryJoinRow,
  ValidTournamentEntry,
  RoundRow,
  HoleScoreRow,
  TournamentHoleRow,
  PairingMember,
  PublicPairingGroup,
  LeaderboardRow,
} from "./lib/types";

import {
  buildHref,
  formatDate,
  formatDateWithWeekday,
  formatPublicRoundNavPill,
  getPlayerCode,
  holesPlayedCount,
  isDQScore,
  isDQStatus,
  isStartingOrderConfirmed,
  nameOfPlayer,
  normalizeClubLabel,
  publicTournamentEmeraldHeroNavClasses,
  publicTournamentOutboundNavClasses,
  publicTournamentPrimaryNavGridClass,
  publicTournamentSecondaryNavGridClass,
  publicTournamentViewPillClasses,
  roundBelongsToCategory,
  roundDateUtcKey,
  sectionPillClasses,
  sortRoundsChrono,
  subtotal,
  toValidEntry,
  utcTodayKey,
} from "./lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { PublicLanguageToggle } from "@/components/i18n/PublicLanguageToggle";
import { PublicInstallShortcut } from "@/components/public/PublicInstallShortcut";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    category_id?: string;
    round_id?: string;
    view?: string;
    detail_id?: string;
    embed?: string;
    from?: string;
    basis?: string;
  }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const isEmbed = String(sp.embed ?? "").trim() === "1";
  const fromAdmin = String(sp.from ?? "").trim() === "admin";

  const requestedCategoryId =
    typeof sp.category_id === "string" ? sp.category_id.trim() : "";
  const requestedRoundId =
    typeof sp.round_id === "string" ? sp.round_id.trim() : "";
  const requestedView =
    typeof sp.view === "string" ? sp.view.trim().toLowerCase() : "";
  const requestedDetailId =
    typeof sp.detail_id === "string" ? sp.detail_id.trim() : "";

  const view =
    requestedView === "official"
      ? "official"
      : requestedView === "favorites"
        ? "favorites"
        : requestedView === "tee-sheet" || requestedView === "salidas"
          ? "tee-sheet"
          : "live";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;

  const locale = await getLocale();
  const pub = messages[locale].publicTournament;
  const detailTableLabels = detailLabelsFromPublicTournament(pub);
  const pts = messages[locale].publicTeeSheet;
  const common = messages[locale].common;
  const sb = messages[locale].sidebar;

  const tournamentResponse = isLoggedIn
    ? await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path")
        .eq("id", id)
        .maybeSingle()
    : await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path")
        .eq("id", id)
        .eq("is_public", true)
        .maybeSingle();

  const { data: tournament, error: tournamentError } = tournamentResponse;

  if (tournamentError || !tournament) {
    notFound();
  }

  const typedTournament = tournament as Tournament & { poster_path?: string | null };
  const posterUrl = typedTournament.poster_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tournament-posters/${typedTournament.poster_path}`
    : null;

  const entriesData = await fetchAllTournamentEntries(
    supabase,
    typedTournament.id
  );

  const allEntries = (entriesData as TournamentEntryJoinRow[])
    .map(toValidEntry)
    .filter((entry): entry is ValidTournamentEntry => !!entry);

  const categories = Array.from(
    new Map(
      allEntries
        .map((entry) =>
          entry.category ? [entry.category.id, entry.category] : null
        )
        .filter((x): x is [string, EntryCategory] => !!x)
    ).values()
  ).sort((a, b) =>
    (a.code ?? a.name ?? "").localeCompare(b.code ?? b.name ?? "", "es", {
      sensitivity: "base",
    })
  );

  const defaultCategoryId = categories[0]?.id ?? "";

  if (categories.length > 0 && !requestedCategoryId && defaultCategoryId) {
    redirect(
      buildHref({
        tournamentId: typedTournament.id,
        categoryId: defaultCategoryId,
        roundId: requestedRoundId || undefined,
        view: requestedView || undefined,
        detailId: requestedDetailId || undefined,
        embed: isEmbed,
        fromAdmin: isEmbed && fromAdmin ? true : undefined,
      })
    );
  }

  const selectedCategoryId = categories.some((c) => c.id === requestedCategoryId)
    ? requestedCategoryId
    : defaultCategoryId;

  if (
    categories.length > 0 &&
    requestedCategoryId &&
    requestedCategoryId !== selectedCategoryId
  ) {
    redirect(
      buildHref({
        tournamentId: typedTournament.id,
        categoryId: selectedCategoryId,
        roundId: requestedRoundId || undefined,
        view: requestedView || undefined,
        detailId: requestedDetailId || undefined,
        embed: isEmbed,
        fromAdmin: isEmbed && fromAdmin ? true : undefined,
      })
    );
  }

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const filteredEntries = selectedCategoryId
    ? allEntries.filter((entry) => entry.category_id === selectedCategoryId)
    : allEntries;

  const { data: roundsData, error: roundsError } = await supabase
    .from("rounds")
    .select(
      "id, round_no, round_date, category_id, notes, start_type, start_time, wave"
    )
    .eq("tournament_id", typedTournament.id)
    .order("round_no", { ascending: true })
    .order("round_date", { ascending: true });

  if (roundsError) {
    throw new Error(`Error leyendo rounds: ${roundsError.message}`);
  }

  const rounds = (roundsData ?? []) as RoundRow[];
  const roundsInCategoryScope = rounds.filter((r) =>
    roundBelongsToCategory(r, selectedCategoryId || null)
  );
  const publicTeeSheetRoundsAll = rounds.filter((round) =>
    isStartingOrderConfirmed(round.notes)
  );
  const publicTeeSheetRounds = publicTeeSheetRoundsAll.filter((round) =>
    roundBelongsToCategory(round, selectedCategoryId || null)
  );

  const todayKey = utcTodayKey();
  const roundsTodayAll = rounds
    .filter((r) => roundDateUtcKey(r.round_date) === todayKey)
    .sort(sortRoundsChrono);

  const roundsTodayList = roundsTodayAll.filter((r) =>
    roundBelongsToCategory(r, selectedCategoryId || null)
  );

  const pastDateKeysSorted = [
    ...new Set(
      rounds
        .filter((r) => roundBelongsToCategory(r, selectedCategoryId || null))
        .map((r) => roundDateUtcKey(r.round_date))
        .filter((k): k is string => !!k && k < todayKey)
    ),
  ].sort((a, b) => b.localeCompare(a));

  const roundsByPastDate = pastDateKeysSorted
    .map((dateKey) => ({
      dateKey,
      rounds: rounds
        .filter((r) => roundDateUtcKey(r.round_date) === dateKey)
        .filter((r) => roundBelongsToCategory(r, selectedCategoryId || null))
        .sort(sortRoundsChrono),
    }))
    .filter((g) => g.rounds.length > 0);

  const roundsWithoutCalendar = rounds
    .filter((r) => !roundDateUtcKey(r.round_date))
    .filter((r) => roundBelongsToCategory(r, selectedCategoryId || null))
    .sort(sortRoundsChrono);

  const futureDateKeysSorted = [
    ...new Set(
      rounds
        .filter((r) => roundBelongsToCategory(r, selectedCategoryId || null))
        .map((r) => roundDateUtcKey(r.round_date))
        .filter((k): k is string => !!k && k > todayKey)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const roundsByFutureDate = futureDateKeysSorted
    .map((dateKey) => ({
      dateKey,
      rounds: rounds
        .filter((r) => roundDateUtcKey(r.round_date) === dateKey)
        .filter((r) => roundBelongsToCategory(r, selectedCategoryId || null))
        .sort(sortRoundsChrono),
    }))
    .filter((g) => g.rounds.length > 0);

  const adminSupabase = await createAdminClient();

  const roundScores =
    filteredEntries.length > 0 && roundsInCategoryScope.length > 0
      ? await fetchRoundScoresForPublicLeaderboard(
          adminSupabase,
          filteredEntries.map((entry) => entry.player_id),
          roundsInCategoryScope.map((r) => r.id)
        )
      : [];

  const holeScores =
    roundScores.length > 0
      ? await fetchHoleScoresForRoundScores(
          adminSupabase,
          roundScores.map((row) => row.id)
        )
      : [];

  const { data: tournamentHolesData, error: tournamentHolesError } =
    await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", typedTournament.id)
      .order("hole_number", { ascending: true });

  if (tournamentHolesError) {
    throw new Error(
      `Error leyendo tournament_holes: ${tournamentHolesError.message}`
    );
  }

  const tournamentHoles = (tournamentHolesData ?? []) as TournamentHoleRow[];

  const parByHole = new Map<number, number>();
  const strokeIndexByHole = new Map<number, number>();
  for (const row of tournamentHoles) {
    const holeNumber = Number(row.hole_number ?? 0);
    const par = Number(row.par ?? 0);
    if (!holeNumber || !par) continue;
    parByHole.set(holeNumber, par);
    const si = Number(row.handicap_index ?? 0);
    if (si >= 1 && si <= 18) {
      strokeIndexByHole.set(holeNumber, si);
    }
  }

  const strokeIndexByHoleRecord = Object.fromEntries(strokeIndexByHole);

  const capturedRoundIds = Array.from(
    new Set(roundScores.map((score) => score.round_id))
  );

  const latestRoundWithScoresFiltered =
    [...roundsInCategoryScope]
      .filter((round) => capturedRoundIds.includes(round.id))
      .sort((a, b) => a.round_no - b.round_no)
      .at(-1) ?? null;

  const scorecardsData = await fetchLockedScorecardsForTournament(
    adminSupabase,
    typedTournament.id
  );
  const lockedLookups = buildLockedScorecardLookups(
    scorecardsData as Array<{
      entry_id: string;
      round_id: string;
      locked_at: string | null;
    }>,
    rounds.map((r) => ({ id: r.id, round_no: r.round_no }))
  );

  const roundsForLock = rounds.map((r) => ({
    id: r.id,
    round_no: r.round_no,
    category_id: r.category_id ?? null,
  }));

  const gateEntries = filteredEntries;
  const defaultRoundFromClose = resolveDefaultPublicLeaderboardRound({
    entries: gateEntries,
    allRounds: rounds,
    roundsInScope: roundsInCategoryScope,
    selectedCategoryId: selectedCategoryId || null,
    lockedLookups,
    latestRoundWithScores: latestRoundWithScoresFiltered,
  });

  const defaultRoundLiveFavorite =
    roundsTodayList[0] ?? defaultRoundFromClose ?? roundsInCategoryScope[0] ?? null;
  const defaultRoundOfficial =
    defaultRoundFromClose ??
    latestRoundWithScoresFiltered ??
    roundsInCategoryScope[0] ??
    null;

  let effectiveRequestedRoundId = requestedRoundId;
  if (requestedRoundId && selectedCategoryId) {
    const reqRound = rounds.find((r) => r.id === requestedRoundId);
    const cat = String(selectedCategoryId).trim();
    if (
      reqRound &&
      String(reqRound.category_id ?? "").trim() &&
      String(reqRound.category_id ?? "").trim() !== cat
    ) {
      effectiveRequestedRoundId =
        resolvePublicRoundIdForCategory(rounds, reqRound.round_no, cat) ??
        requestedRoundId;
    }
  }

  const selectedRound =
    roundsInCategoryScope.find((round) => round.id === effectiveRequestedRoundId) ??
    (view === "tee-sheet" ? publicTeeSheetRounds[0] ?? null : null) ??
    (view === "live" || view === "favorites" ? defaultRoundLiveFavorite : null) ??
    (view === "official" ? defaultRoundOfficial : null) ??
    roundsInCategoryScope[0] ??
    null;

  const selectedRoundIsHistoric = Boolean(
    selectedRound?.round_date &&
      roundDateUtcKey(selectedRound.round_date) &&
      roundDateUtcKey(selectedRound.round_date)! < todayKey
  );

  const preserveRoundNo = selectedRound?.round_no ?? null;
  const roundIdForCategoryLink = (categoryId: string | null) =>
    preserveRoundNo != null
      ? resolvePublicRoundIdForCategory(rounds, preserveRoundNo, categoryId)
      : null;

  const teeSheetRoundIdForCategoryLink = (categoryId: string) => {
    const categoryTeeRounds = publicTeeSheetRoundsAll.filter((round) =>
      roundBelongsToCategory(round, categoryId)
    );
    if (preserveRoundNo != null) {
      const sameNo = categoryTeeRounds.find((r) => r.round_no === preserveRoundNo);
      if (sameNo) return sameNo.id;
    }
    return categoryTeeRounds[0]?.id ?? null;
  };

  const roundIdForNavLink = (categoryId: string) =>
    view === "tee-sheet"
      ? teeSheetRoundIdForCategoryLink(categoryId) ?? undefined
      : roundIdForCategoryLink(categoryId) ?? undefined;

  const selectedPublicTeeSheetRoundId =
    view === "tee-sheet"
      ? publicTeeSheetRounds.some((round) => round.id === effectiveRequestedRoundId)
        ? effectiveRequestedRoundId
        : publicTeeSheetRounds[0]?.id ?? null
      : selectedRound?.id ?? null;

  const canonicalRoundId =
    view === "tee-sheet" ? selectedPublicTeeSheetRoundId : selectedRound?.id ?? null;

  if (
    canonicalRoundId &&
    requestedRoundId &&
    requestedRoundId !== canonicalRoundId
  ) {
    redirect(
      buildHref({
        tournamentId: typedTournament.id,
        categoryId: selectedCategoryId || undefined,
        roundId: canonicalRoundId,
        view: requestedView || view,
        detailId: requestedDetailId || undefined,
        embed: isEmbed,
        fromAdmin: isEmbed && fromAdmin ? true : undefined,
      })
    );
  }

  const holeScoresByRoundScoreId = new Map<string, HoleScoreRow[]>();
  for (const row of holeScores) {
    const current = holeScoresByRoundScoreId.get(row.round_score_id) ?? [];
    current.push(row);
    holeScoresByRoundScoreId.set(row.round_score_id, current);
  }

  /** Reglas de torneo: lectura con service role (RLS suele bloquear anon en tablas de configuración). */
  const serviceRoleConfigured = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );

  let competitionRulesRows: CategoryCompetitionRule[] | null = null;
  let competitionRulesError: { message: string } | null = null;
  let advancementRulesRows: RoundAdvancementRule[] | null = null;
  let advancementRulesError: { message: string } | null = null;

  if (serviceRoleConfigured) {
    const competitionRes = await adminSupabase
      .from("category_competition_rules")
      .select(
        "category_id, scoring_format, leaderboard_basis, prize_basis, handicap_percentage, gross_prize_places, net_prize_places, is_active"
      )
      .eq("tournament_id", typedTournament.id)
      .eq("is_active", true);

    competitionRulesRows = competitionRes.data as CategoryCompetitionRule[] | null;
    competitionRulesError = competitionRes.error;

    if (competitionRulesError) {
      console.error(
        `[public-tournament] category_competition_rules: ${competitionRulesError.message}`
      );
    }

    const advancementRes = await adminSupabase
      .from("round_advancement_rules")
      .select(
        "from_round_no, to_round_no, scope_type, scope_value, ranking_basis, ranking_mode, advancement_type, advancement_value, include_ties, gross_exemption_enabled, gross_exemption_top_n, tie_break_profile_id, sort_order, is_active"
      )
      .eq("tournament_id", typedTournament.id)
      .eq("is_active", true);

    advancementRulesRows = advancementRes.data as RoundAdvancementRule[] | null;
    advancementRulesError = advancementRes.error;

    if (advancementRulesError) {
      console.error(
        `[public-tournament] round_advancement_rules: ${advancementRulesError.message}`
      );
    }
  }

  const competitionRulesList = (competitionRulesRows ??
    []) as CategoryCompetitionRule[];
  const advancementRulesList = (advancementRulesRows ??
    []) as RoundAdvancementRule[];

  const competitionRulesMap = rulesByCategoryId(competitionRulesList);

  const profileIds = [
    ...new Set(
      advancementRulesList
        .map((r) => String(r.tie_break_profile_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const tieBreakStepsByProfileId = new Map<string, TieBreakStep[]>();
  if (profileIds.length > 0) {
    const { data: tieSteps } = await adminSupabase
      .from("tie_break_steps")
      .select(
        "tie_break_profile_id, step_no, method, basis, round_scope, hole_scope, handicap_mode, direction, value_text"
      )
      .in("tie_break_profile_id", profileIds)
      .order("step_no", { ascending: true });

    for (const step of tieSteps ?? []) {
      const pid = String(step.tie_break_profile_id ?? "");
      if (!pid) continue;
      const bucket = tieBreakStepsByProfileId.get(pid) ?? [];
      bucket.push(step as TieBreakStep);
      tieBreakStepsByProfileId.set(pid, bucket);
    }
  }

  const handicapByPlayerId = new Map<string, number | null>();
  for (const entry of allEntries) {
    const hcp =
      entry.handicap_index ??
      entry.player.handicap_torneo ??
      entry.player.handicap_index ??
      null;
    handicapByPlayerId.set(entry.player_id, hcp != null ? Number(hcp) : null);
  }

  const handicapsByPlayerId = Object.fromEntries(handicapByPlayerId);

  const categoryIdsWithPlayers = new Set(
    filteredEntries
      .map((e) => String(e.category_id ?? "").trim())
      .filter(Boolean)
  );

  const selectedRoundNoForRules = selectedRound?.round_no ?? 1;

  const rulesBlockers = collectRulesBlockers({
    categories: categories.map((c) => ({ id: c.id, code: c.code })),
    categoryIdsWithPlayers,
    competitionRules: competitionRulesList,
    serviceRoleConfigured,
    competitionRulesLoadFailed: Boolean(competitionRulesError),
    competitionRulesLoadError: competitionRulesError?.message ?? null,
    cutRulesLoadFailed: Boolean(advancementRulesError),
    cutRulesLoadError: advancementRulesError?.message ?? null,
    strokeIndexHoleCount: strokeIndexByHole.size,
    selectedRoundNo: selectedRoundNoForRules,
  });

  const rulesBlocked = hasRulesBlockers(rulesBlockers);

  const rulesBlockedLabels = {
    title: pub.rulesBlockedTitle,
    intro: pub.rulesBlockedIntro,
    serviceRoleNotConfigured: pub.rulesServiceRoleNotConfigured,
    competitionLoadFailed: pub.rulesCompetitionLoadFailed,
    cutLoadFailed: pub.rulesCutLoadFailed,
    categoriesMissingRule: pub.rulesCategoriesMissingRule,
    competitionInvalidConfig: pub.rulesCompetitionInvalidConfig,
    strokeIndexIncomplete: pub.rulesStrokeIndexIncomplete,
    adminLinksHint: pub.rulesBlockedAdminHint,
  };

  const headerCompetitionRule =
    selectedCategoryId && !rulesBlocked
      ? competitionRuleForCategory(competitionRulesMap, selectedCategoryId)
      : null;

  const basisParam = parseLeaderboardViewOverride(
    typeof sp.basis === "string" ? sp.basis : undefined
  );
  const showGrossNetToggle =
    Boolean(headerCompetitionRule) &&
    categoryShowsGrossNetToggle(headerCompetitionRule!);
  const leaderboardViewOverride = showGrossNetToggle
    ? basisParam ?? "net"
    : null;

  let publicPrizeRulesForCategory: PublicPrizeRuleRow[] = [];
  if (
    serviceRoleConfigured &&
    selectedCategory &&
    headerCompetitionRule &&
    !rulesBlocked
  ) {
    const prizeRes = await adminSupabase
      .from("category_prize_rules")
      .select(
        "id, scope_type, scope_value, prize_label, prize_position, ranking_basis, priority, show_on_leaderboard, sort_order, is_active"
      )
      .eq("tournament_id", typedTournament.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("priority", { ascending: true });

    if (prizeRes.error) {
      console.error(
        `[public-tournament] category_prize_rules: ${prizeRes.error.message}`
      );
    } else {
      publicPrizeRulesForCategory = filterPublicPrizeRulesForCategory({
        rules: (prizeRes.data ?? []) as PublicPrizeRuleRow[],
        categoryId: selectedCategory.id,
        categoryCode: selectedCategory.code ?? selectedCategory.name ?? "",
        categoryGroup: selectedCategory.code?.charAt(0) ?? null,
      });
    }
  }

  const categoryRoundCloseCards = buildCategoryRoundCloseCards(
    allEntries,
    selectedRound,
    lockedLookups,
    typedTournament.id
  );

  const selectedRoundNo = selectedRound?.round_no ?? 1;

  let leaderboard: LeaderboardRow[] = [];
  let publicCutLines: ReturnType<typeof computeDisplayCutLines> = [];
  let cutEnforcesForSelectedRound = false;
  let activePublicCutLine: ReturnType<typeof activeCutLineForUi> = null;
  let officialLeaderboard: LeaderboardRow[] = [];

  if (!rulesBlocked) {
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
      lockedLookups,
      roundsForLock,
    });

    const leaderboardScoredBase: LeaderboardRow[] = applyCompetitionRules({
      leaderboard: leaderboardWithStandings,
      competitionRules: competitionRulesList,
      handicapByPlayerId,
      maxRoundNo: selectedRoundNo,
      strokeIndexByHole,
      leaderboardViewOverride,
      lockedLookups,
      roundsForLock,
    });

    const leaderboardScored: LeaderboardRow[] = applyCompetitionStandings({
      leaderboard: leaderboardScoredBase,
      rounds,
      selectedRound,
      competitionRules: competitionRulesList,
      handicapByPlayerId,
      strokeIndexByHole,
      leaderboardViewOverride,
      lockedLookups,
      roundsForLock,
    });

    cutEnforcesForSelectedRound = cutEnforcesAtTargetRound(
      advancementRulesList,
      selectedRoundNo
    );

    publicCutLines = computeDisplayCutLines({
      leaderboard: leaderboardScored,
      advancementRules: advancementRulesList,
      competitionRules: competitionRulesList,
      categories: categories.map((c) => ({
        id: c.id,
        code: c.code,
      })),
      selectedRoundNo,
      selectedCategoryId: selectedCategoryId || null,
      handicapByPlayerId,
      tieBreakStepsByProfileId,
      strokeIndexByHole,
    });

    const withMadeCut: LeaderboardRow[] = leaderboardScored.map((row) => {
      if (!cutEnforcesForSelectedRound || row.is_disqualified) {
        return { ...row, made_cut: null };
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

    const alignedForCut = sortLeaderboardForCutAlignment({
      rows: withMadeCut,
      advancementRules: advancementRulesList,
      categories: categories.map((c) => ({
        id: c.id,
        code: c.code,
      })),
      selectedRoundNo,
      competitionRules: competitionRulesList,
      handicapByPlayerId,
      strokeIndexByHole,
    });

    leaderboard = annotateCutDividers(
      alignedForCut,
      publicCutLines,
      selectedCategoryId || null
    );

    activePublicCutLine = activeCutLineForUi(
      publicCutLines,
      selectedCategoryId || null
    );

    officialLeaderboard =
      selectedRound?.id != null
        ? leaderboard.filter((row) =>
            isEntryRoundClosed(row.entry_id, selectedRound, lockedLookups)
          )
        : leaderboard;
  }

  const sessionRounds: SessionRoundFields[] = rounds.map((round) => ({
    id: round.id,
    tournament_id: typedTournament.id,
    category_id: round.category_id ?? null,
    round_no: round.round_no,
    round_date: round.round_date,
    start_type: round.start_type,
    start_time: round.start_time,
    wave: round.wave ?? null,
  }));

  const publicRoundIds = [
    ...new Set(
      publicTeeSheetRounds.flatMap((round) =>
        roundsInSameSession(sessionRounds, round.id).map((r) => r.id)
      ),
    ),
  ];

  const standingDisplayByEntryRound = new Map<string, string>();
  const teeSheetTargetRoundNos = [
    ...new Set(
      publicTeeSheetRounds
        .map((round) => Number(round.round_no))
        .filter((n) => n > 1)
    ),
  ].sort((a, b) => a - b);

  if (teeSheetTargetRoundNos.length > 0) {
    try {
      const admin = createAdminClient();
      for (const targetRoundNo of teeSheetTargetRoundNos) {
        const { orderMap } = await buildTeeSheetEntryOrderMap(
          admin,
          typedTournament.id,
          targetRoundNo
        );
        for (const [entryId, info] of orderMap) {
          if (!info.standingDisplay) continue;
          standingDisplayByEntryRound.set(
            `${entryId}:${targetRoundNo}`,
            info.standingDisplay
          );
        }
      }
    } catch (err) {
      console.error("[public tee-sheet] standing scores:", err);
    }
  }

  const { data: pairingGroupsData, error: pairingGroupsError } =
    publicRoundIds.length > 0
      ? await supabase
          .from("pairing_groups")
          .select("id, round_id, group_no, tee_time, starting_hole, notes")
          .in("round_id", publicRoundIds)
          .order("round_id", { ascending: true })
          .order("group_no", { ascending: true })
      : { data: [], error: null };

  if (pairingGroupsError) {
    throw new Error(`Error leyendo grupos públicos: ${pairingGroupsError.message}`);
  }

  const pairingGroupsRaw = (pairingGroupsData ?? []) as Array<{
    id: string;
    round_id: string;
    group_no: number;
    tee_time: string | null;
    starting_hole: number | null;
    notes: string | null;
  }>;

  const { data: pairingMembersData, error: pairingMembersError } =
    pairingGroupsRaw.length > 0
      ? await supabase
          .from("pairing_group_members")
          .select(`
            id,
            group_id,
            position,
            entry_id,
            tournament_entries (
              id,
              handicap_index,
              player:players (
                id,
                first_name,
                last_name,
                club,
                club_id,
                clubs:clubs (
                  name,
                  short_name
                )
              ),
              category:categories (
                id,
                code,
                name
              )
            )
          `)
          .in(
            "group_id",
            pairingGroupsRaw.map((group) => group.id)
          )
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (pairingMembersError) {
    throw new Error(`Error leyendo miembros públicos: ${pairingMembersError.message}`);
  }

  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const roundIdByGroupId = new Map(
    pairingGroupsRaw.map((g) => [g.id, g.round_id])
  );
  const membersByGroup = new Map<string, PairingMember[]>();

  for (const row of (pairingMembersData ?? []) as any[]) {
    const te = Array.isArray(row.tournament_entries)
      ? row.tournament_entries[0] ?? null
      : row.tournament_entries ?? null;

    const player = Array.isArray(te?.player)
      ? te.player[0] ?? null
      : te?.player ?? null;

    const club = Array.isArray(player?.clubs)
      ? player.clubs[0] ?? null
      : player?.clubs ?? null;

    const category = Array.isArray(te?.category)
      ? te.category[0] ?? null
      : te?.category ?? null;

    const playerClubId =
      typeof player?.club_id === "string" && player.club_id.trim()
        ? player.club_id.trim()
        : null;

    const memberRoundId = roundIdByGroupId.get(row.group_id);
    const memberRoundNo =
      roundById.get(memberRoundId ?? "")?.round_no ?? 1;

    const member: PairingMember = {
      entry_id: row.entry_id,
      position: Number(row.position ?? 0),
      player_name: nameOfPlayer(player),
      club_id: playerClubId,
      club_label: normalizeClubLabel(club),
      category_code: category?.code ?? category?.name ?? null,
      handicap_index: te?.handicap_index ?? null,
      standing_display:
        memberRoundNo > 1
          ? standingDisplayByEntryRound.get(
              `${row.entry_id}:${memberRoundNo}`
            ) ?? null
          : null,
    };

    const list = membersByGroup.get(row.group_id) ?? [];
    list.push(member);
    membersByGroup.set(row.group_id, list);
  }

  const labelByGroupId = buildPairingGroupLabelsBySession(
    pairingGroupsRaw,
    sessionRounds
  );

  const selectedCategoryCode =
    selectedCategory?.code ?? selectedCategory?.name ?? "";

  const publicPairingGroups: PublicPairingGroup[] = pairingGroupsRaw
    .map((group) => {
      const round = roundById.get(group.round_id) ?? null;
      const displayRoundId = categoryRoundIdInSession(
        sessionRounds,
        group.round_id,
        selectedCategoryId || null
      );
      return {
        id: group.id,
        round_id: displayRoundId,
        round_no: round?.round_no ?? 0,
        round_date: round?.round_date ?? null,
        group_no: Number(group.group_no ?? 0),
        tee_time: group.tee_time ?? round?.start_time ?? null,
        starting_hole: group.starting_hole ?? null,
        starting_hole_label: labelByGroupId.get(group.id) ?? null,
        notes: group.notes ?? null,
        members: (membersByGroup.get(group.id) ?? []).sort(
          (a, b) => a.position - b.position
        ),
      };
    })
    .filter((group) => {
      const round = roundById.get(group.round_id);
      if (!round || !roundBelongsToCategory(round, selectedCategoryId || null)) {
        return false;
      }
      if (!selectedCategoryCode) return true;
      return group.members.some(
        (m) => m.category_code === selectedCategoryCode
      );
    })
    .sort((a, b) => {
      if (a.round_no !== b.round_no) return a.round_no - b.round_no;
      return a.group_no - b.group_no;
    });

  const pageTitle =
    view === "official"
      ? pub.pageTitleOfficial
      : view === "favorites"
        ? pub.pageTitleFavorites
        : view === "tee-sheet"
          ? pub.pageTitleTeeSheet
          : pub.pageTitleLive;

  const pageDescription =
    view === "official"
      ? pub.pageDescOfficial
      : view === "favorites"
        ? pub.pageDescFavorites
        : view === "tee-sheet"
          ? pub.pageDescTeeSheet
          : pub.pageDescLive;

  const tHref = (opts: {
    categoryId?: string | null;
    roundId?: string | null;
    view?: string | null;
    detailId?: string | null;
  }) =>
    buildHref({
      tournamentId: typedTournament.id,
      embed: isEmbed,
      fromAdmin: isEmbed && fromAdmin,
      ...opts,
    });

  const adminLeaderboardHref = (() => {
    const qs = new URLSearchParams();
    qs.set("tournament_id", typedTournament.id);
    if (view) qs.set("view", view);
    if (requestedCategoryId) qs.set("category_id", requestedCategoryId);
    const roundBack = requestedRoundId || selectedRound?.id;
    if (roundBack) qs.set("round_id", roundBack);
    return `/leaderboard?${qs.toString()}`;
  })();

  return (
    <div
      className={`bg-[#08111f] text-white ${isEmbed ? "min-h-0" : "min-h-screen"}`}
    >
      {isEmbed && fromAdmin ? (
        <div className="sticky top-0 z-50 border-b border-white/10 bg-[#08111f]/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
          <Link
            href={adminLeaderboardHref}
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
          >
            <span aria-hidden>←</span>
            Volver a administración
          </Link>
        </div>
      ) : null}

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_25%)]" />

        <div
          className={`relative mx-auto max-w-7xl sm:px-6 lg:px-8 ${
            isEmbed ? "px-2 pb-4 pt-1 sm:px-6" : "px-4 pb-8 pt-2"
          }`}
        >
          <div className="mb-5 flex flex-col gap-4">
            {!isEmbed ? (
              <div className="-mx-4 flex w-[calc(100%+2rem)] flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:-mx-8 lg:w-[calc(100%+4rem)] lg:px-8">
                <div className="flex shrink-0 justify-start">
                  <PublicInstallShortcut locale={locale} />
                </div>
                <div className="flex shrink-0 justify-end">
                  <PublicLanguageToggle locale={locale} />
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-b border-white/10 pb-2">
                <PublicLanguageToggle locale={locale} />
              </div>
            )}

            {!isEmbed ? (
            <div className={publicTournamentSecondaryNavGridClass}>
              <Link
                href="/"
                className={publicTournamentOutboundNavClasses()}
              >
                {pub.home}
              </Link>

              <Link
                href="/#torneos"
                className={publicTournamentOutboundNavClasses()}
              >
                {pub.seeTournaments}
              </Link>

              {isLoggedIn ? (
                <Link
                  href="/tournaments"
                  className={publicTournamentEmeraldHeroNavClasses()}
                >
                  {pub.adminList}
                </Link>
              ) : null}
            </div>
            ) : null}

            <div className={publicTournamentPrimaryNavGridClass}>
              <Link
                scroll={false}
                href={tHref({
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "live",
                })}
                className={publicTournamentViewPillClasses(view === "live")}
              >
                {pub.live}
              </Link>

              <Link
                scroll={false}
                href={tHref({
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "official",
                })}
                className={publicTournamentViewPillClasses(
                  view === "official"
                )}
              >
                {pub.leaderboard}
              </Link>

              <Link
                scroll={false}
                href={tHref({
                  categoryId: selectedCategoryId || null,
                  roundId:
                    selectedPublicTeeSheetRoundId ??
                    teeSheetRoundIdForCategoryLink(selectedCategoryId) ??
                    undefined,
                  view: "tee-sheet",
                })}
                className={publicTournamentViewPillClasses(
                  view === "tee-sheet"
                )}
              >
                {pub.teeSheet}
              </Link>

              <Link
                scroll={false}
                href={tHref({
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "favorites",
                })}
                className={publicTournamentViewPillClasses(
                  view === "favorites"
                )}
              >
                {pub.favorites}
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[auto,1fr] lg:items-end">
            {posterUrl ? (
              <div className="flex justify-center lg:justify-start">
                <div className="relative h-40 w-28 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/30">
                  <img
                    src={posterUrl}
                    alt={pub.posterAlt}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-3 inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                {pub.publicBadge}
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                {typedTournament.name ?? sb.noName}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {formatDate(typedTournament.start_date)}
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {filteredEntries.length}{" "}
                  {filteredEntries.length === 1 ? pub.playerOne : pub.playersMany}
                </span>

                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {pageTitle}
                </span>

                {selectedCategory ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    {pub.categoryChip}{" "}
                    {selectedCategory.code ?? selectedCategory.name ?? "—"}
                  </span>
                ) : null}

                {selectedRound ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    {formatPublicRoundNavPill(selectedRound, locale)}
                  </span>
                ) : null}
              </div>

              <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {pageDescription}
              </p>
            </div>
          </div>

          {(categories.length > 0 || rounds.length > 0) && (
            <div className="mt-6 flex flex-col gap-3">
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      scroll={false}
                      href={tHref({
                        categoryId: category.id,
                        roundId: roundIdForNavLink(category.id),
                        view,
                      })}
                      className={sectionPillClasses(selectedCategoryId === category.id)}
                    >
                      {category.code ?? category.name ?? common.noCategory}
                    </Link>
                  ))}
                </div>
              ) : null}

              {view !== "tee-sheet" && rounds.length > 0 ? (
                view === "live" ||
                view === "favorites" ||
                view === "official" ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                          {pub.viewingRoundKicker}
                        </p>
                        <p className="mt-1 text-sm text-slate-200">
                          {selectedRound ? (
                            <span className="font-bold text-white">
                              {formatPublicRoundNavPill(selectedRound, locale)}
                              {selectedRound.round_date ? (
                                <span className="font-normal text-slate-400">
                                  {" "}
                                  · {formatDate(selectedRound.round_date)}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              {pub.noRoundSelected}
                            </span>
                          )}
                        </p>
                      </div>

                      {roundsTodayList.length > 1 ? (
                        <div className="flex flex-col gap-2 sm:items-end">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                            {pub.liveRoundToday}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {roundsTodayList.map((round) => (
                              <Link
                                key={round.id}
                                scroll={false}
                                href={tHref({
                                  categoryId: selectedCategoryId || null,
                                  roundId: round.id,
                                  view,
                                })}
                                className={sectionPillClasses(
                                  selectedRound?.id === round.id
                                )}
                              >
                                {formatPublicRoundNavPill(round, locale)}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {roundsByPastDate.length > 0 ||
                    roundsByFutureDate.length > 0 ||
                    roundsWithoutCalendar.length > 0 ? (
                      <details
                        open={selectedRoundIsHistoric}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <summary className="cursor-pointer select-none text-sm font-semibold text-cyan-200 hover:text-cyan-100">
                          {pub.historicRoundsToggle}
                        </summary>
                        <div className="mt-3 space-y-4 border-t border-white/10 pt-3">
                          {roundsByFutureDate.length > 0 ? (
                            <div className="flex flex-col gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                {pub.liveRoundFuture}
                              </span>
                              {roundsByFutureDate.map(
                                ({ dateKey, rounds: dayRounds }) => (
                                  <div
                                    key={dateKey}
                                    className="flex flex-col gap-2 rounded-lg border border-white/5 bg-black/25 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                                  >
                                    <span className="shrink-0 text-xs font-semibold text-slate-300">
                                      {formatDateWithWeekday(
                                        dayRounds[0]?.round_date ?? null,
                                        locale,
                                      )}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {dayRounds.map((round) => (
                                        <Link
                                          key={round.id}
                                          scroll={false}
                                          href={tHref({
                                            categoryId:
                                              selectedCategoryId || null,
                                            roundId: round.id,
                                            view,
                                          })}
                                          className={sectionPillClasses(
                                            selectedRound?.id === round.id
                                          )}
                                        >
                                          {formatPublicRoundNavPill(round, locale)}
                                        </Link>
                                      ))}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}

                          {roundsByPastDate.length > 0 ? (
                            <div className="flex flex-col gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                {pub.liveRoundHistory}
                              </span>
                              {roundsByPastDate.map(
                                ({ dateKey, rounds: dayRounds }) => (
                                  <div
                                    key={dateKey}
                                    className="flex flex-col gap-2 rounded-lg border border-white/5 bg-black/25 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                                  >
                                    <span className="shrink-0 text-xs font-semibold text-slate-300">
                                      {formatDateWithWeekday(
                                        dayRounds[0]?.round_date ?? null,
                                        locale,
                                      )}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {dayRounds.map((round) => (
                                        <Link
                                          key={round.id}
                                          scroll={false}
                                          href={tHref({
                                            categoryId:
                                              selectedCategoryId || null,
                                            roundId: round.id,
                                            view,
                                          })}
                                          className={sectionPillClasses(
                                            selectedRound?.id === round.id
                                          )}
                                        >
                                          {formatPublicRoundNavPill(round, locale)}
                                        </Link>
                                      ))}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}

                          {roundsWithoutCalendar.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                                {pub.liveRoundUndated}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {roundsWithoutCalendar.map((round) => (
                                  <Link
                                    key={round.id}
                                    scroll={false}
                                    href={tHref({
                                      categoryId:
                                        selectedCategoryId || null,
                                      roundId: round.id,
                                      view,
                                    })}
                                    className={sectionPillClasses(
                                      selectedRound?.id === round.id
                                    )}
                                  >
                                    {formatPublicRoundNavPill(round, locale)}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : roundsInCategoryScope.length >
                      roundsTodayList.length ? (
                      <details
                        open={selectedRoundIsHistoric}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <summary className="cursor-pointer select-none text-sm font-semibold text-cyan-200 hover:text-cyan-100">
                          {pub.historicRoundsToggle}
                        </summary>
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <div className="flex flex-wrap gap-2">
                            {roundsInCategoryScope.map((round) => (
                              <Link
                                key={round.id}
                                scroll={false}
                                href={tHref({
                                  categoryId: selectedCategoryId || null,
                                  roundId: round.id,
                                  view,
                                })}
                                className={sectionPillClasses(
                                  selectedRound?.id === round.id
                                )}
                              >
                                {formatPublicRoundNavPill(round, locale)}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#08111f]">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-8 sm:px-4 lg:px-6 xl:px-8">
          {view !== "tee-sheet" && rulesBlocked ? (
            <PublicRulesBlockedView
              blockers={rulesBlockers}
              labels={rulesBlockedLabels}
            />
          ) : null}

          {view === "tee-sheet" ? (
            <PublicTeeSheetView
              groups={publicPairingGroups}
              rounds={publicTeeSheetRounds}
              tournamentId={typedTournament.id}
              selectedCategoryUuid={selectedCategoryId ?? ""}
              selectedCategoryCode={
                selectedCategory?.code ?? selectedCategory?.name ?? ""
              }
              selectedRoundId={selectedPublicTeeSheetRoundId}
              labels={{
                empty: pts.empty,
                noGroupsFilter: pts.noGroupsFilter,
                publishedStarts: pts.publishedStarts,
                groupOne: pts.groupOne,
                groupMany: pts.groupMany,
                startingTee: pts.startingTee,
                playerOne: pts.playerOne,
                playersMany: pts.playersMany,
                scoreHcp: pts.scoreHcp,
                scoreR1: pts.scoreR1,
                scoreR1R2: pts.scoreR1R2,
              }}
            />
          ) : view === "official" ? (
            <OfficialCategoryClosePanel
              cards={categoryRoundCloseCards}
              labels={{
                closed: pub.officialChipClosed,
                pending: pub.officialChipPending,
                complete: pub.officialChipDone,
                showPendingList: pub.officialShowPendingList,
                hidePendingList: pub.officialHidePendingList,
                pendingHeading: pub.officialPendingHeading,
                captureCta: pub.officialCaptureCta,
              }}
            />
          ) : null}

          {view === "favorites" && !rulesBlocked ? (
            <FavoritesView
              tournamentId={typedTournament.id}
              leaderboard={leaderboard}
              selectedRound={selectedRound}
              detailLabels={detailTableLabels}
              selectedCategoryId={selectedCategoryId}
              requestedDetailId={requestedDetailId}
              cutLine={activePublicCutLine}
              competitionRules={competitionRulesList}
              handicapsByPlayerId={handicapsByPlayerId}
              strokeIndexByHole={strokeIndexByHoleRecord}
              rounds={roundsForLock}
              lockedLookups={lockedLookups}
            />
          ) : view === "tee-sheet" || rulesBlocked ? null : (
            <>
              {selectedCategory && headerCompetitionRule ? (
                <div className="mb-4 grid gap-3 lg:grid-cols-2">
                  <PublicCategoryCompetitionInfo
                    categoryCode={selectedCategory.code}
                    rule={headerCompetitionRule}
                    labels={{
                      title: pub.categoryCompetitionTitle,
                      modality: pub.categoryCompetitionModality,
                      leaderboard: pub.categoryCompetitionLeaderboard,
                      prizes: pub.categoryCompetitionPrizes,
                      grossPlaces: pub.categoryCompetitionGrossPlaces,
                      netPlaces: pub.categoryCompetitionNetPlaces,
                      stablefordPlaces: pub.categoryCompetitionStablefordPlaces,
                      grossNetToggleHint: pub.categoryCompetitionGrossNetHint,
                    }}
                  />
                  <PublicPrizesPanel
                    categoryCode={selectedCategory.code}
                    competitionRule={headerCompetitionRule}
                    prizeRules={publicPrizeRulesForCategory}
                    labels={{
                      title: pub.prizesPanelTitle,
                      configuredPlaces: pub.prizesConfiguredPlaces,
                      grossPlace: pub.prizesGrossPlace,
                      netPlace: pub.prizesNetPlace,
                      stablefordPlace: pub.prizesStablefordPlace,
                      noDetailedRules: pub.prizesNoDetailedRules,
                      basisGross: pub.prizesBasisGross,
                      basisNet: pub.prizesBasisNet,
                      basisStableford: pub.prizesBasisStableford,
                    }}
                  />
                </div>
              ) : null}
              <PublicLeaderboardWithSearch
              tournamentId={typedTournament.id}
              embed={isEmbed}
              fromAdmin={fromAdmin}
              fullLeaderboard={
                view === "official" ? officialLeaderboard : leaderboard
              }
              peerRowsForNameCompact={
                view === "official" ? leaderboard : undefined
              }
              view={view === "official" ? "official" : "live"}
              selectedCategoryId={selectedCategoryId}
              selectedRound={selectedRound}
              requestedDetailId={requestedDetailId}
              detailLabels={detailTableLabels}
              labels={{
                placeholder: pub.playerSearchPlaceholder,
                ariaLabel: pub.playerSearchAria,
                hint: pub.playerSearchHint,
                noMatches: pub.playerSearchNoMatches,
                leaderboardEmpty: pub.leaderboardEmptyView,
                countTemplate: pub.playerSearchCount,
              }}
              cutLine={activePublicCutLine}
              competitionRules={competitionRulesList}
              handicapsByPlayerId={handicapsByPlayerId}
              strokeIndexByHole={strokeIndexByHoleRecord}
              headerCompetitionRule={headerCompetitionRule}
              leaderboardViewOverride={leaderboardViewOverride}
              rounds={roundsForLock}
              lockedLookups={lockedLookups}
              basisToggleLabels={
                showGrossNetToggle
                  ? {
                      gross: pub.basisToggleGross,
                      net: pub.basisToggleNet,
                      aria: pub.basisToggleAria,
                    }
                  : undefined
              }
            />
            </>
          )}
        </div>
      </section>

      {!isEmbed ? (
        <section className="bg-[#08111f]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  {pub.cardLiveKicker}
                </p>
                <p className="mt-3 text-lg font-bold text-white">{pub.cardLiveTitle}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pub.cardLiveBody}</p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  {pub.cardTeeKicker}
                </p>
                <p className="mt-3 text-lg font-bold text-white">{pub.cardTeeTitle}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pub.cardTeeBody}</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
