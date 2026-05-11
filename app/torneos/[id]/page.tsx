import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import FavoritesView from "@/components/public/FavoritesView";
import { buildLiveLeaderboard } from "@/lib/leaderboard/buildLiveLeaderboard";
import { applyStandings } from "@/lib/leaderboard/applyStandings";
import { applyCompetitionRules } from "@/lib/leaderboard/applyCompetitionRules";
import PublicLeaderboardTable from "./components/PublicLeaderboardTable";
import PublicTeeSheetView from "./components/PublicTeeSheetView";
import { startingHoleLabelForGroup } from "./lib/shotgunStartingLabels";

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
  adminPillClasses,
  buildHref,
  buildScorecardsHref,
  formatDate,
  getPlayerCode,
  holesPlayedCount,
  isDQScore,
  isDQStatus,
  isStartingOrderConfirmed,
  nameOfPlayer,
  normalizeClubLabel,
  pillClasses,
  sectionPillClasses,
  subtotal,
  toValidEntry,
} from "./lib/utils";

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
  }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

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

  const { data: entriesData, error: entriesError } = await supabase
    .from("tournament_entries")
    .select(`
      id,
      player_id,
      category_id,
      status,
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
    `)
    .eq("tournament_id", typedTournament.id)
    .limit(500);

  if (entriesError) {
    throw new Error(`Error leyendo tournament_entries: ${entriesError.message}`);
  }

  const allEntries = ((entriesData ?? []) as TournamentEntryJoinRow[])
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

  const selectedCategoryId = categories.some((c) => c.id === requestedCategoryId)
    ? requestedCategoryId
    : "";

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const filteredEntries = selectedCategoryId
    ? allEntries.filter((entry) => entry.category_id === selectedCategoryId)
    : allEntries;

  const { data: roundsData, error: roundsError } = await supabase
    .from("rounds")
    .select("id, round_no, round_date, notes, start_type, start_time")
    .eq("tournament_id", typedTournament.id)
    .order("round_no", { ascending: true })
    .order("round_date", { ascending: true });

  if (roundsError) {
    throw new Error(`Error leyendo rounds: ${roundsError.message}`);
  }

  const rounds = (roundsData ?? []) as RoundRow[];
  const publicTeeSheetRounds = rounds.filter((round) => isStartingOrderConfirmed(round.notes));

  const { data: roundScoresData, error: roundScoresError } =
    filteredEntries.length > 0 && rounds.length > 0
      ? await supabase
          .from("round_scores")
          .select("id, round_id, player_id, gross_score")
          .in("player_id", filteredEntries.map((entry) => entry.player_id))
          .in("round_id", rounds.map((r) => r.id))
      : { data: [], error: null };

  if (roundScoresError) {
    throw new Error(`Error leyendo round_scores: ${roundScoresError.message}`);
  }

  const roundScores = (roundScoresData ?? []) as RoundScoreRow[];

  const { data: holeScoresData, error: holeScoresError } =
    roundScores.length > 0
      ? await supabase
          .from("hole_scores")
          .select("round_score_id, hole_number, strokes")
          .in(
            "round_score_id",
            roundScores.map((row) => row.id)
          )
      : { data: [], error: null };

  if (holeScoresError) {
    throw new Error(`Error leyendo hole_scores: ${holeScoresError.message}`);
  }

  const holeScores = (holeScoresData ?? []) as HoleScoreRow[];

  const { data: tournamentHolesData, error: tournamentHolesError } =
    await supabase
      .from("tournament_holes")
      .select("hole_number, par")
      .eq("tournament_id", typedTournament.id)
      .order("hole_number", { ascending: true });

  if (tournamentHolesError) {
    throw new Error(
      `Error leyendo tournament_holes: ${tournamentHolesError.message}`
    );
  }

  const tournamentHoles = (tournamentHolesData ?? []) as TournamentHoleRow[];

  const parByHole = new Map<number, number>();
  for (const row of tournamentHoles) {
    const holeNumber = Number(row.hole_number ?? 0);
    const par = Number(row.par ?? 0);
    if (!holeNumber || !par) continue;
    parByHole.set(holeNumber, par);
  }

  const capturedRoundIds = Array.from(
    new Set(roundScores.map((score) => score.round_id))
  );

  const latestRoundWithScores =
    [...rounds]
      .filter((round) => capturedRoundIds.includes(round.id))
      .sort((a, b) => a.round_no - b.round_no)
      .at(-1) ?? null;

  const selectedRound =
    rounds.find((round) => round.id === requestedRoundId) ??
    (view === "tee-sheet" ? publicTeeSheetRounds[0] ?? null : null) ??
    latestRoundWithScores ??
    rounds[0] ??
    null;

  const selectedPublicTeeSheetRoundId =
    view === "tee-sheet" && publicTeeSheetRounds.some((round) => round.id === requestedRoundId)
      ? requestedRoundId
      : view === "tee-sheet"
        ? null
        : selectedRound?.id ?? null;

  const holeScoresByRoundScoreId = new Map<string, HoleScoreRow[]>();
  for (const row of holeScores) {
    const current = holeScoresByRoundScoreId.get(row.round_score_id) ?? [];
    current.push(row);
    holeScoresByRoundScoreId.set(row.round_score_id, current);
  }

  const { data: competitionRulesData } = await supabase
    .from("competition_rules")
    .select("*")
    .eq("tournament_id", typedTournament.id)
    .maybeSingle();

  const { data: scorecardsData } = await supabase
    .from("scorecards")
    .select("entry_id, round_id, locked_at")
    .eq("tournament_id", typedTournament.id)
    .not("locked_at", "is", null);

  const lockedScorecardMap = new Set(
    (scorecardsData ?? []).map(
      (sc) => `${sc.entry_id}_${sc.round_id}`
    )
  );

  const categoryStatusMap: Record<
    string,
    { total: number; closed: number }
  > = {};

  filteredEntries.forEach((entry) => {
    const cat = entry.category?.code ?? "SIN CAT";

    if (!categoryStatusMap[cat]) {
      categoryStatusMap[cat] = { total: 0, closed: 0 };
    }

    categoryStatusMap[cat].total += 1;

    const hasClosedRound = rounds.some((round) =>
      lockedScorecardMap.has(`${entry.id}_${round.id}`)
    );

    if (hasClosedRound) {
      categoryStatusMap[cat].closed += 1;
    }
  });

  const leaderboardBase = buildLiveLeaderboard({
    filteredEntries,
    rounds,
    roundScores,
    holeScoresByRoundScoreId,
    parByHole,
    lockedScorecardMap,
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

  const leaderboard: LeaderboardRow[] = applyCompetitionRules({
    leaderboard: leaderboardWithStandings,
    competitionRules: competitionRulesData,
  });

  const publicRoundIds = publicTeeSheetRounds.map((round) => round.id);

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

    const member: PairingMember = {
      entry_id: row.entry_id,
      position: Number(row.position ?? 0),
      player_name: nameOfPlayer(player),
      club_id: playerClubId,
      club_label: normalizeClubLabel(club),
      category_code: category?.code ?? category?.name ?? null,
      handicap_index: te?.handicap_index ?? null,
    };

    const list = membersByGroup.get(row.group_id) ?? [];
    list.push(member);
    membersByGroup.set(row.group_id, list);
  }

  const labelByGroupId = new Map<string, string | null>();
  const roundIdsWithGroups = Array.from(
    new Set(pairingGroupsRaw.map((g) => g.round_id))
  );
  for (const roundId of roundIdsWithGroups) {
    const round = roundById.get(roundId) ?? null;
    const groupsInRound = pairingGroupsRaw
      .filter((g) => g.round_id === roundId)
      .sort((a, b) => Number(a.group_no ?? 0) - Number(b.group_no ?? 0));
    const n = groupsInRound.length;
    groupsInRound.forEach((g, idx) => {
      labelByGroupId.set(
        g.id,
        startingHoleLabelForGroup({
          startType: round?.start_type,
          groupIndexInRound: idx,
          groupsInRound: n,
          starting_hole: g.starting_hole ?? null,
        })
      );
    });
  }

  const publicPairingGroups: PublicPairingGroup[] = pairingGroupsRaw
    .map((group) => {
      const round = roundById.get(group.round_id) ?? null;
      return {
        id: group.id,
        round_id: group.round_id,
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
    .sort((a, b) => {
      if (a.round_no !== b.round_no) return a.round_no - b.round_no;
      return a.group_no - b.group_no;
    });

  const playersWithScores = leaderboard.filter((row) => row.hasScores).length;
  const playersPendingScores = Math.max(filteredEntries.length - playersWithScores, 0);

  const pageTitle =
    view === "official"
      ? "Resultados oficiales"
      : view === "favorites"
        ? "Mis favoritos"
        : view === "tee-sheet"
          ? "Salidas"
          : "Live Scoring";

  const pageDescription =
    view === "official"
      ? "Resultados verificados por la administración del torneo."
      : view === "favorites"
        ? "Seguimiento rápido de los jugadores marcados como favoritos."
        : view === "tee-sheet"
          ? "Lista pública de salidas por día, visible solo cuando el comité confirma el orden definitivo."
          : "Resultados en tiempo real del torneo con avances de captura y posiciones por categoría.";

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_25%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700"
              >
                ← Inicio
              </Link>

              <Link
                href="/#torneos"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700"
              >
                Ver torneos
              </Link>

              {isLoggedIn ? (
                <Link href="/tournaments" className={adminPillClasses()}>
                  Ir a lista de torneos
                </Link>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "live",
                })}
                className={pillClasses(view === "live")}
              >
                Live Scoring
              </Link>

              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "official",
                })}
                className={pillClasses(view === "official")}
              >
                Leaderboard
              </Link>

              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  view: "tee-sheet",
                })}
                className={pillClasses(view === "tee-sheet")}
              >
                Salidas
              </Link>

              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "favorites",
                })}
                className={pillClasses(view === "favorites")}
              >
                Favoritos
              </Link>

              <Link
                href={buildScorecardsHref({
                  tournamentId: typedTournament.id,
                  roundId: selectedRound?.id ?? null,
                })}
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600"
              >
                ✍️ Firma electrónica
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[auto,1fr,0.85fr] lg:items-end">
            {posterUrl ? (
              <div className="flex justify-center lg:justify-start">
                <div className="relative h-40 w-28 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/30">
                  <img
                    src={posterUrl}
                    alt="Poster torneo"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-3 inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Torneo público
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                {typedTournament.name ?? "Sin nombre"}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {formatDate(typedTournament.start_date)}
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {filteredEntries.length} jugador
                  {filteredEntries.length === 1 ? "" : "es"}
                </span>

                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {pageTitle}
                </span>

                {selectedCategory ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Categoría: {selectedCategory.code ?? selectedCategory.name ?? "—"}
                  </span>
                ) : null}

                {selectedRound ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Ronda {selectedRound.round_no}
                  </span>
                ) : null}
              </div>

              <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {pageDescription}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#0c1728] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Rondas
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {rounds.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                    Salidas
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {publicPairingGroups.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0c1728] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Pendientes
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {playersPendingScores}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {(categories.length > 0 || rounds.length > 0) && (
            <div className="mt-6 flex flex-col gap-3">
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildHref({
                      tournamentId: typedTournament.id,
                      roundId: view === "tee-sheet" ? selectedPublicTeeSheetRoundId : selectedRound?.id ?? null,
                      view,
                    })}
                    className={sectionPillClasses(!selectedCategoryId)}
                  >
                    Todas las categorías
                  </Link>

                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      href={buildHref({
                        tournamentId: typedTournament.id,
                        categoryId: category.id,
                        roundId: view === "tee-sheet" ? selectedPublicTeeSheetRoundId : selectedRound?.id ?? null,
                        view,
                      })}
                      className={sectionPillClasses(selectedCategoryId === category.id)}
                    >
                      {category.code ?? category.name ?? "Sin categoría"}
                    </Link>
                  ))}
                </div>
              ) : null}

              {view !== "tee-sheet" && rounds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {rounds.map((round) => (
                    <Link
                      key={round.id}
                      href={buildHref({
                        tournamentId: typedTournament.id,
                        categoryId: selectedCategoryId || null,
                        roundId: round.id,
                        view,
                      })}
                      className={sectionPillClasses(selectedRound?.id === round.id)}
                    >
                      R{round.round_no}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#08111f]">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-8 sm:px-4 lg:px-6 xl:px-8">
          {view === "tee-sheet" ? (
            <PublicTeeSheetView
              groups={publicPairingGroups}
              rounds={rounds}
              tournamentId={typedTournament.id}
              selectedCategoryId={selectedCategory?.code ?? selectedCategory?.name ?? ""}
              selectedRoundId={selectedPublicTeeSheetRoundId}
            />
          ) : view === "official" ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(categoryStatusMap)
                .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
                .map(([cat, stats]) => {
                  const pending = Math.max(stats.total - stats.closed, 0);

                  return (
                    <div
                      key={cat}
                      className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold text-cyan-200"
                    >
                      {cat}: {stats.closed}/{stats.total} cerradas
                      {pending > 0 ? ` • faltan ${pending}` : " • completo"}
                    </div>
                  );
                })}
            </div>
          ) : null}

          {view === "favorites" ? (
            <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <FavoritesView
                tournamentId={typedTournament.id}
                leaderboard={leaderboard}
                selectedRoundId={selectedRound?.id ?? null}
              />
            </div>
          ) : view === "tee-sheet" ? null : (
            <PublicLeaderboardTable
              tournamentId={typedTournament.id}
              leaderboard={leaderboard}
              view={view === "official" ? "official" : "live"}
              selectedCategoryId={selectedCategoryId}
              selectedRoundId={selectedRound?.id ?? null}
              requestedDetailId={requestedDetailId}
            />
          )}
        </div>
      </section>

      <section className="bg-[#08111f]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Live Scoring
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Seguimiento en vivo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Captura visible públicamente sin entrar al sistema administrativo.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Salidas
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Grupos por día
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Las salidas públicas aparecen cuando el comité confirma el orden definitivo del día.
              </p>
            </div>

            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                Firma electrónica
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Acceso directo a firmas
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Ingresa a la captura y validación de firma del jugador y marker.
              </p>

              <div className="mt-4">
                <Link
                  href={buildScorecardsHref({
                    tournamentId: typedTournament.id,
                    roundId: selectedRound?.id ?? null,
                  })}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-4 text-sm font-bold text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600"
                >
                  Ir a firma electrónica
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
