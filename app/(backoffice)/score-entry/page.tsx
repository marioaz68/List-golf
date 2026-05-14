import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import ScoreEntryClient from "./ScoreEntryClient";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import {
  buildSessionBlocks,
  formatSessionDayWaveLabel,
  normalizeStartTypeForSession,
  normalizeTime,
  representativeRoundId,
  roundsInSameSession,
  toYyyyMmDd,
  type SessionRoundFields,
} from "../tee-sheet/sessionBlock";

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
  hole_number: number;
  strokes: number | null;
};

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

function resolveScoringRoundId(
  rounds: RoundRow[],
  selectedRound: RoundRow,
  entryCategoryId: string | null
): string {
  const cat = String(entryCategoryId ?? "").trim();
  const sess = roundsInSameSession(
    rounds as SessionRoundFields[],
    selectedRound.id
  );
  if (!cat) return sess[0]?.id ?? selectedRound.id;
  const inSess = sess.find(
    (r) => String(r.category_id ?? "").trim() === cat
  );
  if (inSess) return inSess.id;

  const ymd = toYyyyMmDd(selectedRound.round_date);
  const wave = String(selectedRound.wave ?? "").trim().toUpperCase();
  const st = normalizeStartTypeForSession(selectedRound.start_type);
  const t0 = normalizeTime(selectedRound.start_time);
  const rn = selectedRound.round_no;

  const alt =
    rounds.find((r) => {
      if (toYyyyMmDd(r.round_date) !== ymd) return false;
      if (String(r.wave ?? "").trim().toUpperCase() !== wave) return false;
      if (normalizeStartTypeForSession(r.start_type) !== st) return false;
      if (normalizeTime(r.start_time) !== t0) return false;
      if (r.round_no !== rn) return false;
      if (String(r.category_id ?? "").trim() !== cat) return false;
      return true;
    }) ?? null;

  return alt?.id ?? selectedRound.id;
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
  const tournamentIdFromQuery =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const today = new Date().toISOString().slice(0, 10);

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

  const sessionBlocks =
    roundList.length > 0
      ? buildSessionBlocks(roundList as SessionRoundFields[])
      : [];

  let selectedRound: RoundRow | null = null;

  if (requestedRoundId) {
    const hit = roundList.find((r) => r.id === requestedRoundId) ?? null;
    if (hit) {
      const repId = representativeRoundId(roundList as SessionRoundFields[], hit.id);
      selectedRound = roundList.find((r) => r.id === repId) ?? hit;
    }
  }

  if (!selectedRound && roundList.length > 0) {
    const todayHit = roundList.find((r) => toYyyyMmDd(r.round_date) === today);
    const seed = todayHit ?? roundList.find((r) => r.round_no === 1) ?? roundList[0];
    if (seed) {
      const repId = representativeRoundId(roundList as SessionRoundFields[], seed.id);
      selectedRound = roundList.find((r) => r.id === repId) ?? seed;
    }
  }

  if (selectedRound) {
    await requireTournamentAccess({
      tournamentId: selectedRound.tournament_id,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
      ],
    });
  }

  let player: PlayerRow | null = null;
  let holes: HoleRow[] = buildDefaultHoles();
  let existingScores: Record<number, number> = {};
  let capturedRounds: CapturedRoundRow[] = [];
  let errorMsg = "";
  let ambiguousCandidates: ValidEntryRow[] = [];

  if (selectedRound) {
    const { data: holesData, error: holesErr } = await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", selectedRound.tournament_id)
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

  let scoringRoundId = selectedRound?.id ?? "";

  if (selectedRound && searchRaw) {
    const isNumeric = /^\d+$/.test(searchRaw);

    let entryRows: EntryJoinRow[] = [];
    let entryErr: PostgrestError | null = null;

    if (isNumeric) {
      const wanted = Number(searchRaw);
      const { data, error } = await supabase
        .from("tournament_entries")
        .select(ENTRY_SELECT_FOR_LOOKUP)
        .eq("tournament_id", selectedRound.tournament_id)
        .eq("player_number", wanted);
      entryErr = error;
      entryRows = (data ?? []) as unknown as EntryJoinRow[];

      if (!error && entryRows.length === 0) {
        const full = await fetchAllTournamentEntriesForLookup(
          supabase,
          selectedRound.tournament_id
        );
        entryErr = full.error;
        entryRows = full.rows;
      }
    } else {
      const full = await fetchAllTournamentEntriesForLookup(
        supabase,
        selectedRound.tournament_id
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

    scoringRoundId = resolveScoringRoundId(
      roundList,
      selectedRound,
      matchedEntry ? String(matchedEntry.category_id ?? "").trim() || null : null
    );

    if (player) {
        const allRoundIds = roundListAll
        .filter((r) => r.tournament_id === selectedRound.tournament_id)
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
            .select("hole_number, strokes")
            .eq("round_score_id", selectedRoundScore.id)
            .order("hole_number", { ascending: true });

          if (holeScoreErr) {
            errorMsg = holeScoreErr.message;
          } else {
            for (const row of (holeScoreData ?? []) as HoleScoreRow[]) {
              existingScores[row.hole_number] = Number(row.strokes ?? 0);
            }
          }
        }

        if (roundScores.length > 0) {
          const roundScoreIds = roundScores.map((x) => x.id);

          const { data: allHoleScores, error: allHoleScoresErr } = await supabase
            .from("hole_scores")
            .select("round_score_id, hole_number, strokes")
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
              hole_number: number;
              strokes: number | null;
            }>) {
              const entry = byRoundScoreId.get(row.round_score_id);
              if (!entry) continue;
              entry.scores[row.hole_number] = Number(row.strokes ?? 0);
            }

            capturedRounds = roundScores
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
              .filter(Boolean)
              .sort((a, b) => a!.round_no - b!.round_no) as CapturedRoundRow[];
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

        {roundsMissingDate && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {se.roundsNeedDate}
          </div>
        )}

        <form className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            type="hidden"
            name="tournament_id"
            value={selectedRound?.tournament_id ?? tournamentIdFromQuery}
          />

          <div className="grid gap-4 md:grid-cols-[1fr_260px_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {se.labelSession}
              </label>
              <select
                name="round_id"
                defaultValue={selectedRound?.id ?? ""}
                className="w-full min-w-[min(100%,16rem)] max-w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-black"
              >
                {sessionBlocks.length > 0
                  ? sessionBlocks.map((block) => {
                      const rep = block[0];
                      if (!rep) return null;
                      return (
                        <option key={rep.id} value={rep.id}>
                          {formatSessionDayWaveLabel(rep)}
                        </option>
                      );
                    })
                  : roundList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatSessionDayWaveLabel(
                          r as unknown as SessionRoundFields
                        )}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Número de inscripción o nombre
              </label>
              <input
                id="score-entry-player-search"
                key={`score-entry-q-${searchRaw || ""}`}
                type="text"
                name="q"
                defaultValue={searchRaw}
                placeholder="25 o Mario"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-black placeholder:text-gray-400"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
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

        {selectedRound &&
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
                  qs.set("tournament_id", selectedRound.tournament_id);
                  qs.set("round_id", requestedRoundId || selectedRound.id);
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

        {selectedRound &&
          searchRaw &&
          !player &&
          !errorMsg &&
          ambiguousCandidates.length === 0 && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            {se.searchNotFound.replace("{q}", searchRaw)}
          </div>
        )}

        {selectedRound && player && holes.length > 0 && (
          <ScoreEntryClient
            roundId={scoringRoundId}
            tournamentDayId={null}
            player={player}
            holes={holes}
            existingScores={existingScores}
            capturedRounds={capturedRounds}
            selectedRoundNo={
              roundListAll.find((r) => r.id === scoringRoundId)?.round_no ??
              selectedRound.round_no
            }
          />
        )}
      </div>
    </div>
  );
}