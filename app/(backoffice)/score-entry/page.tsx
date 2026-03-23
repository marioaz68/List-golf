import { createClient } from "@/utils/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import ScoreEntryClient from "./ScoreEntryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
  tournament_id: string;
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

type EntryJoinRow = {
  player_id: string;
  handicap_index: number | null;
  player: {
    id: string;
    player_number: number | null;
    first_name: string | null;
    last_name: string | null;
    handicap_index: number | null;
  } | null;
};

type ValidEntryRow = {
  player_id: string;
  handicap_index: number | null;
  player: {
    id: string;
    player_number: number | null;
    first_name: string | null;
    last_name: string | null;
    handicap_index: number | null;
  };
};

function normalizeText(s: string) {
  return s.trim();
}

function playerFullName(p: {
  first_name: string | null;
  last_name: string | null;
}) {
  return [p.first_name ?? "", p.last_name ?? ""].join(" ").trim().toLowerCase();
}

function buildDefaultHoles(): HoleRow[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
  }));
}

function isValidEntry(row: EntryJoinRow): row is ValidEntryRow {
  return !!row.player?.id;
}

export default async function ScoreEntryPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  noStore();
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const searchRaw = typeof sp.q === "string" ? normalizeText(sp.q) : "";
  const requestedRoundId = typeof sp.round_id === "string" ? sp.round_id : "";
  const tournamentIdFromQuery =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const today = new Date().toISOString().slice(0, 10);

  const roundsQuery = supabase
    .from("rounds")
    .select("id, round_no, round_date, tournament_id")
    .order("round_no", { ascending: true });

  const { data: rounds, error: roundsErr } = tournamentIdFromQuery
    ? await roundsQuery.eq("tournament_id", tournamentIdFromQuery)
    : await roundsQuery;

  if (roundsErr) {
    return (
      <div className="p-6 text-sm text-red-700">
        Error cargando rondas: {roundsErr.message}
      </div>
    );
  }

  const roundList = (rounds ?? []) as RoundRow[];

  let selectedRound: RoundRow | null = null;

  if (requestedRoundId) {
    selectedRound = roundList.find((r) => r.id === requestedRoundId) ?? null;
  }

  if (!selectedRound) {
    selectedRound =
      roundList.find((r) => r.round_date === today) ??
      roundList.find((r) => r.round_no === 1) ??
      roundList[0] ??
      null;
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

  if (selectedRound && searchRaw) {
    const isNumeric = /^\d+$/.test(searchRaw);

    const { data: entryRows, error: entryErr } = await supabase
      .from("tournament_entries")
      .select(`
        player_id,
        handicap_index,
        player:players (
          id,
          player_number,
          first_name,
          last_name,
          handicap_index
        )
      `)
      .eq("tournament_id", selectedRound.tournament_id)
      .limit(isNumeric ? 25 : 200);

    if (entryErr) {
      errorMsg = entryErr.message;
    } else {
      const rawEntries = (entryRows ?? []) as EntryJoinRow[];
      const entries = rawEntries.filter(isValidEntry);

      if (isNumeric) {
        const wanted = Number(searchRaw);
        const found = entries.find(
          (row) =>
            row.player.player_number != null &&
            Number(row.player.player_number) === wanted
        );

        if (found) {
          player = {
            id: found.player.id,
            player_number: found.player.player_number,
            first_name: found.player.first_name,
            last_name: found.player.last_name,
            handicap_index: found.player.handicap_index,
            handicap_torneo: found.handicap_index,
          };
        }
      }

      if (!player) {
        const q = searchRaw.toLowerCase();

        const found = entries.find((row) => {
          const full = playerFullName(row.player);

          return (
            full.includes(q) ||
            (row.player.first_name ?? "").toLowerCase().includes(q) ||
            (row.player.last_name ?? "").toLowerCase().includes(q)
          );
        });

        if (found) {
          player = {
            id: found.player.id,
            player_number: found.player.player_number,
            first_name: found.player.first_name,
            last_name: found.player.last_name,
            handicap_index: found.player.handicap_index,
            handicap_torneo: found.handicap_index,
          };
        }
      }
    }

    if (player) {
      const allRoundIds = roundList
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
          (x) => x.round_id === selectedRound?.id
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
                const roundMeta = roundList.find((r) => r.id === rs.round_id);
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
        <h1 className="text-2xl font-bold text-gray-900">Captura de scores</h1>
        <p className="mt-1 text-sm text-gray-600">
          Captura rápida por número o nombre de jugador inscrito al torneo.
        </p>

        <form className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            type="hidden"
            name="tournament_id"
            value={selectedRound?.tournament_id ?? tournamentIdFromQuery}
          />

          <div className="grid gap-4 md:grid-cols-[1fr_260px_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Ronda
              </label>
              <select
                name="round_id"
                defaultValue={selectedRound?.id ?? ""}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {roundList.map((r) => (
                  <option key={r.id} value={r.id}>
                    Ronda {r.round_no}
                    {r.round_date ? ` · ${r.round_date}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Jugador # o nombre
              </label>
              <input
                type="text"
                name="q"
                defaultValue={searchRaw}
                placeholder="1 o Mario"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
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

        {selectedRound && searchRaw && !player && !errorMsg && (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            No encontré jugador inscrito con “{searchRaw}”.
          </div>
        )}

        {selectedRound && player && holes.length > 0 && (
          <ScoreEntryClient
            roundId={selectedRound.id}
            tournamentDayId={null}
            player={player}
            holes={holes}
            existingScores={existingScores}
            capturedRounds={capturedRounds}
            selectedRoundNo={selectedRound.round_no}
          />
        )}
      </div>
    </div>
  );
}