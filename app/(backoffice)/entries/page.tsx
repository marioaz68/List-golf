import type { ReactNode } from "react";
import Link from "next/link";
import { fetchScorecardsForEntries } from "@/lib/entries/fetchScorecardsForEntries";
import { createClient } from "@/utils/supabase/server";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";
import HeaderBar from "@/components/ui/HeaderBar";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import SinglePlayerEntryPanel from "./SinglePlayerEntryPanel";
import BulkEntryPanel from "./BulkEntryPanel";
import EntriesListPanel from "./EntriesListPanel";
import EntriesSummaryPanel from "./EntriesSummaryPanel";
import EnrollExcelButton from "./EnrollExcelButton";
import { closeTournamentRegistration, reopenTournamentRegistration } from "./actions";
import {
  ENTRY_SELECT_WITH_KIT,
  ENTRY_SELECT_WITHOUT_KIT,
  isMissingTelegramKitColumnsError,
} from "@/lib/entries/telegramKitColumns";
import { getRoundForCategory } from "@/lib/rounds/categoryRoundGate";
import { queryInChunks } from "@/lib/supabase/queryInChunks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tournament = {
  id: string;
  name: string | null;
  status: string | null;
  registration_status: "open" | "closed" | string | null;
  registration_closed_at: string | null;
  settings?: TournamentSettings | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
  min_age: number | null;
};

type ClubRef = {
  name: string | null;
  short_name: string | null;
};

type PlayerBaseRaw = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  birth_year: number | null;
  clubs: ClubRef | ClubRef[] | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  birth_year: number | null;
  club_label: string | null;
};

type EntryPlayerRaw = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  handicap_torneo: number | null;
  phone: string | null;
  email: string | null;
  club: string | null;
  club_id: string | null;
  initials: string | null;
  ghin_number: string | null;
  shirt_size: string | null;
  shoe_size: string | null;
  birth_year: number | null;
  clubs: ClubRef | ClubRef[] | null;
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
};

type EntryCategoryRaw = {
  id: string;
  code: string | null;
  name: string | null;
  max_players?: number | null;
};

type RoundRow = {
  id: string;
  round_no: number | null;
  category_id?: string | null;
};

type ScorecardSignatureRaw = Record<string, unknown>;

type ScorecardRow = {
  id: string;
  entry_id: string | null;
  round_id: string | null;
  locked_at?: string | null;
  scorecard_signatures?: ScorecardSignatureRaw[] | null;
};

type RoundSignature = {
  round_no: number;
  player_signed: boolean;
  marker_signed: boolean;
  witness_signed: boolean;
  captured: boolean;
  closed: boolean;
};

type EntryRowBase = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  telegram_kit_sent_at?: string | null;
  telegram_kit_received_at?: string | null;
  players: EntryPlayerRaw | EntryPlayerRaw[] | null;
  categories: EntryCategoryRaw | EntryCategoryRaw[] | null;
};

type EntryRow = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  telegram_kit_sent_at?: string | null;
  telegram_kit_received_at?: string | null;
  round_signatures: RoundSignature[];
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    gender: "M" | "F" | "X" | null;
    handicap_index: number | null;
    handicap_torneo: number | null;
    phone: string | null;
    email: string | null;
    club: string | null;
    club_id: string | null;
    club_label: string | null;
    initials: string | null;
    ghin_number: string | null;
    shirt_size: string | null;
    shoe_size: string | null;
    birth_year: number | null;
    telegram_user_id?: string | null;
    telegram_chat_id?: string | null;
  } | null;
  categories: {
    id: string;
    code: string | null;
    name: string | null;
    max_players?: number | null;
  } | null;
};

type EntriesTab = "manual" | "bulk" | "entries" | "summary";
type BulkStatus = "success" | "warning" | "error" | null;

function normalizeClubLabel(value: string | null | undefined) {
  const v = value?.trim();
  return v ? v : null;
}

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function clubLabelFromClub(club: ClubRef | ClubRef[] | null | undefined) {
  const c = oneOrNull(club);
  return normalizeClubLabel(c?.short_name ?? c?.name ?? null);
}

function normalizeTab(value: string | string[] | undefined): EntriesTab {
  const tab = typeof value === "string" ? value : "";
  if (tab === "bulk") return "bulk";
  if (tab === "entries") return "entries";
  if (tab === "summary") return "summary";
  return "manual";
}

function tabHref(tournamentId: string, tab: EntriesTab) {
  const params = new URLSearchParams();
  if (tournamentId) params.set("tournament_id", tournamentId);
  params.set("tab", tab);
  return `/entries?${params.toString()}`;
}

function tabClasses(active: boolean) {
  return active
    ? "inline-flex min-h-7 items-center justify-center rounded border border-gray-800 bg-gray-800 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm"
    : "inline-flex min-h-7 items-center justify-center rounded border border-gray-300 bg-white px-2.5 text-[11px] font-medium leading-none text-gray-700 hover:bg-gray-50";
}

function normalizeBulkStatus(value: string | string[] | undefined): BulkStatus {
  const v = typeof value === "string" ? value : "";
  if (v === "success" || v === "warning" || v === "error") return v;
  return null;
}

function parseCount(value: string | string[] | undefined) {
  const v = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(v) ? v : null;
}

function feedbackClasses(status: BulkStatus) {
  if (status === "success") {
    return "rounded border border-green-300 bg-green-50 px-3 py-2 text-[12px] text-green-800 shadow-sm";
  }
  if (status === "warning") {
    return "rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 shadow-sm";
  }
  if (status === "error") {
    return "rounded border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 shadow-sm";
  }
  return "hidden";
}

function normalizeRole(value: unknown): "player" | "marker" | "witness" | null {
  if (typeof value !== "string") return null;

  const v = value.trim().toLowerCase();

  if (["player", "jugador", "player_signer"].includes(v)) return "player";
  if (["marker", "marcador", "marker_signer"].includes(v)) return "marker";
  if (["witness", "testigo", "witness_signer"].includes(v)) return "witness";

  return null;
}

function signatureRole(sig: ScorecardSignatureRaw): "player" | "marker" | "witness" | null {
  return (
    normalizeRole(sig.role) ??
    normalizeRole(sig.signer_role) ??
    normalizeRole(sig.signature_role) ??
    normalizeRole(sig.requested_role) ??
    null
  );
}

function signatureIsSigned(sig: ScorecardSignatureRaw): boolean {
  const directBooleanKeys = [
    "signed",
    "is_signed",
    "completed",
    "is_completed",
    "accepted",
    "approved",
    "is_approved",
  ] as const;

  for (const key of directBooleanKeys) {
    const value = sig[key];
    if (typeof value === "boolean") return value;
  }

  const dateLikeKeys = [
    "signed_at",
    "completed_at",
    "accepted_at",
    "approved_at",
    "created_at",
  ] as const;

  for (const key of dateLikeKeys) {
    const value = sig[key];
    if (typeof value === "string" && value.trim()) return true;
  }

  const statusKeys = ["status", "state"] as const;

  for (const key of statusKeys) {
    const value = sig[key];
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (["signed", "completed", "complete", "done", "approved", "accepted"].includes(v)) {
        return true;
      }
      if (["pending", "requested", "sent", "open"].includes(v)) {
        return false;
      }
    }
  }

  return true;
}

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

type RoundCaptureState = {
  captured: Set<string>;
  holeCountByEntryRound: Map<string, number>;
};

/** Captura en la ronda de la categoría del inscrito (conteo de hoyos por ronda lógica). */
function buildRoundCaptureState(
  entries: Array<{ id: string; player_id: string; category_id: string | null }>,
  rounds: RoundRow[],
  roundScores: Array<{
    id: string;
    player_id: string | null;
    round_id: string | null;
    gross_score: number | null;
  }>,
  holeScores: Array<{
    round_score_id: string;
    hole_number?: number | null;
    hole_no?: number | null;
  }>
): RoundCaptureState {
  const distinctHolesByRoundScore = new Map<string, Set<number>>();
  for (const row of holeScores) {
    const holeNo = holeNoFromRow(row);
    if (holeNo == null) continue;
    const set =
      distinctHolesByRoundScore.get(row.round_score_id) ?? new Set<number>();
    set.add(holeNo);
    distinctHolesByRoundScore.set(row.round_score_id, set);
  }

  const scoresByPlayerRound = new Map<
    string,
    { id: string; gross_score: number | null }
  >();
  for (const rs of roundScores) {
    const playerId = String(rs.player_id ?? "").trim();
    const roundId = String(rs.round_id ?? "").trim();
    if (!playerId || !roundId) continue;
    scoresByPlayerRound.set(`${playerId}_${roundId}`, {
      id: rs.id,
      gross_score: rs.gross_score,
    });
  }

  const captured = new Set<string>();
  const holeCountByEntryRound = new Map<string, number>();

  for (const entry of entries) {
    const playerId = String(entry.player_id ?? "").trim();
    if (!playerId) continue;

    for (const roundNo of [1, 2, 3]) {
      const round = getRoundForCategory(
        rounds.map((r) => ({
          id: r.id,
          round_no: Number(r.round_no ?? 0),
          category_id: r.category_id ?? null,
        })),
        roundNo,
        entry.category_id
      );
      if (!round?.id) continue;

      const rs = scoresByPlayerRound.get(`${playerId}_${round.id}`);
      if (!rs) continue;

      const holeCount = distinctHolesByRoundScore.get(rs.id)?.size ?? 0;
      holeCountByEntryRound.set(`${entry.id}_${roundNo}`, holeCount);

      const hasGross = rs.gross_score != null;
      if (holeCount > 0 || hasGross) {
        captured.add(`${entry.id}_${roundNo}`);
      }
    }
  }

  return { captured, holeCountByEntryRound };
}

function buildRoundSignatures(
  entryId: string,
  categoryId: string | null,
  rounds: RoundRow[],
  scorecards: ScorecardRow[],
  capture: RoundCaptureState
): RoundSignature[] {
  const gateRounds = rounds.map((r) => ({
    id: r.id,
    round_no: Number(r.round_no ?? 0),
    category_id: r.category_id ?? null,
  }));

  return [1, 2, 3].map((roundNo) => {
    const round = getRoundForCategory(gateRounds, roundNo, categoryId);
    const scorecard = round
      ? scorecards.find(
          (sc) =>
            sc.entry_id === entryId && String(sc.round_id) === String(round.id)
        )
      : null;

    const signatures = Array.isArray(scorecard?.scorecard_signatures)
      ? scorecard!.scorecard_signatures!
      : [];

    const signedRows = signatures.filter(signatureIsSigned);

    // Misma regla que leaderboard / cierre oficial: locked en la fila rounds de su categoría.
    const closed = Boolean(scorecard?.locked_at);
    const hasCapture = capture.captured.has(`${entryId}_${roundNo}`);

    return {
      round_no: roundNo,
      player_signed: signedRows.some((sig) => signatureRole(sig) === "player"),
      marker_signed: signedRows.some((sig) => signatureRole(sig) === "marker"),
      witness_signed: signedRows.some((sig) => signatureRole(sig) === "witness"),
      captured: hasCapture && !closed,
      closed,
    };
  });
}

function HeaderBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <HeaderBar title={title} actions={actions} />
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = await getLocale();
  const entriesTitle = messages[locale].entries.title;
  const ep = messages[locale].entries.page;
  const kitContentLabel = messages[locale].entries.telegramKitContent.title;
  const excelImport = messages[locale].entries.excel.import;
  const noName = messages[locale].sidebar.noName;
  const requestedTournamentId =
    typeof params.tournament_id === "string" ? params.tournament_id : "";
  const activeTab = normalizeTab(params.tab);

  const bulkStatus = normalizeBulkStatus(params.bulk_status);
  const bulkMessage =
    typeof params.bulk_message === "string" ? params.bulk_message.trim() : "";
  const bulkAdded = parseCount(params.bulk_added);
  const bulkSkipped = parseCount(params.bulk_skipped);
  const bulkSelected = parseCount(params.bulk_selected);

  const supabase = await createClient();
  let pageLoadError: string | null = null;

  const [tournamentsRes, playersRes, categoriesRes] = await Promise.all([
    supabase
      .from("tournaments")
      .select(
        "id, name, status, registration_status, registration_closed_at, settings"
      )
      .order("name"),
    supabase
      .from("players")
      .select(`
        id,
        first_name,
        last_name,
        gender,
        handicap_index,
        birth_year,
        clubs:clubs (
          name,
          short_name
        )
      `)
      .order("last_name")
      .order("first_name"),
    supabase
      .from("categories")
      .select("id, code, name, tournament_id, gender, handicap_min, handicap_max, min_age")
      .order("sort_order", { ascending: true }),
  ]);

  if (tournamentsRes.error) {
    pageLoadError = `Error leyendo tournaments: ${tournamentsRes.error.message}`;
  } else if (playersRes.error) {
    pageLoadError = `Error leyendo players: ${playersRes.error.message}`;
  } else if (categoriesRes.error) {
    pageLoadError = `Error leyendo categories: ${categoriesRes.error.message}`;
  }

  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const selectedTournamentId = requestedTournamentId || tournaments[0]?.id || "";
  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const registrationStatus = selectedTournament?.registration_status ?? "open";
  const registrationsClosed = registrationStatus === "closed";
  const tournamentIsMatchPlay = isMatchPlayFormat(
    (selectedTournament?.settings ?? {}) as TournamentSettings
  );

  let matchPlayPairsEnabled = false;
  const playersOnTeams = new Set<string>();
  const partnerByEntryId = new Map<
    string,
    { entry_id: string; player_id: string | null; full_name: string }
  >();

  if (tournamentIsMatchPlay && selectedTournamentId) {
    const { data: mpRules } = await supabase
      .from("tournament_matchplay_rules")
      .select("match_type")
      .eq("tournament_id", selectedTournamentId)
      .maybeSingle();
    matchPlayPairsEnabled = (mpRules?.match_type ?? "pairs") === "pairs";

    if (matchPlayPairsEnabled) {
      const { data: teamsRaw } = await supabase
        .from("matchplay_pair_teams")
        .select(
          "id, player_a_entry_id, player_b_entry_id, " +
            "entry_a:tournament_entries!matchplay_pair_teams_player_a_entry_id_fkey(id, player_id, players(first_name, last_name)), " +
            "entry_b:tournament_entries!matchplay_pair_teams_player_b_entry_id_fkey(id, player_id, players(first_name, last_name))"
        )
        .eq("tournament_id", selectedTournamentId)
        .eq("is_active", true);

      type EntryShape = {
        id?: string | null;
        player_id?: string | null;
        players?:
          | { first_name?: string | null; last_name?: string | null }
          | Array<{ first_name?: string | null; last_name?: string | null }>
          | null;
      } | null;

      function entryName(entry: EntryShape): string {
        const p = entry?.players;
        const obj = Array.isArray(p) ? p[0] : p;
        return `${obj?.last_name ?? ""} ${obj?.first_name ?? ""}`.trim() || "—";
      }

      type TeamRowShape = {
        entry_a?: EntryShape;
        entry_b?: EntryShape;
      };
      for (const row of (teamsRaw ?? []) as TeamRowShape[]) {
        const a = Array.isArray(row.entry_a)
          ? (row.entry_a[0] as EntryShape)
          : (row.entry_a as EntryShape);
        const b = Array.isArray(row.entry_b)
          ? (row.entry_b[0] as EntryShape)
          : (row.entry_b as EntryShape);
        if (a?.player_id) playersOnTeams.add(a.player_id);
        if (b?.player_id) playersOnTeams.add(b.player_id);
        if (a?.id && b) {
          partnerByEntryId.set(a.id, {
            entry_id: b?.id ?? "",
            player_id: b?.player_id ?? null,
            full_name: entryName(b),
          });
        }
        if (b?.id && a) {
          partnerByEntryId.set(b.id, {
            entry_id: a?.id ?? "",
            player_id: a?.player_id ?? null,
            full_name: entryName(a),
          });
        }
      }
    }
  }

  const categories = ((categoriesRes.data ?? []) as Array<
    Category & { tournament_id?: string | null }
  >)
    .filter((c) => !selectedTournamentId || c.tournament_id === selectedTournamentId)
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      gender: c.gender,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
      min_age: c.min_age,
    }));

  const players: (Player & { gender: "M" | "F" | "X" | null })[] = (
    (playersRes.data ?? []) as unknown as PlayerBaseRaw[]
  ).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    gender: p.gender,
    handicap_index: p.handicap_index,
    birth_year: p.birth_year,
    club_label: clubLabelFromClub(p.clubs),
  }));

  let entries: EntryRow[] = [];

  if (selectedTournamentId && !pageLoadError) {
    try {
    const entriesResKit = await supabase
      .from("tournament_entries")
      .select(ENTRY_SELECT_WITH_KIT)
      .eq("tournament_id", selectedTournamentId)
      .order("player_number", { ascending: true, nullsFirst: false });

    let entryRows: EntryRowBase[];

    if (
      entriesResKit.error &&
      isMissingTelegramKitColumnsError(entriesResKit.error)
    ) {
      const entriesResBase = await supabase
        .from("tournament_entries")
        .select(ENTRY_SELECT_WITHOUT_KIT)
        .eq("tournament_id", selectedTournamentId)
        .order("player_number", { ascending: true, nullsFirst: false });

      if (entriesResBase.error) {
        throw new Error(
          `Error leyendo tournament_entries: ${entriesResBase.error.message}`
        );
      }

      entryRows = (entriesResBase.data ?? []) as unknown as EntryRowBase[];
    } else {
      if (entriesResKit.error) {
        throw new Error(
          `Error leyendo tournament_entries: ${entriesResKit.error.message}`
        );
      }

      entryRows = (entriesResKit.data ?? []) as unknown as EntryRowBase[];
    }
    const entryIds = entryRows.map((e) => e.id);

    const roundsRes = await supabase
      .from("rounds")
      .select("id, round_no, category_id")
      .eq("tournament_id", selectedTournamentId)
      .order("round_no", { ascending: true });

    if (roundsRes.error) {
      throw new Error(`Error leyendo rounds: ${roundsRes.error.message}`);
    }

    const rounds = ((roundsRes.data ?? []) as RoundRow[])
      .filter((r) => typeof r.round_no === "number")
      .sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0));

    let scorecards: ScorecardRow[] = [];
    let roundCapture: RoundCaptureState = {
      captured: new Set(),
      holeCountByEntryRound: new Map(),
    };

    const roundIds = rounds.map((r) => r.id);
    const playerIds = entryRows.map((e) => e.player_id).filter(Boolean);

    if (entryIds.length > 0) {
      const scorecardsData = await fetchScorecardsForEntries(supabase, entryIds);
      scorecards = scorecardsData as unknown as ScorecardRow[];
    }

    if (roundIds.length > 0 && playerIds.length > 0) {
      const { data: roundScores, error: roundScoresError } =
        await queryInChunks(
          playerIds,
          80,
          async (playerChunk) =>
            supabase
              .from("round_scores")
              .select("id, player_id, round_id, gross_score")
              .in("round_id", roundIds)
              .in("player_id", playerChunk)
        );

      if (roundScoresError) {
        throw new Error(`Error leyendo round_scores: ${roundScoresError}`);
      }

      const roundScoreIds = roundScores.map((rs) => rs.id);
      let holeScores: Array<{
        round_score_id: string;
        hole_number?: number | null;
        hole_no?: number | null;
      }> = [];

      if (roundScoreIds.length > 0) {
        const { data: holeScoresData, error: holeScoresError } =
          await queryInChunks(roundScoreIds, 150, async (chunk) =>
            supabase
              .from("hole_scores")
              .select("round_score_id, hole_number, hole_no")
              .in("round_score_id", chunk)
          );

        if (holeScoresError) {
          throw new Error(`Error leyendo hole_scores: ${holeScoresError}`);
        }

        holeScores = holeScoresData;
      }

      roundCapture = buildRoundCaptureState(
        entryRows.map((e) => ({
          id: e.id,
          player_id: e.player_id,
          category_id: oneOrNull(e.categories)?.id ?? null,
        })),
        rounds,
        roundScores,
        holeScores
      );
    }

    entries = entryRows.map((e) => {
      const player = oneOrNull(e.players);
      const category = oneOrNull(e.categories);

      return {
        id: e.id,
        player_id: e.player_id,
        player_number: e.player_number,
        handicap_index: e.handicap_index,
        status: e.status,
        telegram_kit_sent_at: e.telegram_kit_sent_at ?? null,
        telegram_kit_received_at: e.telegram_kit_received_at ?? null,
        round_signatures: buildRoundSignatures(
          e.id,
          category?.id ?? null,
          rounds,
          scorecards,
          roundCapture
        ),
        players: player
          ? {
              id: player.id,
              first_name: player.first_name,
              last_name: player.last_name,
              gender: player.gender,
              handicap_index: player.handicap_index,
              handicap_torneo: player.handicap_torneo,
              phone: player.phone,
              email: player.email,
              club: player.club,
              club_id: player.club_id,
              club_label: clubLabelFromClub(player.clubs),
              initials: player.initials,
              ghin_number: player.ghin_number,
              shirt_size: player.shirt_size,
              shoe_size: player.shoe_size,
              birth_year: player.birth_year,
              telegram_user_id: player.telegram_user_id ?? null,
              telegram_chat_id: player.telegram_chat_id ?? null,
            }
          : null,
        categories: category
          ? {
              id: category.id,
              code: category.code,
              name: category.name,
              max_players: category.max_players ?? null,
            }
          : null,
      };
    });
    } catch (err) {
      pageLoadError =
        err instanceof Error ? err.message : "Error al cargar inscritos";
      console.error("[entries]", err);
    }
  }

  return (
    <main className="space-y-2 p-2">
      <HeaderBlock title={entriesTitle}>
        <div className="flex flex-wrap items-center gap-2">
          {selectedTournamentId ? (
            <Link
              href={`/entries/telegram-kit-content?tournament_id=${encodeURIComponent(selectedTournamentId)}`}
              className="rounded border border-sky-700 bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
            >
              {kitContentLabel}
            </Link>
          ) : null}
          {selectedTournamentId && !registrationsClosed ? (
            <EnrollExcelButton
              tournament_id={selectedTournamentId}
              importLabel={excelImport}
            />
          ) : null}
        </div>
      </HeaderBlock>

      <section className="rounded border border-gray-300 bg-white p-1.5 shadow-sm">
        <form className="flex flex-wrap items-end gap-1.5" action="/entries">
          <input type="hidden" name="tab" value={activeTab} />

          <div className="grid gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.03em] text-gray-600">
              {ep.tournamentLabel}
            </label>
            <select
              name="tournament_id"
              defaultValue={selectedTournamentId}
              className="h-7 min-w-[260px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? noName}
                  {t.status ? ` (${t.status})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
          >
            {ep.load}
          </button>
        </form>
      </section>

      {pageLoadError ? (
        <section className="rounded border border-red-300 bg-red-50 p-3 text-[12px] text-red-900 shadow-sm">
          <p className="font-semibold">{ep.loadErrorTitle}</p>
          <p className="mt-1">{ep.loadErrorBody}</p>
          <details className="mt-3">
            <summary className="cursor-pointer font-medium text-red-800">
              {ep.loadErrorTechnical}
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-red-700">
              {pageLoadError}
            </pre>
          </details>
        </section>
      ) : null}

      {selectedTournamentId && !pageLoadError ? (
        <>
          <section
            className={`rounded border p-2 shadow-sm ${
              registrationsClosed
                ? "border-red-300 bg-red-50 text-red-900"
                : "border-green-300 bg-green-50 text-green-900"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[12px] font-semibold">
                  {registrationsClosed
                    ? ep.registrationClosedTitle
                    : ep.registrationOpenTitle}
                </div>
                <div className="text-[11px]">
                  {registrationsClosed
                    ? ep.registrationBlocked
                    : ep.registrationOpen}
                </div>
                {selectedTournament?.registration_closed_at ? (
                  <div className="text-[10px] opacity-80">
                    {ep.closedAtPrefix}{" "}
                    {new Date(selectedTournament.registration_closed_at).toLocaleString(
                      locale === "en" ? "en-US" : "es-MX"
                    )}
                  </div>
                ) : null}
              </div>

              {registrationsClosed ? (
                <form action={reopenTournamentRegistration} className="flex flex-wrap items-center gap-1">
                  <input type="hidden" name="tournament_id" value={selectedTournamentId} />
                  <input type="hidden" name="tab" value={activeTab} />
                  <input
                    name="registration_status_note"
                    placeholder={ep.reopenPlaceholder}
                    className="h-7 w-[180px] rounded border border-red-300 bg-white px-2 text-[11px] text-black"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-7 items-center justify-center rounded border border-red-700 bg-red-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-red-800"
                  >
                    {ep.reopenButton}
                  </button>
                </form>
              ) : (
                <form action={closeTournamentRegistration} className="flex flex-wrap items-center gap-1">
                  <input type="hidden" name="tournament_id" value={selectedTournamentId} />
                  <input type="hidden" name="tab" value={activeTab} />
                  <input
                    name="registration_status_note"
                    placeholder={ep.closePlaceholder}
                    className="h-7 w-[180px] rounded border border-green-300 bg-white px-2 text-[11px] text-black"
                  />
                  <button
                    type="submit"
                    className="inline-flex min-h-7 items-center justify-center rounded border border-green-700 bg-green-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-green-800"
                  >
                    {ep.closeRegistration}
                  </button>
                </form>
              )}
            </div>
          </section>
         {bulkStatus && bulkMessage ? (
            <section className={feedbackClasses(bulkStatus)}>
              <div className="font-semibold">{bulkMessage}</div>

              {bulkSelected !== null || bulkAdded !== null || bulkSkipped !== null ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  {bulkSelected !== null ? (
                    <span className="rounded border border-current/20 bg-white/60 px-2 py-1">
                      {ep.bulkFeedbackSelected} {bulkSelected}
                    </span>
                  ) : null}

                  {bulkAdded !== null ? (
                    <span className="rounded border border-current/20 bg-white/60 px-2 py-1">
                      {ep.bulkFeedbackAdded} {bulkAdded}
                    </span>
                  ) : null}

                  {bulkSkipped !== null ? (
                    <span className="rounded border border-current/20 bg-white/60 px-2 py-1">
                      {ep.bulkFeedbackSkipped} {bulkSkipped}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded border border-gray-300 bg-white p-1.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-1">
              <a
                href={tabHref(selectedTournamentId, "manual")}
                className={tabClasses(activeTab === "manual")}
              >
                {ep.tabManual}
              </a>

              <a
                href={tabHref(selectedTournamentId, "bulk")}
                className={tabClasses(activeTab === "bulk")}
              >
                {ep.tabBulk}
              </a>

              <a
                href={tabHref(selectedTournamentId, "entries")}
                className={tabClasses(activeTab === "entries")}
              >
                {ep.tabEntries}
              </a>

              <a
                href={tabHref(selectedTournamentId, "summary")}
                className={tabClasses(activeTab === "summary")}
              >
                {ep.tabSummary}
              </a>
            </div>
          </section>

          {activeTab === "manual" ? (
            registrationsClosed ? (
              <section className="rounded border border-red-300 bg-red-50 p-3 text-[12px] text-red-900 shadow-sm">
                {ep.manualClosedMsg}
              </section>
            ) : (
              <SinglePlayerEntryPanel
                players={players.filter(
                  (p) => !entries.some((e) => e.player_id === p.id)
                )}
                allPlayers={players}
                enrolledPlayerIds={entries.map((e) => e.player_id)}
                playersOnTeams={[...playersOnTeams]}
                tournamentId={selectedTournamentId}
                categories={categories}
                matchPlayPairs={matchPlayPairsEnabled}
              />
            )
          ) : null}

          {activeTab === "bulk" ? (
            registrationsClosed ? (
              <section className="rounded border border-red-300 bg-red-50 p-3 text-[12px] text-red-900 shadow-sm">
                {ep.bulkClosedNote}
              </section>
            ) : (
              <BulkEntryPanel
                players={players}
                tournamentId={selectedTournamentId}
              />
            )
          ) : null}

          {activeTab === "entries" ? (
            <EntriesListPanel
              entries={entries}
              tournamentId={selectedTournamentId}
              categories={categories}
              matchPlayPairs={matchPlayPairsEnabled}
              partnerByEntryId={Object.fromEntries(partnerByEntryId)}
            />
          ) : null}

          {activeTab === "summary" ? (
            <EntriesSummaryPanel entries={entries} />
          ) : null}
        </>
      ) : (
        <section className="rounded border border-gray-300 bg-white p-3 text-[12px] text-gray-700 shadow-sm">
          {ep.noTournamentSelected}
        </section>
      )}
    </main>
  );
}
