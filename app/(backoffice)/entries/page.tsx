import type { ReactNode } from "react";
import Link from "next/link";
import { fetchScorecardsForEntries } from "@/lib/entries/fetchScorecardsForEntries";
import { createClient } from "@/utils/supabase/server";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tournament = {
  id: string;
  name: string | null;
  status: string | null;
  registration_status: "open" | "closed" | string | null;
  registration_closed_at: string | null;
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

function roundRowForEntry(
  rounds: RoundRow[],
  roundNo: number,
  categoryId: string | null
): RoundRow | null {
  const matching = rounds.filter((r) => r.round_no === roundNo);
  if (matching.length === 0) return null;

  const cat = String(categoryId ?? "").trim();
  if (cat) {
    const byCat = matching.find((r) => String(r.category_id ?? "").trim() === cat);
    if (byCat) return byCat;
  }

  return matching[0] ?? null;
}

/** Captura solo en la ronda de la categoría del inscrito (no otra fila R1 del torneo). */
function buildCapturedByEntryRound(
  entries: Array<{ id: string; player_id: string; category_id: string | null }>,
  rounds: RoundRow[],
  roundScores: Array<{
    id: string;
    player_id: string | null;
    round_id: string | null;
    gross_score: number | null;
  }>,
  holeScores: Array<{ round_score_id: string }>
): Set<string> {
  const holeCountByRoundScore = new Map<string, number>();
  for (const row of holeScores) {
    holeCountByRoundScore.set(
      row.round_score_id,
      (holeCountByRoundScore.get(row.round_score_id) ?? 0) + 1
    );
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
  for (const entry of entries) {
    const playerId = String(entry.player_id ?? "").trim();
    if (!playerId) continue;

    for (const roundNo of [1, 2, 3]) {
      const round = roundRowForEntry(rounds, roundNo, entry.category_id);
      if (!round?.id) continue;

      const rs = scoresByPlayerRound.get(`${playerId}_${round.id}`);
      if (!rs) continue;

      const hasHoles = (holeCountByRoundScore.get(rs.id) ?? 0) > 0;
      const hasGross = rs.gross_score != null;
      if (hasHoles || hasGross) {
        captured.add(`${entry.id}_${roundNo}`);
      }
    }
  }

  return captured;
}

function buildRoundSignatures(
  entryId: string,
  categoryId: string | null,
  rounds: RoundRow[],
  scorecards: ScorecardRow[],
  capturedByEntryRound: Set<string>
): RoundSignature[] {
  return [1, 2, 3].map((roundNo) => {
    const round = roundRowForEntry(rounds, roundNo, categoryId);
    const scorecard = round
      ? scorecards.find(
          (sc) => sc.entry_id === entryId && sc.round_id === round.id
        )
      : null;

    const signatures = Array.isArray(scorecard?.scorecard_signatures)
      ? scorecard!.scorecard_signatures!
      : [];

    const signedRows = signatures.filter(signatureIsSigned);

    return {
      round_no: roundNo,
      player_signed: signedRows.some((sig) => signatureRole(sig) === "player"),
      marker_signed: signedRows.some((sig) => signatureRole(sig) === "marker"),
      witness_signed: signedRows.some((sig) => signatureRole(sig) === "witness"),
      captured: capturedByEntryRound.has(`${entryId}_${roundNo}`),
      closed: Boolean(scorecard?.locked_at),
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

  const [tournamentsRes, playersRes, categoriesRes] = await Promise.all([
    supabase.from("tournaments").select("id, name, status, registration_status, registration_closed_at").order("name"),
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
    throw new Error(`Error leyendo tournaments: ${tournamentsRes.error.message}`);
  }

  if (playersRes.error) {
    throw new Error(`Error leyendo players: ${playersRes.error.message}`);
  }

  if (categoriesRes.error) {
    throw new Error(`Error leyendo categories: ${categoriesRes.error.message}`);
  }

  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const selectedTournamentId = requestedTournamentId || tournaments[0]?.id || "";
  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const registrationStatus = selectedTournament?.registration_status ?? "open";
  const registrationsClosed = registrationStatus === "closed";

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

  const players: Player[] = ((playersRes.data ?? []) as unknown as PlayerBaseRaw[]).map(
    (p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      gender: p.gender,
      handicap_index: p.handicap_index,
      birth_year: p.birth_year,
      club_label: clubLabelFromClub(p.clubs),
    })
  );

  let entries: EntryRow[] = [];

  if (selectedTournamentId) {
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
    let capturedByEntryRound = new Set<string>();

    const roundIds = rounds.map((r) => r.id);
    const playerIds = entryRows.map((e) => e.player_id).filter(Boolean);

    if (entryIds.length > 0) {
      const scorecardsData = await fetchScorecardsForEntries(supabase, entryIds);
      scorecards = scorecardsData as unknown as ScorecardRow[];
    }

    if (roundIds.length > 0 && playerIds.length > 0) {
      const roundScoresRes = await supabase
        .from("round_scores")
        .select("id, player_id, round_id, gross_score")
        .in("round_id", roundIds)
        .in("player_id", playerIds);

      if (roundScoresRes.error) {
        throw new Error(
          `Error leyendo round_scores: ${roundScoresRes.error.message}`
        );
      }

      const roundScores = (roundScoresRes.data ?? []) as Array<{
        id: string;
        player_id: string | null;
        round_id: string | null;
        gross_score: number | null;
      }>;

      const roundScoreIds = roundScores.map((rs) => rs.id);
      let holeScores: Array<{ round_score_id: string }> = [];

      if (roundScoreIds.length > 0) {
        const holeScoresRes = await supabase
          .from("hole_scores")
          .select("round_score_id")
          .in("round_score_id", roundScoreIds);

        if (holeScoresRes.error) {
          throw new Error(
            `Error leyendo hole_scores: ${holeScoresRes.error.message}`
          );
        }

        holeScores = (holeScoresRes.data ?? []) as Array<{
          round_score_id: string;
        }>;
      }

      capturedByEntryRound = buildCapturedByEntryRound(
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
          capturedByEntryRound
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

      {selectedTournamentId ? (
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
                tournamentId={selectedTournamentId}
                categories={categories}
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
