import { createClient } from "@/utils/supabase/server";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
};

type RoundRow = {
  id: string;
  tournament_id: string;
  round_no: number;
};

type EntryRow = {
  player_id: string;
  category_id: string | null;
};

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap_index: number | null;
};

type CategoryRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type RoundScoreRow = {
  player_id: string;
  round_id: string;
  gross_score: number | null;
};

type LeaderboardRow = {
  pos: number;
  player_id: string;
  player_number: number | null;
  name: string;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  handicap_torneo: number | null;
  rounds_played: number;
  total_gross: number;
  round_scores: Record<number, number>;
};

type CategoryTable = {
  key: string;
  category_id: string | null;
  label: string;
  rows: LeaderboardRow[];
};

function toName(p: {
  first_name: string | null;
  last_name: string | null;
}) {
  return [p.first_name ?? "", p.last_name ?? ""].join(" ").trim() || "Jugador sin nombre";
}

function numOrNull(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compareLeaderboard(a: LeaderboardRow, b: LeaderboardRow) {
  if (a.total_gross !== b.total_gross) return a.total_gross - b.total_gross;
  if (a.rounds_played !== b.rounds_played) return b.rounds_played - a.rounds_played;
  return a.name.localeCompare(b.name, "es");
}

function withPositions(rows: Omit<LeaderboardRow, "pos">[]): LeaderboardRow[] {
  const sorted = [...rows].sort(compareLeaderboard);

  let lastScore: number | null = null;
  let lastPos = 0;

  return sorted.map((row, idx) => {
    const currentPos = row.total_gross === lastScore ? lastPos : idx + 1;
    lastScore = row.total_gross;
    lastPos = currentPos;
    return { ...row, pos: currentPos };
  });
}

function categoryLabel(row: { category_code: string | null; category_name: string | null }) {
  if (row.category_code && row.category_name) {
    return `${row.category_code} · ${row.category_name}`;
  }
  if (row.category_code) return row.category_code;
  if (row.category_name) return row.category_name;
  return "Sin categoría";
}

function renderTable(title: string, rows: LeaderboardRow[], rounds: RoundRow[]) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-2 py-1.5 text-[11px] font-semibold leading-none text-gray-800">
        {title}
      </div>

      <table className="w-full border-collapse text-[11px] leading-none">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-1.5 py-1 text-left font-semibold">Pos</th>
            <th className="px-1.5 py-1 text-left font-semibold">#</th>
            <th className="px-1.5 py-1 text-left font-semibold">Jugador</th>
            <th className="px-1.5 py-1 text-left font-semibold">Cat</th>
            <th className="px-1.5 py-1 text-center font-semibold">HCP</th>

            {rounds.map((r) => (
              <th key={r.id} className="px-1.5 py-1 text-center font-semibold">
                R{r.round_no}
              </th>
            ))}

            <th className="px-1.5 py-1 text-center font-semibold">Rds</th>
            <th className="px-1.5 py-1 text-center font-semibold">Total</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.player_id}`} className="border-t border-gray-100">
              <td className="px-1.5 py-[3px] font-semibold">{row.pos}</td>
              <td className="px-1.5 py-[3px]">{row.player_number ?? "-"}</td>
              <td className="px-1.5 py-[3px] whitespace-nowrap">{row.name}</td>
              <td className="px-1.5 py-[3px]">{row.category_code ?? "-"}</td>
              <td className="px-1.5 py-[3px] text-center">{row.handicap_torneo ?? "-"}</td>

              {rounds.map((r) => (
                <td key={r.id} className="px-1.5 py-[3px] text-center">
                  {row.round_scores[r.round_no] ?? ""}
                </td>
              ))}

              <td className="px-1.5 py-[3px] text-center">{row.rounds_played}</td>
              <td className="px-1.5 py-[3px] text-center font-bold">{row.total_gross}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LeaderboardPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  noStore();

  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const requestedTournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const selectedView =
    typeof sp.category_view === "string" ? sp.category_view.trim() : "general";

  const { data: tournamentsData, error: tournamentsErr } = await supabase
    .from("tournaments")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });

  if (tournamentsErr) {
    return (
      <div className="p-3 text-xs text-red-700">
        Error cargando torneos: {tournamentsErr.message}
      </div>
    );
  }

  const tournaments = (tournamentsData ?? []) as TournamentRow[];

  if (tournaments.length === 0) {
    return (
      <div className="p-3">
        <h1 className="text-lg font-bold leading-none text-gray-900">Leaderboard</h1>
        <div className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          No hay torneos creados.
        </div>
      </div>
    );
  }

  const activeTournaments = tournaments
    .filter((t) => (t.status ?? "").toLowerCase() === "active")
    .sort((a, b) => {
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });

  let selectedTournament: TournamentRow | null = null;

  if (requestedTournamentId) {
    selectedTournament =
      tournaments.find((t) => t.id === requestedTournamentId) ?? null;
  }

  if (!selectedTournament) {
    selectedTournament = activeTournaments[0] ?? tournaments[0] ?? null;
  }

  if (!selectedTournament) {
    return (
      <div className="p-3 text-xs text-red-700">
        No se pudo determinar el torneo seleccionado.
      </div>
    );
  }

  const { data: roundsData, error: roundsErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, round_no")
    .eq("tournament_id", selectedTournament.id)
    .order("round_no", { ascending: true });

  if (roundsErr) {
    return (
      <div className="p-3 text-xs text-red-700">
        Error cargando rondas: {roundsErr.message}
      </div>
    );
  }

  const rounds = (roundsData ?? []) as RoundRow[];
  const roundIds = rounds.map((r) => r.id);

  const { data: entriesData, error: entriesErr } = await supabase
    .from("tournament_entries")
    .select("player_id, category_id")
    .eq("tournament_id", selectedTournament.id);

  if (entriesErr) {
    return (
      <div className="p-3 text-xs text-red-700">
        Error cargando inscritos: {entriesErr.message}
      </div>
    );
  }

  const entries = (entriesData ?? []) as EntryRow[];
  const playerIds = Array.from(new Set(entries.map((e) => e.player_id)));
  const categoryIds = Array.from(
    new Set(entries.map((e) => e.category_id).filter(Boolean) as string[])
  );

  let players: PlayerRow[] = [];
  if (playerIds.length > 0) {
    const { data: playersData, error: playersErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, handicap_index")
      .in("id", playerIds);

    if (playersErr) {
      return (
        <div className="p-3 text-xs text-red-700">
          Error cargando jugadores: {playersErr.message}
        </div>
      );
    }

    players = (playersData ?? []) as PlayerRow[];
  }

  let categories: CategoryRow[] = [];
  if (categoryIds.length > 0) {
    const { data: categoriesData, error: categoriesErr } = await supabase
      .from("categories")
      .select("id, code, name")
      .in("id", categoryIds);

    if (categoriesErr) {
      return (
        <div className="p-3 text-xs text-red-700">
          Error cargando categorías: {categoriesErr.message}
        </div>
      );
    }

    categories = (categoriesData ?? []) as CategoryRow[];
  }

  let roundScores: RoundScoreRow[] = [];
  if (roundIds.length > 0) {
    const { data: scoresData, error: scoresErr } = await supabase
      .from("round_scores")
      .select("player_id, round_id, gross_score")
      .in("round_id", roundIds);

    if (scoresErr) {
      return (
        <div className="p-3 text-xs text-red-700">
          Error cargando scores: {scoresErr.message}
        </div>
      );
    }

    roundScores = (scoresData ?? []) as RoundScoreRow[];
  }

  const playersById = new Map<string, PlayerRow>();
  for (const p of players) playersById.set(p.id, p);

  const categoriesById = new Map<string, CategoryRow>();
  for (const c of categories) categoriesById.set(c.id, c);

  const roundNoById = new Map<string, number>();
  for (const r of rounds) roundNoById.set(r.id, r.round_no);

  const scoresByPlayer = new Map<
    string,
    {
      total_gross: number;
      rounds_played: number;
      round_scores: Record<number, number>;
    }
  >();

  for (const rs of roundScores) {
    const gross = numOrNull(rs.gross_score);
    if (gross == null) continue;

    const roundNo = roundNoById.get(rs.round_id);
    if (!roundNo) continue;

    const current = scoresByPlayer.get(rs.player_id) ?? {
      total_gross: 0,
      rounds_played: 0,
      round_scores: {},
    };

    current.total_gross += gross;
    current.rounds_played += 1;
    current.round_scores[roundNo] = gross;

    scoresByPlayer.set(rs.player_id, current);
  }

  const overallBase: Omit<LeaderboardRow, "pos">[] = entries.map((entry) => {
    const player = playersById.get(entry.player_id);
    const category = entry.category_id
      ? categoriesById.get(entry.category_id)
      : null;
    const agg = scoresByPlayer.get(entry.player_id);

    return {
      player_id: entry.player_id,
      player_number: null,
      name: player ? toName(player) : "Jugador sin nombre",
      category_id: entry.category_id,
      category_code: category?.code ?? null,
      category_name: category?.name ?? null,
      handicap_torneo: player?.handicap_index ?? null,
      rounds_played: agg?.rounds_played ?? 0,
      total_gross: agg?.total_gross ?? 0,
      round_scores: agg?.round_scores ?? {},
    };
  });

  const scoredBase = overallBase.filter((x) => x.rounds_played > 0);
  const overallRows = withPositions(scoredBase);

  const categoryGroups = new Map<string, Omit<LeaderboardRow, "pos">[]>();

  for (const row of scoredBase) {
    const key = row.category_id ?? "sin-categoria";
    const arr = categoryGroups.get(key) ?? [];
    arr.push(row);
    categoryGroups.set(key, arr);
  }

  const categoryTables: CategoryTable[] = Array.from(categoryGroups.entries())
    .map(([key, rows]) => {
      const first = rows[0];
      return {
        key,
        category_id: first?.category_id ?? null,
        label: categoryLabel(first ?? { category_code: null, category_name: null }),
        rows: withPositions(rows),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  const selectedCategoryTable =
    selectedView === "general" || selectedView === "all_categories"
      ? null
      : categoryTables.find((x) => x.category_id === selectedView) ?? null;

  return (
    <div className="p-2 md:p-3">
      <div className="mx-auto max-w-7xl space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-none text-gray-900">Leaderboard</h1>
            <p className="mt-1 text-[11px] leading-none text-gray-600">
              Torneo seleccionado:{" "}
              <span className="font-semibold">
                {selectedTournament.name ?? "Sin nombre"}
              </span>
              {selectedTournament.status ? (
                <span className="ml-1.5 inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-green-800">
                  {selectedTournament.status}
                </span>
              ) : null}
            </p>
          </div>

          <form className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
            <div className="grid gap-1.5 md:grid-cols-[240px_220px_auto] md:items-end">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium leading-none text-gray-700">
                  Seleccionar torneo
                </label>
                <select
                  name="tournament_id"
                  defaultValue={selectedTournament.id}
                  className="h-7 w-full rounded-md border border-gray-300 px-2 text-[11px] leading-none"
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name ?? "Sin nombre"}
                      {t.status ? ` · ${t.status}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium leading-none text-gray-700">
                  Vista
                </label>
                <select
                  name="category_view"
                  defaultValue={selectedView}
                  className="h-7 w-full rounded-md border border-gray-300 px-2 text-[11px] leading-none"
                >
                  <option value="general">General</option>
                  <option value="all_categories">Todas las categorías</option>
                  {categoryTables.map((cat) => (
                    <option key={cat.key} value={cat.category_id ?? "sin-categoria"}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="h-7 rounded-md bg-gray-900 px-3 text-[11px] font-semibold leading-none text-white"
              >
                Ver
              </button>
            </div>
          </form>
        </div>

        {activeTournaments.length > 1 && !requestedTournamentId && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] leading-snug text-yellow-800">
            Hay {activeTournaments.length} torneos activos. Se mostró automáticamente
            el más reciente. Puedes cambiarlo en el selector.
          </div>
        )}

        {overallRows.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] leading-snug text-yellow-800">
            Este torneo todavía no tiene scores capturados para mostrar en el leaderboard.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedView === "general" &&
              renderTable("Ranking general", overallRows, rounds)}

            {selectedView === "all_categories" &&
              categoryTables.map((group) => (
                <div key={group.key}>
                  {renderTable(`Ranking categoría: ${group.label}`, group.rows, rounds)}
                </div>
              ))}

            {selectedView !== "general" &&
              selectedView !== "all_categories" &&
              selectedCategoryTable &&
              renderTable(
                `Ranking categoría: ${selectedCategoryTable.label}`,
                selectedCategoryTable.rows,
                rounds
              )}

            {selectedView !== "general" &&
              selectedView !== "all_categories" &&
              !selectedCategoryTable && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] leading-snug text-yellow-800">
                  No encontré esa categoría para este torneo.
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
