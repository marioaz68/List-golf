import Link from "next/link";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import {
  checkTournamentAccess,
  requireTournamentAccess,
} from "@/lib/auth/requireTournamentAccess";
import ScoreEntryClient from "./ScoreEntryClient";
import RepairCapturesButton from "./RepairCapturesButton";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/fmt";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import { roundRowAppliesToEntry } from "@/lib/leaderboard/roundCategoryMatch";
import { syncCaptureToEntryRound } from "@/lib/scorecards/syncCaptureToEntryRound";
import { countHolesOnPlayerRound } from "@/lib/scorecards/countHolesOnPlayerRound";
import { resolveEntryCaptureRound } from "@/lib/rounds/resolveEntryCaptureRound";
import { resolveScoreEntryDisplayTarget } from "@/lib/rounds/scoreEntryDisplayRound";
import {
  fetchTournamentRegistrationStatus,
  isRegistrationClosed,
} from "@/lib/tournaments/registrationGate";
import { toYyyyMmDd, type SessionRoundFields } from "../tee-sheet/sessionBlock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
  tournament_id: string;
  category_id: string | null;
  wave: string | null;
  start_type: string | null;
  start_time: string | null;
  interval_minutes: number | null;
  category:
    | { code: string | null; name: string | null }
    | { code: string | null; name: string | null }[]
    | null;
};

type PlayerRow = {
  id: string;
  player_number: number | null;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
  handicap_torneo?: number | null;
};

type HoleRow = {
  hole_number: number;
  par: number;
  handicap_index: number;
};

type HoleScoreRow = {
  hole_number: number | null;
  hole_no?: number | null;
  strokes: number | null;
};

function holeNoFromScoreRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

type CapturedRoundRow = {
  round_id: string;
  round_no: number;
  round_date: string | null;
  scores: Record<number, number>;
};

type EntryPlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
};

type CategoryMini = {
  code: string | null;
  name: string | null;
};

type EntryJoinRow = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  category_id: string | null;
  player: EntryPlayerRow | EntryPlayerRow[] | null;
  category: CategoryMini | CategoryMini[] | null;
};

type ValidEntryRow = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  category_id: string | null;
  player: EntryPlayerRow;
  category: CategoryMini | null;
};

const ENTRY_SELECT_FOR_LOOKUP = `
        id,
        player_id,
        player_number,
        handicap_index,
        category_id,
        player:players (
          id,
          first_name,
          last_name,
          handicap_index
        ),
        category:categories (
          code,
          name
        )
      `;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Todas las inscripciones del torneo (paginado; PostgREST suele limitar ~1000 por request). */
async function fetchAllTournamentEntriesForLookup(
  supabase: ServerSupabase,
  tournamentId: string
): Promise<{ rows: EntryJoinRow[]; error: PostgrestError | null }> {
  const pageSize = 1000;
  let from = 0;
  const acc: EntryJoinRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("tournament_entries")
      .select(ENTRY_SELECT_FOR_LOOKUP)
      .eq("tournament_id", tournamentId)
      .order("player_number", { ascending: true, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) return { rows: acc, error };
    const chunk = (data ?? []) as unknown as EntryJoinRow[];
    acc.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
    if (from > 40_000) break;
  }
  return { rows: acc, error: null };
}

function normalizeText(s: string) {
  return s.trim();
}

/** Compara nombres sin depender de mayúsculas ni acentos (NFD). */
function foldDiacritics(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function playerFullName(p: {
  first_name: string | null;
  last_name: string | null;
}) {
  return [p.first_name ?? "", p.last_name ?? ""].join(" ").trim().toLowerCase();
}

function entryMatchesNameQuery(
  p: EntryPlayerRow,
  qRaw: string
): boolean {
  const q = normalizeText(qRaw).toLowerCase();
  if (!q) return false;
  const full = foldDiacritics(playerFullName(p));
  const fq = foldDiacritics(q);
  if (full.includes(fq)) return true;
  const first = foldDiacritics((p.first_name ?? "").trim().toLowerCase());
  const last = foldDiacritics((p.last_name ?? "").trim().toLowerCase());
  if (first.includes(fq) || last.includes(fq)) return true;
  const tokens = q.split(/\s+/).filter(Boolean).map((t) => foldDiacritics(t));
  if (tokens.length <= 1) return false;
  return tokens.every((tok) => full.includes(tok));
}

function buildDefaultHoles(): HoleRow[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
  }));
}

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function categoryCodeFromRound(row: RoundRow): string | null {
  const c = oneOrNull(row.category);
  const raw = (c?.code ?? c?.name ?? "").trim();
  return raw || null;
}

function sortRoundsForSelect(a: RoundRow, b: RoundRow) {
  const da = toYyyyMmDd(a.round_date) ?? "";
  const db = toYyyyMmDd(b.round_date) ?? "";
  if (da !== db) return da.localeCompare(db);
  const wa = String(a.wave ?? "").localeCompare(String(b.wave ?? ""));
  if (wa !== 0) return wa;
  if (a.round_no !== b.round_no) return a.round_no - b.round_no;
  return String(categoryCodeFromRound(a) ?? "").localeCompare(
    String(categoryCodeFromRound(b) ?? ""),
    "es",
    { sensitivity: "base" }
  );
}

function toValidEntry(row: EntryJoinRow): ValidEntryRow | null {
  const player = oneOrNull(row.player);
  if (!player?.id || !row.id) return null;
  return {
    id: row.id,
    player_id: row.player_id,
    player_number: row.player_number,
    handicap_index: row.handicap_index,
    category_id: row.category_id,
    player,
    category: oneOrNull(row.category),
  };
}

export default async function ScoreEntryPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  noStore();
  const locale = await getLocale();
  const se = messages[locale].scoreEntry;
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const searchRaw = typeof sp.q === "string" ? normalizeText(sp.q) : "";
  const requestedEntryId =
    typeof sp.entry_id === "string" ? sp.entry_id.trim() : "";
  const requestedRoundId = typeof sp.round_id === "string" ? sp.round_id : "";
  const requestedRoundNoRaw =
    typeof sp.round_no === "string" ? sp.round_no.trim() : "";
  const requestedRoundNo = /^\d+$/.test(requestedRoundNoRaw)
    ? Number(requestedRoundNoRaw)
    : null;
  const tournamentIdFromQuery =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const roundsQuery = supabase
    .from("rounds")
    .select(
      `
      id,
      round_no,
      round_date,
      tournament_id,
      category_id,
      wave,
      start_type,
      start_time,
      interval_minutes,
      category:categories (code, name)
    `
    )
    .order("round_no", { ascending: true });

  const { data: rounds, error: roundsErr } = tournamentIdFromQuery
    ? await roundsQuery.eq("tournament_id", tournamentIdFromQuery)
    : await roundsQuery;

  if (roundsErr) {
    return (
      <div className="p-6 text-sm text-red-300">
        Error cargando rondas: {roundsErr.message}
      </div>
    );
  }

  const roundListAll = ((rounds ?? []) as RoundRow[])
    .map((r) => ({
      ...r,
      category_id: r.category_id ?? null,
      wave: r.wave ?? null,
      start_type: r.start_type ?? null,
      start_time: r.start_time ?? null,
      interval_minutes: r.interval_minutes ?? null,
    }))
    .sort(sortRoundsForSelect);

  const roundList = roundListAll.filter((r) => toYyyyMmDd(r.round_date));
  const roundsMissingDate =
    roundListAll.length > 0 && roundList.length === 0;

  const effectiveTournamentId =
    tournamentIdFromQuery ||
    (requestedRoundId
      ? roundListAll.find((r) => r.id === requestedRoundId)?.tournament_id ?? ""
      : "") ||
    roundListAll[0]?.tournament_id ||
    "";

  let canRepairCaptures = false;

  if (effectiveTournamentId) {
    await requireTournamentAccess({
      tournamentId: effectiveTournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
      ],
    });

    const repairAccess = await checkTournamentAccess({
      tournamentId: effectiveTournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
      ],
    });
    canRepairCaptures = repairAccess.ok;
  }

  let player: PlayerRow | null = null;
  let holes: HoleRow[] = buildDefaultHoles();
  let existingScores: Record<number, number> = {};
  let capturedRounds: CapturedRoundRow[] = [];
  let misalignedCapturedRounds: CapturedRoundRow[] = [];
  let errorMsg = "";
  let ambiguousCandidates: ValidEntryRow[] = [];
  let roundClosed = false;
  let entryIdForScorecard = "";
  let priorRoundGateMessage = "";
  let scoringRoundBlocked = false;
  let captureRoundNotice = "";
  let pendingCaptureRoundNo: number | null = null;
  let entryCategoryLabel = messages[locale].common.noCategory;
  let registrationOpenMessage = "";

  if (effectiveTournamentId) {
    const regStatus = await fetchTournamentRegistrationStatus(
      supabase,
      effectiveTournamentId
    );
    if (!isRegistrationClosed(regStatus)) {
      registrationOpenMessage = se.registrationOpenGate;
    }
  }

  if (effectiveTournamentId) {
    const { data: holesData, error: holesErr } = await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", effectiveTournamentId)
      .order("hole_number", { ascending: true });

    if (holesErr) {
      errorMsg = holesErr.message;
    } else if (holesData && holesData.length > 0) {
      holes = (holesData as HoleRow[]).map((h) => ({
        hole_number: Number(h.hole_number),
        par: Number(h.par),
        handicap_index: Number(h.handicap_index ?? 0),
      }));
    }
  }

  let scoringRoundId = "";

  if (effectiveTournamentId && searchRaw && !registrationOpenMessage) {
    const isNumeric = /^\d+$/.test(searchRaw);

    let entryRows: EntryJoinRow[] = [];
    let entryErr: PostgrestError | null = null;

    if (isNumeric) {
      const wanted = Number(searchRaw);
      const { data, error } = await supabase
        .from("tournament_entries")
        .select(ENTRY_SELECT_FOR_LOOKUP)
        .eq("tournament_id", effectiveTournamentId)
        .eq("player_number", wanted);
      entryErr = error;
      entryRows = (data ?? []) as unknown as EntryJoinRow[];

      if (!error && entryRows.length === 0) {
        const full = await fetchAllTournamentEntriesForLookup(
          supabase,
          effectiveTournamentId
        );
        entryErr = full.error;
        entryRows = full.rows;
      }
    } else {
      const full = await fetchAllTournamentEntriesForLookup(
        supabase,
        effectiveTournamentId
      );
      entryErr = full.error;
      entryRows = full.rows;
    }

    let matchedEntry: ValidEntryRow | null = null;

    if (entryErr) {
      errorMsg = entryErr.message;
    } else {
      const entries: ValidEntryRow[] = entryRows
        .map((row) => toValidEntry(row as EntryJoinRow))
        .filter((row): row is ValidEntryRow => row !== null);

      const wantedNum = isNumeric ? Number(searchRaw) : NaN;

      const candidates = isNumeric
        ? entries.filter(
            (row) =>
              row.player_number != null &&
              Number(row.player_number) === wantedNum
          )
        : entries.filter((row) =>
            entryMatchesNameQuery(row.player, searchRaw)
          );

      if (requestedEntryId) {
        matchedEntry =
          candidates.find((c) => c.id === requestedEntryId) ?? null;
      }
      if (!matchedEntry && candidates.length === 1) {
        matchedEntry = candidates[0]!;
      }
      if (!matchedEntry && candidates.length > 1) {
        ambiguousCandidates = candidates;
      }

      if (matchedEntry) {
        entryIdForScorecard = matchedEntry.id;
        entryCategoryLabel =
          matchedEntry.category?.code?.trim() ||
          matchedEntry.category?.name?.trim() ||
          messages[locale].common.noCategory;
        const p = matchedEntry.player;
        player = {
          id: p.id,
          player_number: matchedEntry.player_number,
          first_name: p.first_name,
          last_name: p.last_name,
          handicap_index: p.handicap_index,
          handicap_torneo: matchedEntry.handicap_index,
        };
      }
    }

    if (matchedEntry) {
      try {
        const gateCtx = await loadCategoryRoundGateContext(
          supabase,
          effectiveTournamentId
        );
        const roundsForCapture = roundListAll.filter(
          (r) => r.tournament_id === effectiveTournamentId
        ) as SessionRoundFields[];

        const capture = await resolveEntryCaptureRound(supabase, {
          entryId: matchedEntry.id,
          entryCategoryId: matchedEntry.category_id,
          tournamentId: effectiveTournamentId,
          rounds: roundsForCapture,
          lookups: gateCtx.lookups,
        });

        if (!capture.ok) {
          if (capture.reason === "prior_not_closed") {
            scoringRoundBlocked = true;
            const catLabel =
              matchedEntry.category?.code?.trim() ||
              matchedEntry.category?.name?.trim() ||
              messages[locale].common.noCategory;
            priorRoundGateMessage = fmt(se.priorRoundGate, {
              round: capture.targetRoundNo,
              prior: capture.priorRoundNo,
              category: catLabel,
            });
          } else if (capture.reason === "all_closed") {
            scoringRoundBlocked = true;
            priorRoundGateMessage = `Este jugador ya tiene cerradas todas sus rondas (hasta R${capture.lastRoundNo}).`;
          } else {
            scoringRoundBlocked = true;
            priorRoundGateMessage =
              "No hay ronda configurada para la categoría de este jugador.";
          }
        } else {
          scoringRoundId = capture.roundId;
          roundClosed = capture.roundClosed === true;
          const catLabel =
            matchedEntry.category?.code?.trim() ||
            matchedEntry.category?.name?.trim() ||
            "categoría";
          const when = capture.sessionLabel?.trim();
          if (capture.roundClosed) {
            captureRoundNotice = when
              ? `R${capture.roundNo} cerrada (${when}) · inscripción ${catLabel}. Pulsa ABRIR para corregir.`
              : `R${capture.roundNo} cerrada · inscripción ${catLabel}. Pulsa ABRIR para corregir.`;
          } else {
            captureRoundNotice = when
              ? `Capturando ${when} · inscripción ${catLabel}. Día y turno según salidas y rondas del torneo.`
              : `Capturando R${capture.roundNo} · inscripción ${catLabel}.`;
          }

          if (player) {
            const display = await resolveScoreEntryDisplayTarget(supabase, {
              entryId: matchedEntry.id,
              playerId: player.id,
              categoryId: matchedEntry.category_id,
              rounds: gateCtx.rounds,
              lookups: gateCtx.lookups,
              captureRoundId: capture.roundId,
              captureRoundNo: capture.roundNo,
              captureRoundClosed: capture.roundClosed === true,
              forceRoundNo: requestedRoundNo,
            });
            scoringRoundId = display.roundId;
            roundClosed = display.roundClosed;
            if (display.pendingOpenRoundNo != null) {
              pendingCaptureRoundNo = display.pendingOpenRoundNo;
              captureRoundNotice = `R${display.roundNo} cerrada · inscripción ${catLabel}. R${display.pendingOpenRoundNo} aún sin captura. Pulsa ABRIR para corregir R${display.roundNo}.`;
            } else if (display.roundClosed) {
              captureRoundNotice = `R${display.roundNo} cerrada · inscripción ${catLabel}. Pulsa ABRIR para corregir.`;
            } else if (requestedRoundNo != null) {
              captureRoundNotice = `Capturando R${display.roundNo} · inscripción ${catLabel}.`;
            }
          }
        }
      } catch (e) {
        errorMsg =
          e instanceof Error
            ? e.message
            : "Error resolviendo la ronda de captura";
      }
    }

    if (matchedEntry && player && scoringRoundId && !scoringRoundBlocked) {
      try {
        const admin = await createAdminClient();
        const sync = await syncCaptureToEntryRound(admin, {
          tournamentId: effectiveTournamentId,
          entryId: matchedEntry.id,
          playerId: player.id,
          sessionRoundId: scoringRoundId,
          entryCategoryId: matchedEntry.category_id,
          rounds: roundListAll as SessionRoundFields[],
        });
        scoringRoundId = sync.targetRoundId;
        if (sync.holesCopied > 0 || sync.prunedRoundScoreIds.length > 0) {
          captureRoundNotice = [
            captureRoundNotice,
            sync.holesCopied > 0
              ? `Se consolidaron ${sync.holesCopied} hoyos en la ronda de su inscripción.`
              : "",
            sync.prunedRoundScoreIds.length > 0
              ? "Se eliminó un registro duplicado de captura anterior."
              : "",
          ]
            .filter(Boolean)
            .join(" ");
        }

        if (sync.holesCopied > 0) {
          const { data: rsAfterSync } = await admin
            .from("round_scores")
            .select("id")
            .eq("round_id", scoringRoundId)
            .eq("player_id", player.id)
            .maybeSingle();

          if (rsAfterSync?.id) {
            const { data: holesAfterSync } = await admin
              .from("hole_scores")
              .select("hole_number, hole_no, strokes")
              .eq("round_score_id", rsAfterSync.id)
              .order("hole_number", { ascending: true });

            for (const row of (holesAfterSync ?? []) as HoleScoreRow[]) {
              const holeNo = holeNoFromScoreRow(row);
              if (holeNo == null || row.strokes == null) continue;
              existingScores[holeNo] = Number(row.strokes);
            }
          }
        }
      } catch (e) {
        console.error("[score-entry] syncCaptureToEntryRound:", e);
      }
    }

    if (player && !scoringRoundBlocked) {
        const allRoundIds = roundListAll
        .filter((r) => r.tournament_id === effectiveTournamentId)
        .map((r) => r.id);

      const { data: roundScoresData, error: roundScoresErr } = await supabase
        .from("round_scores")
        .select("id, round_id")
        .eq("player_id", player.id)
        .in("round_id", allRoundIds);

      if (roundScoresErr) {
        errorMsg = roundScoresErr.message;
      } else {
        const roundScores = (roundScoresData ?? []) as {
          id: string;
          round_id: string;
        }[];

        const selectedRoundScore = roundScores.find(
          (x) => x.round_id === scoringRoundId
        );

        if (selectedRoundScore?.id) {
          const { data: holeScoreData, error: holeScoreErr } = await supabase
            .from("hole_scores")
            .select("hole_number, hole_no, strokes")
            .eq("round_score_id", selectedRoundScore.id)
            .order("hole_number", { ascending: true });

          if (holeScoreErr) {
            errorMsg = holeScoreErr.message;
          } else {
            for (const row of (holeScoreData ?? []) as HoleScoreRow[]) {
              const holeNo = holeNoFromScoreRow(row);
              if (holeNo == null || row.strokes == null) continue;
              existingScores[holeNo] = Number(row.strokes);
            }
          }
        }

        if (roundScores.length > 0) {
          const roundScoreIds = roundScores.map((x) => x.id);

          const { data: allHoleScores, error: allHoleScoresErr } = await supabase
            .from("hole_scores")
            .select("round_score_id, hole_number, hole_no, strokes")
            .in("round_score_id", roundScoreIds)
            .order("hole_number", { ascending: true });

          if (allHoleScoresErr) {
            errorMsg = allHoleScoresErr.message;
          } else {
            const byRoundScoreId = new Map<
              string,
              { round_id: string; scores: Record<number, number> }
            >();

            for (const rs of roundScores) {
              byRoundScoreId.set(rs.id, {
                round_id: rs.round_id,
                scores: {},
              });
            }

            for (const row of (allHoleScores ?? []) as Array<{
              round_score_id: string;
              hole_number: number | null;
              hole_no?: number | null;
              strokes: number | null;
            }>) {
              const entry = byRoundScoreId.get(row.round_score_id);
              if (!entry) continue;
              const holeNo = holeNoFromScoreRow(row);
              if (holeNo == null || row.strokes == null) continue;
              entry.scores[holeNo] = Number(row.strokes);
            }

            const rows = roundScores
              .map((rs) => {
                const roundMeta = roundListAll.find((r) => r.id === rs.round_id);
                if (!roundMeta) return null;

                return {
                  round_id: rs.round_id,
                  round_no: roundMeta.round_no,
                  round_date: roundMeta.round_date,
                  scores: byRoundScoreId.get(rs.id)?.scores ?? {},
                } satisfies CapturedRoundRow;
              })
              .filter(Boolean) as CapturedRoundRow[];

            if (matchedEntry) {
              misalignedCapturedRounds = rows
                .filter((row) => {
                  const meta = roundListAll.find((r) => r.id === row.round_id);
                  if (!meta) return false;
                  return !roundRowAppliesToEntry(
                    { category_id: meta.category_id ?? null },
                    matchedEntry.category_id
                  );
                })
                .sort((a, b) => a.round_no - b.round_no);

            }

            capturedRounds = rows
              .filter((row) => {
                if (!matchedEntry) return true;
                const meta = roundListAll.find((r) => r.id === row.round_id);
                if (!meta) return true;
                return roundRowAppliesToEntry(
                  { category_id: meta.category_id ?? null },
                  matchedEntry.category_id
                );
              })
              .sort((a, b) => a.round_no - b.round_no);

            const scoringMeta =
              roundListAll.find((r) => r.id === scoringRoundId) ?? null;
            const hasExisting = Object.keys(existingScores).length > 0;
            if (
              hasExisting &&
              scoringMeta &&
              !capturedRounds.some((r) => r.round_id === scoringRoundId)
            ) {
              capturedRounds.push({
                round_id: scoringRoundId,
                round_no: scoringMeta.round_no,
                round_date: scoringMeta.round_date,
                scores: { ...existingScores },
              });
              capturedRounds.sort((a, b) => a.round_no - b.round_no);
            }

            if (
              Object.keys(existingScores).length === 0 &&
              misalignedCapturedRounds.length > 0
            ) {
              const scoringNo =
                roundListAll.find((r) => r.id === scoringRoundId)?.round_no ??
                roundListAll.find((r) => r.id === scoringRoundId)?.round_no ??
                1;
              const hint =
                misalignedCapturedRounds.find((r) => r.round_no === scoringNo) ??
                misalignedCapturedRounds[0];
              if (hint?.scores && Object.keys(hint.scores).length > 0) {
                Object.assign(existingScores, hint.scores);
                captureRoundNotice = [
                  captureRoundNotice,
                  "Se recuperaron hoyos de una captura anterior mal ubicada; al guardar quedan en la inscripción del jugador.",
                ]
                  .filter(Boolean)
                  .join(" ");
              }
            }
          }
        }

        if (entryIdForScorecard && scoringRoundId && player) {
          const { data: scorecardRow, error: scorecardErr } = await supabase
            .from("scorecards")
            .select("locked_at")
            .eq("entry_id", entryIdForScorecard)
            .eq("round_id", scoringRoundId)
            .maybeSingle();

          if (scorecardErr) {
            errorMsg = scorecardErr.message;
          } else {
            const holesOnRound = await countHolesOnPlayerRound(
              supabase,
              player.id,
              scoringRoundId
            );
            const dbLocked = Boolean(scorecardRow?.locked_at);
            if (dbLocked && holesOnRound < 18) {
              roundClosed = false;
              captureRoundNotice = [
                captureRoundNotice,
                `La tarjeta figura cerrada en sistema pero solo hay ${holesOnRound}/18 hoyos en esta categoría; puedes capturar o usar reparación de datos.`,
              ]
                .filter(Boolean)
                .join(" ");
            } else {
              roundClosed =
                roundClosed || (dbLocked && holesOnRound >= 18);
            }
          }
        }
      }
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-bold text-white">{se.title}</h1>
        <p className="mt-1 text-sm text-white/70">{se.subtitle}</p>

        {registrationOpenMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {registrationOpenMessage}
          </div>
        )}

        {roundsMissingDate && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {se.roundsNeedDate}
          </div>
        )}

        <form className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            type="hidden"
            name="tournament_id"
            value={effectiveTournamentId}
          />

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Número de inscripción o nombre
              </label>
              <input
                id="score-entry-player-search"
                key={`score-entry-q-${searchRaw || ""}`}
                type="search"
                name="q"
                defaultValue={searchRaw}
                placeholder="25 o Mario"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                disabled={!effectiveTournamentId || !!registrationOpenMessage}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-black placeholder:text-gray-400 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-gray-500">
                Categoría, día, turno y ronda pendiente salen de inscripción,
                salidas y rondas. Solo captura hoyos.
              </p>
            </div>

            <button
              type="submit"
              disabled={!effectiveTournamentId || !!registrationOpenMessage}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Buscar
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {priorRoundGateMessage && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {priorRoundGateMessage}
          </div>
        )}

        {effectiveTournamentId &&
          searchRaw &&
          ambiguousCandidates.length > 1 &&
          !player &&
          !errorMsg && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-semibold">{se.searchAmbiguousTitle}</p>
              <ul className="mt-3 space-y-2">
                {ambiguousCandidates.map((e) => {
                  const p = e.player;
                  const fullName = [p.first_name, p.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const cat = (e.category?.code ?? e.category?.name ?? "")
                    .trim();
                  const qs = new URLSearchParams();
                  qs.set("tournament_id", effectiveTournamentId);
                  qs.set("q", searchRaw);
                  qs.set("entry_id", e.id);
                  const href = `/score-entry?${qs.toString()}`;
                  return (
                    <li key={e.id}>
                      <Link
                        href={href}
                        className="block rounded-md border border-amber-300/80 bg-white px-3 py-2 font-medium text-amber-950 underline-offset-2 hover:bg-amber-100/80 hover:underline"
                      >
                        <span className="text-gray-900">{fullName || "—"}</span>
                        <span className="mt-0.5 block text-xs font-normal text-gray-600">
                          {e.player_number != null
                            ? `#${e.player_number}`
                            : "—"}
                          {cat ? ` · ${cat}` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

        {effectiveTournamentId &&
          searchRaw &&
          !player &&
          !errorMsg &&
          ambiguousCandidates.length === 0 && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            {se.searchNotFound.replace("{q}", searchRaw)}
          </div>
        )}

        {effectiveTournamentId && canRepairCaptures && (
          <RepairCapturesButton tournamentId={effectiveTournamentId} />
        )}

        {effectiveTournamentId &&
          player &&
          pendingCaptureRoundNo != null &&
          searchRaw && (
            <p className="mt-3 text-sm text-slate-600">
              <Link
                href={`/score-entry?${new URLSearchParams({
                  tournament_id: effectiveTournamentId,
                  q: searchRaw,
                  ...(requestedEntryId
                    ? { entry_id: requestedEntryId }
                    : {}),
                  round_no: String(pendingCaptureRoundNo),
                }).toString()}`}
                className="font-semibold text-sky-700 underline-offset-2 hover:underline"
              >
                Capturar R{pendingCaptureRoundNo} (ronda siguiente)
              </Link>
            </p>
          )}

        {effectiveTournamentId &&
          player &&
          holes.length > 0 &&
          !scoringRoundBlocked &&
          scoringRoundId && (
          <ScoreEntryClient
            roundId={scoringRoundId}
            tournamentId={effectiveTournamentId}
            tournamentDayId={null}
            player={player}
            holes={holes}
            existingScores={existingScores}
            capturedRounds={capturedRounds}
            selectedRoundNo={
              roundListAll.find((r) => r.id === scoringRoundId)?.round_no ?? 1
            }
            entryCategoryLabel={entryCategoryLabel}
            roundClosed={roundClosed}
            captureRoundNotice={captureRoundNotice || undefined}
          />
        )}
      </div>
    </div>
  );
}