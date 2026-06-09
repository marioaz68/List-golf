import Link from "next/link";
import { PublicTopBarCorner } from "@/components/public/PublicTopBarCorner";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import {
  buildLockedScorecardLookups,
  isEntryRoundClosedForCategory,
} from "@/lib/leaderboard/lockedScorecards";
import { fetchLockedScorecardsForTournament } from "@/lib/leaderboard/fetchLockedScorecards";
import FavoritesView from "@/components/public/FavoritesView";
import ConsolationIntegratedPanel from "@/components/public/ConsolationIntegratedPanel";
import { buildLiveLeaderboard } from "@/lib/leaderboard/buildLiveLeaderboard";
import { applyStandings } from "@/lib/leaderboard/applyStandings";
import { applyCompetitionRules } from "@/lib/leaderboard/applyCompetitionRules";
import { applyCompetitionStandings } from "@/lib/leaderboard/competitionStandings";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import { buildInscribedCountByCategory } from "@/lib/cuts/cutAdvancementPolicy";
import {
  computeDisplayCutLines,
  cutEnforcesAtTargetRound,
  primaryCutLineForCategory,
  type RoundAdvancementRule,
} from "@/lib/cuts/computeCutLine";
import {
  activeCutLineForUi,
  annotateCutDividers,
  orderLeaderboardForCutDisplay,
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
import AutoRefresh from "@/components/public/AutoRefresh";
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
import PublicConvocatoriaView from "./components/PublicConvocatoriaView";
import PublicMatchPlayBracket from "./components/PublicMatchPlayBracket";
import PublicTournamentLoadError from "./components/PublicTournamentLoadError";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadPublicBracket } from "@/lib/matchplay/loadPublicBracket";
import type { TournamentSettings } from "@/types/tournament";
import { fetchPublicConvocatoria } from "./lib/fetchPublicConvocatoria";
import { buildTeeSheetEntryOrderMap } from "@/lib/tee-sheet/leaderboardOrderForPairing";
import { buildPairingGroupLabelsBySession } from "@/lib/tee-sheet/pairingGroupLabels";
import { type SessionRoundFields } from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { pairingGroupMatchesCategory } from "@/lib/tee-sheet/pairingGroupCategoryMatch";
import {
  categoryRoundIdForPairingDisplay,
  competitiveDayKey,
  expandRoundIdsForPairingFetch,
  publishedCompetitiveDayKeys,
  roundIdsForPublishedCompetitiveDays,
} from "@/lib/tee-sheet/publicTeeSheetScope";
import { detailLabelsFromPublicTournament } from "./lib/publicDetailTableLabels";
import {
  fetchAllTournamentEntries,
  fetchHoleScoresForRoundScores,
  fetchRoundScoresForPublicLeaderboard,
} from "./lib/data";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { effectivePlayingHandicapForEntry } from "@/lib/handicap/resolveTournamentEntryHandicap";

import type {
  Tournament,
  EntryCategory,
  TournamentEntryJoinRow,
  ValidTournamentEntry,
  RoundRow,
  RoundScoreRow,
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
  const basisFromUrl = parseLeaderboardViewOverride(
    typeof sp.basis === "string" ? sp.basis : undefined
  );

  const view =
    requestedView === "official"
      ? "official"
      : requestedView === "favorites"
        ? "favorites"
        : requestedView === "convocatoria"
          ? "convocatoria"
          : requestedView === "bracket" || requestedView === "cuadro"
            ? "bracket"
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
  const cv = messages[locale].convocatoria;
  const detailTableLabels = detailLabelsFromPublicTournament(pub);
  const pts = messages[locale].publicTeeSheet;
  const common = messages[locale].common;
  const sb = messages[locale].sidebar;

  const tournamentResponse = isLoggedIn
    ? await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path,settings")
        .eq("id", id)
        .maybeSingle()
    : await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path,settings")
        .eq("id", id)
        .eq("is_public", true)
        // Rondas privadas (kind='daily_round' del club) nunca por URL pública
        .eq("is_private", false)
        .maybeSingle();

  const { data: tournament, error: tournamentError } = tournamentResponse;

  if (tournamentError || !tournament) {
    notFound();
  }

  const typedTournament = tournament as Tournament & {
    poster_path?: string | null;
    settings?: TournamentSettings | null;
  };

  const isMatchPlayTournament = isMatchPlayFormat(
    typedTournament.settings ?? null
  );

  if (view === "bracket" && !isMatchPlayTournament) {
    const qs = new URLSearchParams({ view: "live" });
    if (isEmbed) qs.set("embed", "1");
    if (isEmbed && fromAdmin) qs.set("from", "admin");
    redirect(`/torneos/${id}?${qs.toString()}`);
  }

  // En match play, la vista «bracket» estática redirige al cuadro en vivo.
  if (
    isMatchPlayTournament &&
    !isEmbed &&
    view === "bracket"
  ) {
    redirect(`/torneos/${id}/cuadro-vivo`);
  }
  const posterUrl = typedTournament.poster_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tournament-posters/${typedTournament.poster_path}`
    : null;

  const publicConvocatoria = await fetchPublicConvocatoria(typedTournament.id, {
    generalHeading: pub.convocatoriaGeneralHeading,
    metaPracticeDay: cv.metaPracticeDay,
    metaHandicapDate: cv.metaHandicapDate,
    metaRounds: cv.metaRounds,
    metaHoles: cv.metaHoles,
    metaCutHoles: cv.metaCutHoles,
    metaCutPct: cv.metaCutPct,
    categoriesHeading: pub.convocatoriaCategoriesHeading,
    system: cv.refSystem,
    gentlemen: cv.refGentlemen,
    ladies: cv.refLadies,
    seniors_ages: cv.refSeniorsAges,
    cut_policy: cv.refCutPolicy,
    cut_tiebreak_gross: cv.refCutTiebreakGross,
    cut_tiebreak_stableford: cv.refCutTiebreakStableford,
    cut_tiebreak_seniors: cv.refCutTiebreakSeniors,
    trophy_tiebreak: cv.refTrophyTiebreak,
    trophies: cv.refTrophies,
    out_of_scope: cv.refOutOfScope,
  });

  if (view === "convocatoria" && !publicConvocatoria.visible) {
    redirect(
      buildHref({
        tournamentId: typedTournament.id,
        view: "live",
        embed: isEmbed,
        fromAdmin: isEmbed && fromAdmin ? true : undefined,
      })
    );
  }

  let entriesData: unknown[] = [];
  try {
    entriesData = await fetchAllTournamentEntries(
      supabase,
      typedTournament.id
    );
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Error leyendo inscripciones";
    return (
      <PublicTournamentLoadError
        title={pub.loadErrorTitle}
        body={pub.loadErrorBody}
        detailMessage={detail}
        technicalLabel={pub.loadErrorTechnical}
      />
    );
  }

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
  const isFavoritesView = view === "favorites";
  const isConvocatoriaView = view === "convocatoria";
  const isBracketView = view === "bracket";

  if (
    categories.length > 0 &&
    !requestedCategoryId &&
    defaultCategoryId &&
    !isFavoritesView &&
    !isConvocatoriaView &&
    !isBracketView
  ) {
    redirect(
      buildHref({
        tournamentId: typedTournament.id,
        categoryId: defaultCategoryId,
        roundId: requestedRoundId || undefined,
        view: requestedView || undefined,
        detailId: requestedDetailId || undefined,
        basis: basisFromUrl ?? undefined,
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
        basis: basisFromUrl ?? undefined,
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
  const entriesForLeaderboard = isFavoritesView ? allEntries : filteredEntries;

  const { data: roundsData, error: roundsError } = await supabase
    .from("rounds")
    .select(
      "id, round_no, round_date, category_id, notes, start_type, start_time, wave"
    )
    .eq("tournament_id", typedTournament.id)
    .order("round_no", { ascending: true })
    .order("round_date", { ascending: true });

  if (roundsError) {
    return (
      <PublicTournamentLoadError
        title={pub.loadErrorTitle}
        body={pub.loadErrorBody}
        detailMessage={roundsError.message}
        technicalLabel={pub.loadErrorTechnical}
      />
    );
  }

  const rounds = (roundsData ?? []) as RoundRow[];
  const roundNotesById = new Map(rounds.map((r) => [r.id, r.notes]));
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

  const roundsInCategoryScope = rounds.filter((r) =>
    roundBelongsToCategory(r, selectedCategoryId || null)
  );
  const roundsScopeForLeaderboard = isFavoritesView
    ? rounds
    : roundsInCategoryScope;
  const publishedDayKeys = publishedCompetitiveDayKeys(rounds, roundNotesById);
  // Si la vista pública de salidas está sin filtro explícito de categoría,
  // mostramos las rondas/grupos de TODAS las categorías (info operativa para
  // encontrar grupo). Lo decidimos aquí para usarlo también al cargar grupos.
  const teeSheetShowAllCategories =
    view === "tee-sheet" && !requestedCategoryId;

  const publicTeeSheetRounds = rounds.filter((round) => {
    if (
      !teeSheetShowAllCategories &&
      !roundBelongsToCategory(round, selectedCategoryId || null)
    ) {
      return false;
    }
    return publishedDayKeys.has(competitiveDayKey(round));
  });

  const todayKey = utcTodayKey();
  const roundsTodayAll = rounds
    .filter((r) => roundDateUtcKey(r.round_date) === todayKey)
    .sort(sortRoundsChrono);

  const roundsTodayList = isFavoritesView
    ? roundsTodayAll
    : roundsTodayAll.filter((r) =>
        roundBelongsToCategory(r, selectedCategoryId || null)
      );

  const roundsInNavScope = (roundRows: RoundRow[]) =>
    isFavoritesView
      ? roundRows
      : roundRows.filter((r) =>
          roundBelongsToCategory(r, selectedCategoryId || null)
        );

  const pastDateKeysSorted = [
    ...new Set(
      roundsInNavScope(rounds)
        .map((r) => roundDateUtcKey(r.round_date))
        .filter((k): k is string => !!k && k < todayKey)
    ),
  ].sort((a, b) => b.localeCompare(a));

  const roundsByPastDate = pastDateKeysSorted
    .map((dateKey) => ({
      dateKey,
      rounds: roundsInNavScope(rounds)
        .filter((r) => roundDateUtcKey(r.round_date) === dateKey)
        .sort(sortRoundsChrono),
    }))
    .filter((g) => g.rounds.length > 0);

  const roundsWithoutCalendar = roundsInNavScope(
    rounds.filter((r) => !roundDateUtcKey(r.round_date))
  ).sort(sortRoundsChrono);

  const futureDateKeysSorted = [
    ...new Set(
      roundsInNavScope(rounds)
        .map((r) => roundDateUtcKey(r.round_date))
        .filter((k): k is string => !!k && k > todayKey)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const roundsByFutureDate = futureDateKeysSorted
    .map((dateKey) => ({
      dateKey,
      rounds: roundsInNavScope(rounds)
        .filter((r) => roundDateUtcKey(r.round_date) === dateKey)
        .sort(sortRoundsChrono),
    }))
    .filter((g) => g.rounds.length > 0);

  const serviceRoleConfigured = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const adminSupabase = serviceRoleConfigured ? tryCreateAdminClient() : null;

  let publicMatchPlayBracket: Awaited<
    ReturnType<typeof loadPublicBracket>
  > = null;
  if (isMatchPlayTournament && serviceRoleConfigured) {
    try {
      publicMatchPlayBracket = await loadPublicBracket(typedTournament.id);
    } catch (err) {
      console.error("[public bracket] load:", err);
    }
  }

  let roundScores: RoundScoreRow[] = [];
  let holeScores: HoleScoreRow[] = [];
  if (
    adminSupabase &&
    entriesForLeaderboard.length > 0 &&
    roundsScopeForLeaderboard.length > 0
  ) {
    try {
      roundScores = await fetchRoundScoresForPublicLeaderboard(
        adminSupabase,
        entriesForLeaderboard.map((entry) => entry.player_id),
        roundsScopeForLeaderboard.map((r) => r.id)
      );
      if (roundScores.length > 0) {
        holeScores = await fetchHoleScoresForRoundScores(
          adminSupabase,
          roundScores.map((row) => row.id)
        );
      }
    } catch (err) {
      console.error("[public tournament] round/hole scores:", err);
    }
  }

  const { data: tournamentHolesData, error: tournamentHolesError } =
    await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", typedTournament.id)
      .order("hole_number", { ascending: true });

  if (tournamentHolesError) {
    return (
      <PublicTournamentLoadError
        title={pub.loadErrorTitle}
        body={pub.loadErrorBody}
        detailMessage={tournamentHolesError.message}
        technicalLabel={pub.loadErrorTechnical}
      />
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
    [...roundsScopeForLeaderboard]
      .filter((round) => capturedRoundIds.includes(round.id))
      .sort((a, b) => a.round_no - b.round_no)
      .at(-1) ?? null;

  const scorecardsData = adminSupabase
    ? await fetchLockedScorecardsForTournament(
        adminSupabase,
        typedTournament.id
      )
    : [];
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
    round_date: r.round_date ?? null,
    wave: r.wave ?? null,
  }));

  const gateEntries = entriesForLeaderboard;
  const defaultRoundFromClose = resolveDefaultPublicLeaderboardRound({
    entries: gateEntries,
    allRounds: rounds,
    roundsInScope: roundsScopeForLeaderboard,
    selectedCategoryId: isFavoritesView ? null : selectedCategoryId || null,
    lockedLookups,
    latestRoundWithScores: latestRoundWithScoresFiltered,
  });

  const defaultRoundLiveFavorite =
    roundsTodayList[0] ??
    defaultRoundFromClose ??
    roundsScopeForLeaderboard[0] ??
    null;
  const defaultRoundOfficial =
    defaultRoundFromClose ??
    latestRoundWithScoresFiltered ??
    roundsInCategoryScope[0] ??
    null;

  let effectiveRequestedRoundId = requestedRoundId;
  if (requestedRoundId && selectedCategoryId && !isFavoritesView) {
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
    roundsScopeForLeaderboard.find(
      (round) => round.id === effectiveRequestedRoundId
    ) ??
    (view === "tee-sheet" ? publicTeeSheetRounds[0] ?? null : null) ??
    (view === "live" || view === "favorites" ? defaultRoundLiveFavorite : null) ??
    (view === "official" ? defaultRoundOfficial : null) ??
    roundsScopeForLeaderboard[0] ??
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
    const categoryTeeRounds = rounds.filter((round) => {
      if (!roundBelongsToCategory(round, categoryId)) return false;
      return publishedDayKeys.has(competitiveDayKey(round));
    });
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
        basis: basisFromUrl ?? undefined,
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
  let competitionRulesRows: CategoryCompetitionRule[] | null = null;
  let competitionRulesError: { message: string } | null = null;
  let advancementRulesRows: RoundAdvancementRule[] | null = null;
  let advancementRulesError: { message: string } | null = null;

  if (serviceRoleConfigured && adminSupabase) {
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
  if (profileIds.length > 0 && adminSupabase) {
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

  const handicapClient = adminSupabase ?? supabase;
  let tournamentHandicapCtx = null;
  try {
    tournamentHandicapCtx = await loadTournamentHandicapContext(
      handicapClient,
      typedTournament.id
    );
  } catch (err) {
    console.error("[public-tournament] handicap context:", err);
  }

  /** PH efectivo por jugador (CH del campo × % reglas de competencia). */
  const handicapByPlayerId = new Map<string, number | null>();
  for (const entry of allEntries) {
    const hi =
      entry.handicap_index ??
      entry.player.handicap_torneo ??
      entry.player.handicap_index ??
      null;
    const ph = tournamentHandicapCtx
      ? effectivePlayingHandicapForEntry(
          {
            id: entry.id,
            player_id: entry.player_id,
            category_id: entry.category_id,
            handicap_index: entry.handicap_index,
            playing_handicap: entry.playing_handicap,
            playing_handicap_override: entry.playing_handicap_override,
            player: {
              gender: entry.player.gender ?? null,
              birth_year: entry.player.birth_year ?? null,
              handicap_index: entry.player.handicap_index,
              handicap_torneo: entry.player.handicap_torneo,
            },
          },
          tournamentHandicapCtx
        )
      : entry.playing_handicap_override ?? entry.playing_handicap;
    handicapByPlayerId.set(
      entry.player_id,
      ph != null ? Number(ph) : hi != null ? Number(hi) : null
    );
  }

  const handicapsByPlayerId = Object.fromEntries(handicapByPlayerId);

  const categoryIdsWithPlayers = new Set(
    (isFavoritesView ? allEntries : filteredEntries)
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

  const showGrossNetToggle =
    Boolean(headerCompetitionRule) &&
    categoryShowsGrossNetToggle(headerCompetitionRule!);
  const leaderboardViewOverride = showGrossNetToggle
    ? basisFromUrl ?? "gross"
    : null;

  let publicPrizeRulesForCategory: PublicPrizeRuleRow[] = [];
  if (
    serviceRoleConfigured &&
    adminSupabase &&
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
    typedTournament.id,
    roundsForLock
  );

  const selectedRoundNo = selectedRound?.round_no ?? 1;

  let leaderboard: LeaderboardRow[] = [];
  let publicCutLines: ReturnType<typeof computeDisplayCutLines> = [];
  let cutEnforcesForSelectedRound = false;
  let activePublicCutLine: ReturnType<typeof activeCutLineForUi> = null;
  let officialLeaderboard: LeaderboardRow[] = [];
  let leaderboardBuildError: string | null = null;

  if (!rulesBlocked) {
    try {
    const leaderboardBase = buildLiveLeaderboard({
      filteredEntries: entriesForLeaderboard,
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

    const includeIncompleteRounds = view === "live" || view === "favorites";

    const leaderboardWithStandings = applyStandings({
      leaderboardBase,
      rounds,
      selectedRound,
      holesPlayedCount,
      lockedLookups,
      roundsForLock,
      includeIncompleteRounds,
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
      includeIncompleteRounds,
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
      includeIncompleteRounds,
    });

    cutEnforcesForSelectedRound = cutEnforcesAtTargetRound(
      advancementRulesList,
      selectedRoundNo
    );

    const inscribedCountByCategoryId = buildInscribedCountByCategory(
      allEntries.map((e) => ({
        category_id: e.category_id,
        status: e.status,
      }))
    );

    const cutRankingOptions = {
      useClosedRoundClassification: true,
      lockedLookups,
      roundsForLock,
    };

    publicCutLines = computeDisplayCutLines({
      leaderboard: leaderboardScored,
      advancementRules: advancementRulesList,
      competitionRules: competitionRulesList,
      categories: categories.map((c) => ({
        id: c.id,
        code: c.code,
      })),
      selectedRoundNo,
      selectedCategoryId: isFavoritesView ? null : selectedCategoryId || null,
      handicapByPlayerId,
      tieBreakStepsByProfileId,
      strokeIndexByHole,
      inscribedCountByCategoryId,
      leaderboardViewOverride,
      useClosedRoundClassification: true,
      lockedLookups,
      roundsForLock,
    });

    const showCutOnLeaderboard = publicCutLines.length > 0;

    const withMadeCut: LeaderboardRow[] = leaderboardScored.map((row) => {
      if (!showCutOnLeaderboard || row.is_disqualified) {
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

    const orderedForCut = showCutOnLeaderboard
      ? orderLeaderboardForCutDisplay({
          rows: withMadeCut,
          cutLines: publicCutLines,
          advancementRules: advancementRulesList,
          categories: categories.map((c) => ({
            id: c.id,
            code: c.code,
          })),
          selectedRoundNo,
          competitionRules: competitionRulesList,
          handicapByPlayerId,
          strokeIndexByHole,
          leaderboardViewOverride,
          cutRankingOptions,
        })
      : withMadeCut;

    leaderboard = annotateCutDividers(
      orderedForCut,
      publicCutLines,
      isFavoritesView ? null : selectedCategoryId || null
    );

    activePublicCutLine = isFavoritesView
      ? null
      : activeCutLineForUi(publicCutLines, selectedCategoryId || null);

    officialLeaderboard =
      selectedRound?.round_no != null
        ? leaderboard.filter((row) =>
            isEntryRoundClosedForCategory(
              row.entry_id,
              row.category_id,
              selectedRound.round_no,
              roundsForLock,
              lockedLookups
            )
          )
        : leaderboard;
    } catch (err) {
      leaderboardBuildError =
        err instanceof Error ? err.message : "Error al calcular clasificación";
      console.error("[public tournament] leaderboard:", err);
    }
  }

  /** Clasificación oficial vacía si ninguna tarjeta está cerrada; mostramos
   *  scores en vivo como provisional hasta que el comité cierre tarjetas. */
  const useProvisionalOfficial =
    view === "official" &&
    !rulesBlocked &&
    !leaderboardBuildError &&
    officialLeaderboard.length === 0 &&
    leaderboard.length > 0;

  const displayLeaderboard = useProvisionalOfficial
    ? leaderboard
    : view === "official"
      ? officialLeaderboard
      : leaderboard;

  const displayLeaderboardView: "live" | "official" = useProvisionalOfficial
    ? "live"
    : view === "official"
      ? "official"
      : "live";

  const seedRoundIds =
    publicTeeSheetRounds.length > 0
      ? publicTeeSheetRounds.map((round) => round.id)
      : roundsInCategoryScope
          .filter((round) => publishedDayKeys.has(competitiveDayKey(round)))
          .map((round) => round.id);

  const publicRoundIds = expandRoundIdsForPairingFetch(
    sessionRounds,
    seedRoundIds.length > 0
      ? seedRoundIds
      : roundIdsForPublishedCompetitiveDays(sessionRounds, publishedDayKeys)
  );

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
      const admin = tryCreateAdminClient();
      if (admin) {
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
    console.error(
      `[public tournament] pairing_groups: ${pairingGroupsError.message}`
    );
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
              category_id,
              player:players (
                id,
                first_name,
                last_name,
                gender,
                birth_year,
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

  // Reglas + sets de salidas para mostrar el dot del tee asignado en cada
  // jugador (igual que en /cuadro-vivo y backoffice). Defensivo ante errores.
  let publicTeeSetsRes: { data: any[] | null } = { data: [] };
  let publicTeeRulesRes: { data: any[] | null } = { data: [] };
  try {
    [publicTeeSetsRes, publicTeeRulesRes] = await Promise.all([
      supabase
        .from("tee_sets")
        .select("id, name, code, color")
        .eq("tournament_id", typedTournament.id),
      supabase
        .from("category_tee_rules")
        .select(
          "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
        )
        .eq("tournament_id", typedTournament.id)
        .order("priority", { ascending: true }),
    ]);
  } catch (err) {
    console.error("[public tee-sheet] tee rules:", err);
  }
  const publicTeeSets = (publicTeeSetsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    code: string | null;
    color: string | null;
  }>;
  const publicTeeRules = (publicTeeRulesRes.data ?? []) as Array<{
    id: string;
    category_id: string;
    tee_set_id: string;
    priority: number | null;
    age_min: number | null;
    age_max: number | null;
    gender: "M" | "F" | "X" | null;
    handicap_min: number | null;
    handicap_max: number | null;
  }>;
  const publicTeeSetById = new Map(publicTeeSets.map((t) => [t.id, t]));

  function resolvePublicTeeForPlayer(p: {
    gender: string | null;
    handicap_index: number | null;
    category_id: string | null;
    birth_year: number | null;
  }): { color: string | null; name: string | null } {
    if (!p.category_id) return { color: null, name: null };
    const age =
      p.birth_year && p.birth_year > 0
        ? new Date().getFullYear() - p.birth_year
        : null;
    const hi = p.handicap_index == null ? null : Number(p.handicap_index);
    const pg = String(p.gender ?? "X").trim().toUpperCase();
    const candidates = publicTeeRules
      .filter((r) => r.category_id === p.category_id)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    for (const r of candidates) {
      if (r.gender && r.gender !== pg) continue;
      if (r.age_min != null && (age == null || age < r.age_min)) continue;
      if (r.age_max != null && (age == null || age > r.age_max)) continue;
      if (r.handicap_min != null && (hi == null || hi < Number(r.handicap_min)))
        continue;
      if (r.handicap_max != null && (hi == null || hi > Number(r.handicap_max)))
        continue;
      const tee = publicTeeSetById.get(r.tee_set_id);
      if (tee) return { color: tee.color ?? null, name: tee.name ?? null };
    }
    return { color: null, name: null };
  }

  if (pairingMembersError) {
    console.error(
      `[public tournament] pairing_members: ${pairingMembersError.message}`
    );
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

    const memberCategoryId = category?.id ?? te?.category_id ?? null;
    const teeInfo = resolvePublicTeeForPlayer({
      gender: player?.gender ?? null,
      handicap_index: te?.handicap_index ?? null,
      category_id: memberCategoryId,
      birth_year: player?.birth_year ?? null,
    });

    const member: PairingMember = {
      entry_id: row.entry_id,
      position: Number(row.position ?? 0),
      player_name: nameOfPlayer(player),
      first_name: player?.first_name ?? null,
      last_name: player?.last_name ?? null,
      club_id: playerClubId,
      club_label: normalizeClubLabel(club),
      category_code: category?.code ?? category?.name ?? null,
      category_id: memberCategoryId,
      handicap_index: te?.handicap_index ?? null,
      standing_display:
        memberRoundNo > 1
          ? standingDisplayByEntryRound.get(
              `${row.entry_id}:${memberRoundNo}`
            ) ?? null
          : null,
      tee_color: teeInfo.color,
      tee_name: teeInfo.name,
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
      const displayRoundId = categoryRoundIdForPairingDisplay(
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
      if (teeSheetShowAllCategories) return true;
      return pairingGroupMatchesCategory(
        group.notes,
        group.members,
        selectedCategoryCode || selectedCategory?.code,
        selectedCategory?.name,
        selectedCategoryId || null
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
          : view === "convocatoria"
            ? pub.pageTitleConvocatoria
            : view === "bracket"
              ? pub.pageTitleBracket
              : pub.pageTitleLive;

  const pageDescription =
    view === "official"
      ? pub.pageDescOfficial
      : view === "favorites"
        ? pub.pageDescFavorites
        : view === "tee-sheet"
          ? pub.pageDescTeeSheet
          : view === "convocatoria"
            ? pub.pageDescConvocatoria
            : view === "bracket"
              ? pub.pageDescBracket
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
      basis: leaderboardViewOverride ?? undefined,
      ...opts,
    });

  const categoryIdForRoundNav = isFavoritesView
    ? null
    : selectedCategoryId || null;

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
      <AutoRefresh intervalMs={10000} />
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
                  <PublicTopBarCorner locale={locale} />
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-b border-white/10 pb-2">
                <PublicTopBarCorner locale={locale} />
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
                  view: "favorites",
                })}
                className={publicTournamentViewPillClasses(
                  view === "favorites"
                )}
              >
                {pub.favorites}
              </Link>

              {publicConvocatoria.visible ? (
                <Link
                  scroll={false}
                  href={tHref({ view: "convocatoria" })}
                  className={publicTournamentViewPillClasses(
                    view === "convocatoria"
                  )}
                >
                  {pub.convocatoria}
                </Link>
              ) : null}

              {isMatchPlayTournament ? (
                <>
                  <Link
                    href={`/torneos/${id}/cuadro-vivo`}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-900/60"
                  >
                    🎯 {pub.bracketLiveTab}
                  </Link>
                  <Link
                    href={`/torneos/${id}/matches-vivo`}
                    className="inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-950/40 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-900/60"
                  >
                    📺 {pub.matchesLiveTab}
                  </Link>
                  <Link
                    href={`/torneos/${id}/consolacion-match`}
                    className="inline-flex items-center justify-center rounded-full border border-violet-400/40 bg-violet-950/40 px-3 py-1.5 text-[11px] font-bold text-violet-200 hover:bg-violet-900/60"
                  >
                    🏆 Consolación match
                  </Link>
                  <Link
                    href={`/torneos/${id}/consolacion-stroke`}
                    className="inline-flex items-center justify-center rounded-full border border-sky-400/40 bg-sky-950/40 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-900/60"
                  >
                    ⛳ Consolación stroke
                  </Link>
                </>
              ) : null}
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
                  {(isFavoritesView ? allEntries : filteredEntries).length}{" "}
                  {(isFavoritesView ? allEntries : filteredEntries).length === 1
                    ? pub.playerOne
                    : pub.playersMany}
                </span>

                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {pageTitle}
                </span>

                {selectedCategory &&
                !isFavoritesView &&
                !isConvocatoriaView &&
                !isBracketView ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    {pub.categoryChip}{" "}
                    {selectedCategory.code ?? selectedCategory.name ?? "—"}
                  </span>
                ) : null}

                {selectedRound &&
                !isFavoritesView &&
                !isConvocatoriaView &&
                !isBracketView ? (
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

          {(categories.length > 0 || rounds.length > 0) &&
          !isConvocatoriaView &&
          !isBracketView && (
            <div className="mt-6 flex flex-col gap-3">
              {categories.length > 0 && !isFavoritesView ? (
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
              ) : isFavoritesView ? (
                <p className="text-sm text-slate-400">
                  {pub.favoritesAllCategoriesHint}
                </p>
              ) : null}

              {view !== "tee-sheet" &&
              rounds.length > 0 &&
              !isFavoritesView ? (
                view === "live" || view === "official" ? (
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
                                  categoryId: categoryIdForRoundNav,
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
                                            categoryId: categoryIdForRoundNav,
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
                                            categoryId: categoryIdForRoundNav,
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
                                      categoryId: categoryIdForRoundNav,
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
                    ) : roundsScopeForLeaderboard.length >
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
                            {roundsScopeForLeaderboard.map((round) => (
                              <Link
                                key={round.id}
                                scroll={false}
                                href={tHref({
                                  categoryId: categoryIdForRoundNav,
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
          {view !== "tee-sheet" &&
          view !== "convocatoria" &&
          view !== "bracket" &&
          rulesBlocked ? (
            <PublicRulesBlockedView
              blockers={rulesBlockers}
              labels={rulesBlockedLabels}
            />
          ) : null}

          {view !== "tee-sheet" &&
          view !== "convocatoria" &&
          view !== "bracket" &&
          !rulesBlocked &&
          leaderboardBuildError ? (
            <PublicTournamentLoadError
              title={pub.leaderboardBuildErrorTitle}
              body={pub.leaderboardBuildErrorBody}
              detailMessage={leaderboardBuildError}
              technicalLabel={pub.loadErrorTechnical}
            />
          ) : null}

          {view === "convocatoria" ? (
            <PublicConvocatoriaView
              sections={publicConvocatoria.sections}
              labels={{
                empty: pub.convocatoriaEmpty,
                readOnlyNote: pub.convocatoriaReadOnlyNote,
              }}
            />
          ) : view === "bracket" ? (
            publicMatchPlayBracket ? (
              <PublicMatchPlayBracket
                bracket={publicMatchPlayBracket}
                labels={{
                  empty: pub.bracketEmpty,
                  format: pub.bracketFormat,
                  allowance: pub.bracketAllowance,
                  vs: pub.bracketVs,
                  holeDetail: pub.bracketHoleDetail,
                  lowBall: pub.bracketLowBall,
                  highBall: pub.bracketHighBall,
                  points: pub.bracketPoints,
                  liveMarker: pub.bracketLive,
                  completed: pub.bracketCompleted,
                  bye: pub.bracketBye,
                }}
              />
            ) : (
              <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-300">
                {pub.bracketEmpty}
              </div>
            )
          ) : view === "tee-sheet" ? (
            <PublicTeeSheetView
              groups={publicPairingGroups}
              rounds={publicTeeSheetRounds}
              tournamentId={typedTournament.id}
              selectedCategoryUuid={
                teeSheetShowAllCategories ? "" : selectedCategoryId ?? ""
              }
              selectedCategoryCode={
                teeSheetShowAllCategories
                  ? ""
                  : selectedCategory?.code ?? selectedCategory?.name ?? ""
              }
              selectedRoundId={
                publicTeeSheetRounds.some(
                  (round) => round.id === selectedPublicTeeSheetRoundId
                )
                  ? selectedPublicTeeSheetRoundId
                  : publicTeeSheetRounds[0]?.id ?? null
              }
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

          {view === "favorites" && !rulesBlocked && !leaderboardBuildError ? (
            <>
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
                leaderboardViewOverride={leaderboardViewOverride}
                rounds={roundsForLock}
                lockedLookups={lockedLookups}
              />
              {isMatchPlayTournament ? (
                <ConsolationIntegratedPanel
                  tournamentId={typedTournament.id}
                  mode="favorites"
                />
              ) : null}
            </>
          ) : view === "tee-sheet" ||
            view === "convocatoria" ||
            view === "bracket" ||
            rulesBlocked ||
            leaderboardBuildError ? null : (
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
              {isMatchPlayTournament &&
              (view === "live" || view === "official") ? (
                <ConsolationIntegratedPanel
                  tournamentId={typedTournament.id}
                  mode={view === "official" ? "leaderboard" : "live"}
                  className={view === "official" ? "mb-4 mt-0" : "mt-6"}
                />
              ) : null}
              {useProvisionalOfficial ? (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-[12px] leading-snug text-amber-100">
                  Clasificación provisional: aún no hay tarjetas cerradas en esta
                  ronda. Los totales pueden cambiar hasta que el comité firme las
                  tarjetas.
                </p>
              ) : null}
              <PublicLeaderboardWithSearch
              tournamentId={typedTournament.id}
              embed={isEmbed}
              fromAdmin={fromAdmin}
              fullLeaderboard={displayLeaderboard}
              peerRowsForNameCompact={
                view === "official" ? leaderboard : undefined
              }
              view={displayLeaderboardView}
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
