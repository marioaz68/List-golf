import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/fmt";
import { listCategoriesBlockedForRound } from "@/lib/rounds/categoryRoundGate";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import {
  fetchTournamentRegistrationStatus,
  isRegistrationClosed,
} from "@/lib/tournaments/registrationGate";
import {
  backofficeTableStickyScroll,
  twStickyTheadSlate50,
} from "@/lib/ui/backofficeTableSticky";
import { formatStartingHoleLabel } from "@/lib/tee-sheet/formatStartingHoleLabel";
import { buildPairingGroupLabelsBySession } from "@/lib/tee-sheet/pairingGroupLabels";
import {
  buildSessionBlocks,
  formatSessionOptionLabel,
  representativeRoundId,
  roundsInSameSession,
} from "./sessionBlock";
import { createAdminClient } from "@/utils/supabase/admin";
import { buildTeeSheetEntryOrderMap } from "@/lib/tee-sheet/leaderboardOrderForPairing";
import {
  cutEnforcesAtTargetRound,
  type RoundAdvancementRule,
} from "@/lib/cuts/computeCutLine";
import { repairCutRulesTargetFinalRound } from "@/lib/convocatoria/upgradeTournamentRules";
import {
  clearGroups,
  confirmStartingOrder,
  generateGroupsByCategory,
  generateMatchPlayTeeSheet,
  recalculateTeeTimes,
  reopenStartingOrder,
  saveCategoryPlanOrder,
} from "./actions";
import TeeSheetDnD from "./TeeSheetDnD";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_GROUP_SIZE = 8;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type Round = {
  id: string;
  tournament_id: string;
  category_id: string | null;
  round_no: number;
  round_date: string | null;
  start_type: string;
  start_time: string | null;
  interval_minutes: number | null;
  wave: string | null;
  notes: string | null;
  categories?: {
    code: string | null;
    name: string | null;
  } | null;
};

type GroupRow = {
  id: string;
  round_id: string;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  notes: string | null;
};

type MemberUI = {
  entry_id: string;
  group_id: string;
  position: number;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  standing_display: string | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name: string | null;
  club_logo_url: string | null;
  club_generated_logo_url: string | null;
  club_primary_color: string | null;
  tee_color: string | null;
  tee_name: string | null;
};

type GroupUI = GroupRow & {
  members: MemberUI[];
  starting_label: string | null;
  session_round_date: string | null;
};

function catKey(notes: string | null) {
  const v = (notes ?? "").trim();
  return v || "SIN CATEGORÍA";
}

function catSort(a: string, b: string) {
  if (a === "SIN CATEGORÍA" && b !== "SIN CATEGORÍA") return 1;
  if (b === "SIN CATEGORÍA" && a !== "SIN CATEGORÍA") return -1;
  return a.localeCompare(b);
}


const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

function isStartingOrderConfirmed(notes: string | null | undefined) {
  return String(notes ?? "").includes(STARTING_ORDER_CONFIRMED_MARKER);
}

export default async function TeeSheetPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const locale = await getLocale();
  const teeTitle = messages[locale].teeSheet.title;
  const ts = messages[locale].teeSheet;
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";
  const roundId = typeof sp.round_id === "string" ? sp.round_id.trim() : "";

  const groupSizeRaw =
    typeof sp.group_size === "string" ? sp.group_size.trim() : "";
  const groupSizeNum = Number(groupSizeRaw);
  const effectiveGroupSize =
    Number.isFinite(groupSizeNum) && groupSizeNum >= 2 && groupSizeNum <= MAX_GROUP_SIZE
      ? groupSizeNum
      : 4;

  const catParam = typeof sp.cat === "string" ? sp.cat.trim() : "";

  const { data: tData, error: tErr } = await supabase
    .from("tournaments")
    .select("id,name,settings,created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    throw new Error("Error leyendo torneos: " + tErr.message);
  }

  const tournaments: (Tournament & { settings: TournamentSettings | null })[] =
    (tData ?? []) as any[];
  const effectiveTournamentId = tournamentId || tournaments[0]?.id || "";
  const activeTournament = tournaments.find(
    (t) => t.id === effectiveTournamentId
  );
  let isMatchPlay = false;
  try {
    isMatchPlay = isMatchPlayFormat(activeTournament?.settings ?? null);
  } catch (err) {
    console.error("[tee-sheet] isMatchPlayFormat:", err);
  }

  const { data: rData, error: rErr } = effectiveTournamentId
    ? await supabase
        .from("rounds")
        .select(`
          id,
          tournament_id,
          category_id,
          round_no,
          round_date,
          start_type,
          start_time,
          interval_minutes,
          notes,
          wave,
          categories:categories (
            code,
            name
          )
        `)
        .eq("tournament_id", effectiveTournamentId)
        .order("round_no", { ascending: true })
    : { data: [], error: null };

  if (rErr) {
    throw new Error("Error leyendo rounds: " + rErr.message);
  }

  const rounds: Round[] = (rData ?? []) as any[];
  const sessionBlocks = buildSessionBlocks(rounds);
  const defaultRoundId = sessionBlocks[0]?.[0]?.id ?? rounds[0]?.id ?? "";

  const roundIdKnown = Boolean(roundId && rounds.some((r) => r.id === roundId));
  const effectiveRoundId = roundIdKnown
    ? representativeRoundId(rounds, roundId)
    : defaultRoundId;

  if (
    roundId &&
    roundIdKnown &&
    representativeRoundId(rounds, roundId) !== roundId
  ) {
    const qs = new URLSearchParams({
      tournament_id: effectiveTournamentId,
      round_id: representativeRoundId(rounds, roundId),
      group_size: String(effectiveGroupSize),
    });
    if (catParam && catParam !== "ALL") {
      qs.set("cat", catParam);
    }
    redirect(`/tee-sheet?${qs.toString()}`);
  }

  if (roundId && !roundIdKnown && defaultRoundId) {
    const qs = new URLSearchParams({
      tournament_id: effectiveTournamentId,
      round_id: defaultRoundId,
      group_size: String(effectiveGroupSize),
    });
    if (catParam && catParam !== "ALL") {
      qs.set("cat", catParam);
    }
    redirect(`/tee-sheet?${qs.toString()}`);
  }

  if ((!tournamentId && effectiveTournamentId) || (!roundId && effectiveRoundId)) {
    const qs = new URLSearchParams({
      tournament_id: effectiveTournamentId,
      round_id: effectiveRoundId,
      group_size: String(effectiveGroupSize),
    });

    if (catParam && catParam !== "ALL") {
      qs.set("cat", catParam);
    }

    redirect(`/tee-sheet?${qs.toString()}`);
  }

  const selectedRound = rounds.find((r) => r.id === effectiveRoundId) ?? null;
  const blockRounds = effectiveRoundId ? roundsInSameSession(rounds, effectiveRoundId) : [];
  const blockRoundIds = blockRounds.map((r) => r.id);
  const targetRoundNo = Number(selectedRound?.round_no ?? 1);
  const sessionRoundDate =
    selectedRound?.round_date ?? blockRounds[0]?.round_date ?? null;

  let teeSheetOrderMap = new Map<
    string,
    import("@/lib/tee-sheet/leaderboardOrderForPairing").TeeSheetEntryOrderInfo
  >();
  let standingDisplayByEntryId = new Map<string, string>();
  if (targetRoundNo > 1 && effectiveTournamentId) {
    try {
      const admin = createAdminClient();
      const pairingOrder = await buildTeeSheetEntryOrderMap(
        admin,
        effectiveTournamentId,
        targetRoundNo
      );
      teeSheetOrderMap = pairingOrder.orderMap;
      for (const [entryId, info] of teeSheetOrderMap) {
        if (info.standingDisplay) {
          standingDisplayByEntryId.set(entryId, info.standingDisplay);
        }
      }
    } catch (err) {
      console.error("[tee-sheet] standing scores for pairing:", err);
    }
  }

  const { data: gData, error: gErr } =
    effectiveRoundId && blockRoundIds.length > 0
      ? await supabase
          .from("pairing_groups")
          .select("id,round_id,group_no,tee_time,starting_hole,notes")
          .in("round_id", blockRoundIds)
          .order("round_id", { ascending: true })
          .order("group_no", { ascending: true })
      : { data: [], error: null };

  if (gErr) {
    throw new Error("Error leyendo grupos: " + gErr.message);
  }

  const groups: GroupRow[] = (gData ?? []) as any[];

  const { data: mData, error: mErr } =
    effectiveRoundId && groups.length > 0
      ? await supabase
          .from("pairing_group_members")
          .select(`
            id,
            group_id,
            position,
            entry_id,
            tournament_entries (
              handicap_index,
              category_id,
              players (
                first_name,
                last_name,
                gender,
                birth_year,
                club_id,
                clubs:clubs (
                  name,
                  short_name,
                  logo_url,
                  generated_logo_url,
                  primary_color
                )
              )
            )
          `)
          .in(
            "group_id",
            groups.map((g) => g.id)
          )
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (mErr) {
    throw new Error("Error leyendo miembros de grupos: " + mErr.message);
  }

  const membersRaw = (mData ?? []) as any[];

  // Reglas + sets de salidas para colorear cada jugador por su tee asignado.
  // Defensivo: si las queries fallan (tablas vacías, columnas extra, etc.)
  // seguimos renderizando la página sin los dots.
  let teeSetsRes: { data: any[] | null; error: any } = { data: [], error: null };
  let teeRulesRes: { data: any[] | null; error: any } = { data: [], error: null };

  if (effectiveTournamentId) {
    try {
      [teeSetsRes, teeRulesRes] = await Promise.all([
        supabase
          .from("tee_sets")
          .select("id, name, code, color")
          .eq("tournament_id", effectiveTournamentId),
        supabase
          .from("category_tee_rules")
          .select(
            "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
          )
          .eq("tournament_id", effectiveTournamentId)
          .order("priority", { ascending: true }),
      ]);
    } catch (err) {
      console.error("[tee-sheet] tee_sets/category_tee_rules:", err);
    }
  }

  const teeSets = (teeSetsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    code: string | null;
    color: string | null;
  }>;
  const teeRules = (teeRulesRes.data ?? []) as Array<{
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
  const teeSetById = new Map(teeSets.map((t) => [t.id, t]));

  function resolveTeeForPlayer(p: {
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
    const candidates = teeRules
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
      const tee = teeSetById.get(r.tee_set_id);
      if (tee) return { color: tee.color ?? null, name: tee.name ?? null };
    }
    return { color: null, name: null };
  }

  const membersByGroup = new Map<string, MemberUI[]>();
for (const row of membersRaw) {
  const gid = row.group_id as string;

  const te = Array.isArray(row.tournament_entries)
    ? row.tournament_entries[0] ?? null
    : row.tournament_entries ?? null;

  const player = Array.isArray(te?.players)
    ? te.players[0] ?? null
    : te?.players ?? null;

  const club = Array.isArray(player?.clubs)
    ? player.clubs[0] ?? null
    : player?.clubs ?? null;

  const playerClubId =
    typeof player?.club_id === "string" && player.club_id.trim()
      ? player.club_id.trim()
      : null;

  const teeInfo = resolveTeeForPlayer({
    gender: player?.gender ?? null,
    handicap_index: te?.handicap_index ?? null,
    category_id: te?.category_id ?? null,
    birth_year: player?.birth_year ?? null,
  });

  const item: MemberUI = {
    entry_id: row.entry_id,
    group_id: gid,
    position: Number(row.position ?? 0),
    first_name: player?.first_name ?? null,
    last_name: player?.last_name ?? null,
    handicap_index: te?.handicap_index ?? null,
    standing_display: standingDisplayByEntryId.get(row.entry_id as string) ?? null,
    club_id: playerClubId,
    club_name: club?.name ?? null,
    club_short_name: club?.short_name ?? null,
    club_logo_url: playerClubId
      ? `/api/club-logo?club_id=${encodeURIComponent(playerClubId)}`
      : null,
    club_generated_logo_url: null,
    club_primary_color: club?.primary_color ?? null,
    tee_color: teeInfo.color,
    tee_name: teeInfo.name,
  };

  if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
  membersByGroup.get(gid)!.push(item);
}

  const roundOrder = new Map(blockRounds.map((r, i) => [r.id, i]));
  const sortedGroups = [...groups].sort((a, b) => {
    const oa = roundOrder.get(a.round_id) ?? 999;
    const ob = roundOrder.get(b.round_id) ?? 999;
    if (oa !== ob) return oa - ob;
    return a.group_no - b.group_no;
  });

  const labelByGroupId = buildPairingGroupLabelsBySession(sortedGroups, rounds);

  const groupsForUI: GroupUI[] = sortedGroups.map((g) => {
    const starting_label = formatStartingHoleLabel(
      labelByGroupId.get(g.id) ?? null,
      g.starting_hole
    );

    return {
      ...g,
      starting_label,
      session_round_date: sessionRoundDate,
      members: membersByGroup.get(g.id) ?? [],
    };
  });

  const categoriesSet = new Set<string>();
  for (const g of groupsForUI) {
    categoriesSet.add(catKey(g.notes));
  }
  const categories = Array.from(categoriesSet).sort(catSort);

  const effectiveCat =
    catParam && (catParam === "ALL" || categories.includes(catParam))
      ? catParam
      : "ALL";

  const visibleGroups =
    effectiveCat === "ALL"
      ? groupsForUI
      : groupsForUI.filter((g) => catKey(g.notes) === effectiveCat);

  const visiblePlayers = visibleGroups.reduce(
    (acc, g) => acc + (g.members?.length ?? 0),
    0
  );

  const tournamentLabel = (t: Tournament) =>
    (t.name ?? "").trim() || `Torneo ${t.id.slice(0, 8)}`;

  const startingOrderConfirmed = blockRounds.some((r) =>
    isStartingOrderConfirmed(r.notes)
  );

  const blockCategoryIds = Array.from(
    new Set(
      blockRounds
        .map((r) => (typeof r.category_id === "string" ? r.category_id.trim() : ""))
        .filter(Boolean)
    )
  );

  const { data: planCategoriesData, error: planCategoriesErr } =
    effectiveTournamentId
      ? await supabase
          .from("categories")
          .select("id, code, name, sort_order, handicap_min, category_group")
          .eq("tournament_id", effectiveTournamentId)
          .order("sort_order", { ascending: true })
          .order("handicap_min", { ascending: true })
      : { data: [], error: null };

  if (planCategoriesErr) {
    throw new Error("Error leyendo categorías para planeación: " + planCategoriesErr.message);
  }

  const allPlanCategories = (planCategoriesData ?? []) as Array<{
    id: string;
    code: string | null;
    name: string | null;
    sort_order: number | null;
    handicap_min: number | null;
    category_group: string | null;
  }>;

  const planCategories =
    blockCategoryIds.length > 0
      ? allPlanCategories.filter((c) => blockCategoryIds.includes(c.id))
      : allPlanCategories;

  let planEntriesQuery = effectiveTournamentId
    ? supabase
        .from("tournament_entries")
        .select("id, category_id, status")
        .eq("tournament_id", effectiveTournamentId)
        .in("status", ["active", "confirmed"])
    : null;

  if (planEntriesQuery && blockCategoryIds.length > 0) {
    planEntriesQuery = planEntriesQuery.in("category_id", blockCategoryIds);
  }

  const { data: planEntriesData, error: planEntriesErr } = planEntriesQuery
    ? await planEntriesQuery
    : { data: [], error: null };

  if (planEntriesErr) {
    throw new Error("Error leyendo inscritos para planeación: " + planEntriesErr.message);
  }

  const planEntryRows = (planEntriesData ?? []) as Array<{
    id: string;
    category_id: string | null;
    status: string | null;
  }>;

  const entryCountByCategory = new Map<string, number>();
  let noCategoryCount = 0;

  for (const row of planEntryRows) {
    const catId = typeof row.category_id === "string" ? row.category_id : "";
    if (!catId) {
      noCategoryCount += 1;
      continue;
    }

    entryCountByCategory.set(catId, (entryCountByCategory.get(catId) ?? 0) + 1);
  }

  const startHoleSequence = [1, 10, 2, 11, 3, 12, 4, 13, 5, 14, 6, 15, 7, 16, 8, 17, 9, 18];

  const planRows = planCategories
    .map((c, idx) => {
      const players = entryCountByCategory.get(c.id) ?? 0;
      const groups4 = Math.ceil(players / 4);
      const groups5 = Math.ceil(players / 5);
      const label = [c.code, c.name].filter(Boolean).join(" — ") || "SIN CATEGORÍA";

      return {
        id: c.id,
        label,
        sortOrder: c.sort_order,
        players,
        groups4,
        groups5,
        suggestedStartHole: startHoleSequence[idx % startHoleSequence.length],
      };
    })
    .filter((row) => row.players > 0 || blockCategoryIds.includes(row.id));

  if (noCategoryCount > 0) {
    planRows.push({
      id: "NO_CAT",
      label: "SIN CATEGORÍA",
      sortOrder: null,
      players: noCategoryCount,
      groups4: Math.ceil(noCategoryCount / 4),
      groups5: Math.ceil(noCategoryCount / 5),
      suggestedStartHole: startHoleSequence[planRows.length % startHoleSequence.length],
    });
  }

  const planTotalPlayers = planRows.reduce((acc, row) => acc + row.players, 0);
  const planTotalGroups4 = planRows.reduce((acc, row) => acc + row.groups4, 0);
  const planTotalGroups5 = planRows.reduce((acc, row) => acc + row.groups5, 0);
  const shotgunSimpleCapacity = 18;
  const shotgunDoubleCapacity = 36;
  const shotgunExtendedCapacity = 44;

  let cutEnforcesForPairing = false;
  if (targetRoundNo > 1 && effectiveTournamentId) {
    const admin = createAdminClient();
    await repairCutRulesTargetFinalRound(admin, effectiveTournamentId);
    const { data: advancementRows } = await admin
      .from("round_advancement_rules")
      .select("from_round_no, to_round_no, is_active")
      .eq("tournament_id", effectiveTournamentId)
      .eq("is_active", true);
    cutEnforcesForPairing = cutEnforcesAtTargetRound(
      (advancementRows ?? []) as RoundAdvancementRule[],
      targetRoundNo
    );
  }

  const isShotgunBlock =
    String(selectedRound?.start_type ?? "").toLowerCase() === "shotgun";
  const showShotgunNoDoubleTees =
    isShotgunBlock && planTotalGroups4 > 0 && planTotalGroups4 <= shotgunSimpleCapacity;

  const planRecommendation = (() => {
    if (!selectedRound) return "Selecciona una ronda/bloque para analizar.";
    if (planTotalPlayers === 0) return "No hay jugadores activos/confirmados para este bloque.";
    if (String(selectedRound.start_type ?? "").toLowerCase() !== "shotgun") {
      return planTotalGroups4 <= shotgunSimpleCapacity
        ? "Tee times: grupos de 4 funcionan bien para esta cantidad."
        : "Tee times: revisa el intervalo y la ventana disponible de salidas.";
    }
    if (planTotalGroups4 <= shotgunSimpleCapacity) return "Cabe con grupos de 4 y salida sencilla.";
    if (planTotalGroups5 <= shotgunSimpleCapacity) return "Conviene usar grupos de 5; cabe con salida sencilla.";
    if (planTotalGroups4 <= shotgunDoubleCapacity) return "Cabe con grupos de 4 usando doble salida por hoyo.";
    if (planTotalGroups5 <= shotgunDoubleCapacity) return "Recomendado: grupos de 5 usando doble salida por hoyo.";
    if (planTotalGroups5 <= shotgunExtendedCapacity) return "Recomendado: grupos de 5 + doble salida principal 1/10 + pares 5 secundarios.";
    return "No cabe en este bloque. Divide categorías en otra sesión o reduce jugadores del bloque.";
  })();

  let teeSheetRoundGateMessage = "";
  let teeSheetGenerateBlocked = false;
  let teeSheetRegistrationMessage = "";

  if (effectiveTournamentId) {
    const regStatus = await fetchTournamentRegistrationStatus(
      supabase,
      effectiveTournamentId
    );
    if (!isRegistrationClosed(regStatus)) {
      teeSheetGenerateBlocked = true;
      teeSheetRegistrationMessage = ts.registrationOpenGate;
    }
  }

  // Match play: preview de matches del cuadro para el día seleccionado.
  // No depende de matchplay_brackets en BD; deriva R1 desde seeds (auction_order)
  // igual que la página pública. Para R2+ sí consulta matchplay_matches.
  let matchplayRealMatchesCount = 0;
  let matchplayByeCount = 0;
  let matchplayPendingCount = 0;
  let matchplayActiveTeams = 0;
  let matchplayAuctionedTeams = 0;
  let matchplayTargetSize = 0;
  let matchplaySource: "derived_r1" | "bracket" | "none" = "none";
  if (isMatchPlay && effectiveTournamentId) {
    try {
      if (targetRoundNo === 1) {
        const { data: rulesRow } = await supabase
          .from("tournament_matchplay_rules")
          .select("bracket_main_pairs, max_pairs_per_category")
          .eq("tournament_id", effectiveTournamentId)
          .maybeSingle();

        const { data: teamsRows } = await supabase
          .from("matchplay_pair_teams")
          .select("id, auction_order, player_a_entry_id, player_b_entry_id")
          .eq("tournament_id", effectiveTournamentId)
          .eq("is_active", true);

        const activeTeams = (teamsRows ?? []) as Array<{
          id: string;
          auction_order: number | null;
          player_a_entry_id: string | null;
          player_b_entry_id: string | null;
        }>;
        matchplayActiveTeams = activeTeams.length;
        const auctioned = activeTeams.filter((t) => t.auction_order != null);
        matchplayAuctionedTeams = auctioned.length;

        const bracketMainPairs =
          rulesRow?.bracket_main_pairs ??
          rulesRow?.max_pairs_per_category ??
          null;
        function nextPow2(n: number) {
          let p = 2;
          while (p < n) p *= 2;
          return p;
        }
        const targetSize =
          bracketMainPairs && bracketMainPairs >= 2
            ? nextPow2(Number(bracketMainPairs))
            : nextPow2(Math.max(activeTeams.length, 2));
        matchplayTargetSize = targetSize;

        function bracketSeedOrder(size: number): number[] {
          if (size === 2) return [1, 2];
          const half = size / 2;
          const prev = bracketSeedOrder(half);
          const out: number[] = [];
          for (const s of prev) {
            out.push(s);
            out.push(size + 1 - s);
          }
          return out;
        }
        const seedOrder = bracketSeedOrder(targetSize);
        const sortedAuctioned = [...auctioned].sort(
          (a, b) => Number(a.auction_order) - Number(b.auction_order)
        );
        const teamBySeed = new Map<number, (typeof activeTeams)[number]>();
        sortedAuctioned.forEach((t, i) => teamBySeed.set(i + 1, t));

        const totalInscribed = activeTeams.length;
        const r1Count = targetSize / 2;
        let real = 0;
        let bye = 0;
        let pending = 0;
        for (let p = 0; p < r1Count; p++) {
          const tSeed = seedOrder[p * 2] ?? null;
          const bSeed = seedOrder[p * 2 + 1] ?? null;
          const topVacant = tSeed != null && tSeed > totalInscribed;
          const bottomVacant = bSeed != null && bSeed > totalInscribed;
          const topAssigned =
            !topVacant && tSeed != null && teamBySeed.has(tSeed);
          const bottomAssigned =
            !bottomVacant && bSeed != null && teamBySeed.has(bSeed);
          if (topAssigned && bottomAssigned) real += 1;
          else if (topVacant || bottomVacant) bye += 1;
          else pending += 1;
        }
        matchplayRealMatchesCount = real;
        matchplayByeCount = bye;
        matchplayPendingCount = pending;
        matchplaySource = "derived_r1";
      } else {
        // R2+: usar bracket en BD
        const { data: bracketRow } = await supabase
          .from("matchplay_brackets")
          .select("id")
          .eq("tournament_id", effectiveTournamentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bracketRow?.id) {
          const { data: mpMatches } = await supabase
            .from("matchplay_matches")
            .select("id, top_pair_id, bottom_pair_id")
            .eq("bracket_id", bracketRow.id)
            .eq("round_no", targetRoundNo);

          const total = (mpMatches ?? []).length;
          matchplayRealMatchesCount = (mpMatches ?? []).filter(
            (m: any) => m.top_pair_id && m.bottom_pair_id
          ).length;
          matchplayByeCount = total - matchplayRealMatchesCount;
          matchplaySource = "bracket";
        }
      }
    } catch (err) {
      console.error("[tee-sheet] matchplay preview:", err);
    }
  }

  if (selectedRound && selectedRound.round_no > 1 && effectiveTournamentId) {
    const categoryIdsToCheck =
      blockCategoryIds.length > 0
        ? blockCategoryIds
        : planRows.map((row) => row.id).filter((id) => id !== "NO_CAT");

    if (categoryIdsToCheck.length > 0) {
      const gateCtx = await loadCategoryRoundGateContext(
        supabase,
        effectiveTournamentId
      );
      const { data: tournamentRow } = await supabase
        .from("tournaments")
        .select("settings")
        .eq("id", effectiveTournamentId)
        .maybeSingle();
      const blockedIds = listCategoriesBlockedForRound(
        gateCtx.entries,
        gateCtx.rounds,
        selectedRound.round_no,
        categoryIdsToCheck,
        gateCtx.lookups,
        tournamentRow?.settings ?? null
      );

      if (blockedIds.length > 0) {
        teeSheetGenerateBlocked = true;
        const blockedLabels = blockedIds
          .map((id) => {
            const c = allPlanCategories.find((x) => x.id === id);
            return [c?.code, c?.name].filter(Boolean).join(" — ") || id;
          })
          .join(", ");

        teeSheetRoundGateMessage = fmt(ts.priorRoundGate, {
          round: selectedRound.round_no,
          prior: selectedRound.round_no - 1,
          categories: blockedLabels,
        });
      }
    }
  }

  if (!effectiveTournamentId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between text-white">
          <h1 className="text-3xl font-bold tracking-tight">{teeTitle}</h1>
        </div>

        <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm">
          <div className="text-red-600">No hay torneos. Crea uno primero.</div>
        </section>
      </div>
    );
  }

  if (!effectiveRoundId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between text-white">
          <h1 className="text-3xl font-bold tracking-tight">{teeTitle}</h1>
        </div>

        <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm space-y-3">
          <form method="GET" action="/tee-sheet" className="flex flex-wrap gap-3 items-center">
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {tournamentLabel(t)}
                </option>
              ))}
            </select>

            <button className="rounded bg-black text-white px-4 py-2 font-medium hover:bg-slate-900">
              Cambiar
            </button>
          </form>

          <div className="text-red-600">
            No hay rounds para este torneo. Crea una ronda primero.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-white">
        <h1 className="text-3xl font-bold tracking-tight">{teeTitle}</h1>
        <div className="rounded-md bg-black/20 px-3 py-1 text-sm font-medium">
          Grupos: {visibleGroups.length} · Jugadores: {visiblePlayers}
        </div>
      </div>

      <section className="border border-slate-300 rounded-lg bg-white p-4 text-slate-950 shadow-sm space-y-3">
        <form method="GET" action="/tee-sheet" className="flex flex-wrap gap-3 items-end">
          <div className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1 sm:max-w-md">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Torneo
            </span>
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className="w-full border border-slate-600 rounded bg-white px-3 py-2 text-slate-950"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {tournamentLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-1 sm:max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Día / turno
            </span>
            <select
              name="round_id"
              defaultValue={effectiveRoundId}
              className="min-w-[12rem] max-w-[min(100vw-2rem,22rem)] border border-slate-600 rounded bg-white px-3 py-2 text-slate-950 sm:min-w-[14rem]"
            >
              {sessionBlocks.map((block) => {
                const rep = block[0];
                if (!rep) return null;
                return (
                  <option key={rep.id} value={rep.id}>
                    {formatSessionOptionLabel(rep)}
                  </option>
                );
              })}
            </select>
          </div>

          <select
            name="group_size"
            defaultValue={String(effectiveGroupSize)}
            className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            name="cat"
            defaultValue={effectiveCat}
            className="border border-slate-600 px-3 py-2 rounded bg-white text-slate-950"
          >
            <option value="ALL">Todas categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button className="rounded bg-black text-white px-4 py-2 font-medium hover:bg-slate-900">
            Cambiar
          </button>
        </form>

        <div className="text-sm text-slate-800">
          Mostrando:{" "}
          <span className="font-semibold">
            {effectiveCat === "ALL" ? "Todas" : effectiveCat}
          </span>{" "}
          · Grupos: <span className="font-semibold">{visibleGroups.length}</span> ·
          Jugadores: <span className="font-semibold">{visiblePlayers}</span>
        </div>
      </section>

      {isMatchPlay ? (
        <section className="border-2 border-amber-400 rounded-lg bg-amber-50 p-4 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-amber-950">
                Match Play · Grupos automáticos por bracket
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                Cada match del cuadro de la ronda <strong>R{targetRoundNo}</strong>
                {" = 1 foursome (pareja A vs pareja B). "}
                Las parejas con <strong>BYE no juegan</strong>: solo se generan
                salidas para los matches reales (con las dos parejas
                asignadas).
              </p>
            </div>

            <div className="rounded border border-amber-300 bg-white px-3 py-2 text-xs text-amber-950 shadow-sm">
              <div>
                Fuente:{" "}
                <strong>
                  {matchplaySource === "derived_r1"
                    ? "Cuadro derivado de subasta (R1)"
                    : matchplaySource === "bracket"
                      ? "Bracket publicado"
                      : "—"}
                </strong>
              </div>
              {targetRoundNo === 1 ? (
                <>
                  <div>
                    Parejas activas: <strong>{matchplayActiveTeams}</strong> ·
                    adjudicadas: <strong>{matchplayAuctionedTeams}</strong>
                  </div>
                  <div>
                    Tamaño del cuadro: <strong>{matchplayTargetSize}</strong>
                  </div>
                </>
              ) : null}
              <div>
                Foursomes a crear:{" "}
                <strong className="text-emerald-700">
                  {matchplayRealMatchesCount}
                </strong>
              </div>
              <div>
                BYEs (no juegan): <strong>{matchplayByeCount}</strong>
              </div>
              {targetRoundNo === 1 && matchplayPendingCount > 0 ? (
                <div>
                  Pendientes de subasta:{" "}
                  <strong className="text-amber-700">
                    {matchplayPendingCount}
                  </strong>
                </div>
              ) : null}
            </div>
          </header>

          {matchplayRealMatchesCount === 0 ? (
            <div className="mt-3 rounded border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-950">
              No hay foursomes para R{targetRoundNo} todavía
              {targetRoundNo === 1 ? (
                <>
                  : faltan parejas por adjudicar en la subasta (
                  <strong>{matchplayPendingCount}</strong> pendientes). Termina
                  la subasta y vuelve aquí.
                </>
              ) : (
                <>: asegúrate que el bracket esté publicado y avanzados los ganadores.</>
              )}
            </div>
          ) : null}

          <form action={generateMatchPlayTeeSheet} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
            <input type="hidden" name="round_id" value={effectiveRoundId} />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                Intervalo entre salidas (min)
              </span>
              <input
                type="number"
                name="interval_minutes"
                min={5}
                max={20}
                defaultValue={
                  selectedRound?.interval_minutes != null
                    ? String(selectedRound.interval_minutes)
                    : "10"
                }
                className="w-24 rounded border border-amber-400 bg-white px-2 py-1 text-amber-950"
                disabled={startingOrderConfirmed}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                Hora 1er match
              </span>
              <input
                type="time"
                name="start_time"
                defaultValue={
                  typeof selectedRound?.start_time === "string"
                    ? selectedRound.start_time.slice(0, 5)
                    : "07:00"
                }
                className="rounded border border-amber-400 bg-white px-2 py-1 text-amber-950"
                disabled={startingOrderConfirmed}
              />
            </div>

            <button
              type="submit"
              className="rounded bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                startingOrderConfirmed ||
                teeSheetGenerateBlocked ||
                matchplayRealMatchesCount === 0
              }
            >
              Generar foursomes desde bracket R{targetRoundNo}
            </button>
          </form>

          {startingOrderConfirmed ? (
            <p className="mt-2 text-xs text-amber-900">
              Orden confirmado · reabre para regenerar.
            </p>
          ) : null}
        </section>
      ) : null}

      <form action={generateGroupsByCategory} className="border border-slate-300 rounded-lg bg-white p-4 shadow-sm">
        <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
        <input type="hidden" name="round_id" value={effectiveRoundId} />
        <input type="hidden" name="group_size" value={effectiveGroupSize} />
        <input type="hidden" name="cat" value={effectiveCat} />

        {startingOrderConfirmed ? (
          <div className="mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
            Orden definitivo confirmado. Para cambiar categorías, grupos o salidas, primero reabre el orden.
          </div>
        ) : null}

        {teeSheetRegistrationMessage ? (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
            {teeSheetRegistrationMessage}
          </div>
        ) : null}

        {teeSheetRoundGateMessage ? (
          <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p>{teeSheetRoundGateMessage}</p>
            <p className="mt-1 text-xs text-amber-900">{ts.priorRoundGateAction}</p>
          </div>
        ) : null}

        {targetRoundNo > 1 ? (
          <div
            className={`mb-3 rounded border px-3 py-2 text-sm ${
              cutEnforcesForPairing
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-sky-300 bg-sky-50 text-sky-950"
            }`}
          >
            <p>
              {cutEnforcesForPairing
                ? fmt(ts.cutEnforcesForRound, { round: targetRoundNo })
                : fmt(ts.cutDoesNotEnforceForRound, { round: targetRoundNo })}
            </p>
            <p className="mt-1 text-xs opacity-90">
              {fmt(ts.standingsOrderHint, { round: targetRoundNo })}
            </p>
          </div>
        ) : null}

        {showShotgunNoDoubleTees ? (
          <div className="mb-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {fmt(ts.shotgunNoDoubleTees, { groups: planTotalGroups4 })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Planeación editable del bloque</h2>
            <div className="mt-1 text-sm text-slate-700">
              Revisa la sugerencia, cambia el orden de categorías y el tamaño de grupo antes de generar. El orden se puede guardar. En shotgun, las dobles priorizan H1/H10, después pares 5, después pares 4, y los pares 3 solo se usan cuando el bloque llega cerca del máximo de 36 grupos.
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Jugadores: <span className="font-semibold">{planTotalPlayers}</span> · G4:{" "}
            <span className="font-semibold">{planTotalGroups4}</span> · G5:{" "}
            <span className="font-semibold">{planTotalGroups5}</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_300px]">
          <div
            className="rounded border border-slate-200"
            style={backofficeTableStickyScroll}
          >
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead
                className={`text-left text-xs uppercase tracking-wide text-slate-600 ${twStickyTheadSlate50}`}
              >
                <tr>
                  <th className="px-3 py-2">Orden</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2 text-right">Jugadores</th>
                  <th className="px-3 py-2 text-right">G4</th>
                  <th className="px-3 py-2 text-right">G5</th>
                  <th className="px-3 py-2">Salida automática</th>
                  <th className="px-3 py-2">Grupo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {planRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={7}>
                      No hay jugadores activos/confirmados para analizar en este bloque.
                    </td>
                  </tr>
                ) : (
                  planRows.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <input type="hidden" name="plan_category_id" value={row.id} />
                        <input
                          name="plan_order"
                          type="number"
                          min={1}
                          defaultValue={row.sortOrder ?? idx + 1}
                          className="h-8 w-16 rounded border border-slate-300 bg-white px-2 text-right text-slate-950"
                          disabled={startingOrderConfirmed}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-950">{row.label}</td>
                      <td className="px-3 py-2 text-right">{row.players}</td>
                      <td className="px-3 py-2 text-right">{row.groups4}</td>
                      <td className="px-3 py-2 text-right">{row.groups5}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">
                        <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                          Orden impar: carril H1 · orden par: carril H10
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          name="plan_group_size"
                          defaultValue={row.groups5 <= shotgunDoubleCapacity ? "5" : String(effectiveGroupSize)}
                          className="h-8 rounded border border-slate-300 bg-white px-2 text-slate-950"
                          disabled={startingOrderConfirmed}
                        >
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
                {planRows.length > 0 ? (
                  <tr className="bg-slate-50 font-semibold text-slate-950">
                    <td className="px-3 py-2" colSpan={2}>Total bloque</td>
                    <td className="px-3 py-2 text-right">{planTotalPlayers}</td>
                    <td className="px-3 py-2 text-right">{planTotalGroups4}</td>
                    <td className="px-3 py-2 text-right">{planTotalGroups5}</td>
                    <td className="px-3 py-2" colSpan={2}>—</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <div className="font-semibold text-slate-950">Capacidad</div>
            <div className="flex justify-between gap-2">
              <span>Shotgun simple</span>
              <span className="font-semibold">{shotgunSimpleCapacity} grupos</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Shotgun doble</span>
              <span className="font-semibold">{shotgunDoubleCapacity} grupos</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Extendido pares 5</span>
              <span className="font-semibold">{shotgunExtendedCapacity} grupos</span>
            </div>
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
              {planRecommendation}
            </div>
            <div className="text-xs text-slate-600">
              Regla de salidas: se define primero el total de grupos del bloque. Las dobles empiezan por H1/H10, luego pares 5, luego pares 4. Los pares 3 quedan al final y solo entran si se necesitan para llegar hasta 36 grupos.
            </div>
            <div className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
              Regla aplicada: categorías juntas, sin reiniciar hoyos por categoría, distribución automática 4/5, nunca grupos de 1 o 2. Después puedes ajustar manualmente con Drag & Drop.
            </div>
            {selectedRound && selectedRound.round_no > 1 ? (
              <div className="rounded border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
                {ts.standingsOrderHint}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              planRows.length === 0 ||
              startingOrderConfirmed ||
              teeSheetGenerateBlocked
            }
          >
            Generar grupos con este orden
          </button>

          <button
            type="submit"
            formAction={saveCategoryPlanOrder}
            className="rounded border border-slate-400 bg-white px-4 py-2 font-medium text-slate-950 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={planRows.length === 0 || startingOrderConfirmed}
          >
            Guardar orden de categorías
          </button>
        </div>
      </form>

      <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm flex flex-wrap gap-3">
        <form action={clearGroups}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button
            className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={startingOrderConfirmed}
          >
            Borrar grupos
          </button>
        </form>

        <form action={recalculateTeeTimes}>
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
          <input type="hidden" name="round_id" value={effectiveRoundId} />
          <input type="hidden" name="group_size" value={effectiveGroupSize} />
          <input type="hidden" name="cat" value={effectiveCat} />
          <button
            className="rounded bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={startingOrderConfirmed}
          >
            Recalcular Tee Times
          </button>
        </form>
      </section>

      <section className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-950">Orden definitivo del día</div>
            <div className="mt-1 text-sm text-slate-700">
              Confirma cuando ya revisaste grupos, categorías y hoyos de salida. Al confirmar se bloquean cambios accidentales.
            </div>
          </div>

          {startingOrderConfirmed ? (
            <form action={reopenStartingOrder}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="round_id" value={effectiveRoundId} />
              <input type="hidden" name="group_size" value={effectiveGroupSize} />
              <input type="hidden" name="cat" value={effectiveCat} />
              <button className="rounded border border-amber-500 bg-amber-50 px-4 py-2 font-medium text-amber-900 hover:bg-amber-100">
                Reabrir orden para editar
              </button>
            </form>
          ) : (
            <form action={confirmStartingOrder}>
              <input type="hidden" name="tournament_id" value={effectiveTournamentId} />
              <input type="hidden" name="round_id" value={effectiveRoundId} />
              <input type="hidden" name="group_size" value={effectiveGroupSize} />
              <input type="hidden" name="cat" value={effectiveCat} />
              <button
                className="rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={groupsForUI.length === 0}
              >
                Confirmar orden definitivo de salidas
              </button>
            </form>
          )}
        </div>
      </section>

      <TeeSheetDnD
        tournamentId={effectiveTournamentId}
        roundId={effectiveRoundId}
        targetGroupSize={effectiveGroupSize}
        maxGroupSize={MAX_GROUP_SIZE}
        groups={groupsForUI}
        initialCategory={effectiveCat}
        startingOrderConfirmed={startingOrderConfirmed}
        showPairingScore={targetRoundNo > 1}
        pairingScoreColumnLabel={
          targetRoundNo === 2
            ? ts.pairingScoreR1
            : targetRoundNo >= 3
              ? ts.pairingScoreR1R2
              : ts.pairingScoreHcp
        }
      />
    </div>
  );
}