import { createClient } from "@/utils/supabase/server";
import HeaderBar from "@/components/ui/HeaderBar";
import SinglePlayerEntryPanel from "./SinglePlayerEntryPanel";
import BulkEntryPanel from "./BulkEntryPanel";
import EntriesListPanel from "./EntriesListPanel";
import EntriesSummaryPanel from "./EntriesSummaryPanel";
import EnrollExcelButton from "./EnrollExcelButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tournament = {
  id: string;
  name: string | null;
  status: string | null;
};

type Category = {
  id: string;
  code: string | null;
  name: string | null;
};

type ClubRef = {
  name: string | null;
  short_name: string | null;
};

type PlayerBase = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  clubs: ClubRef | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  club_label: string | null;
};

type EntryRowBase = {
  id: string;
  player_id: string;
  handicap_index: number | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    email?: string | null;
    clubs: ClubRef | null;
  } | null;
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

type EntryRow = {
  id: string;
  player_id: string;
  handicap_index: number | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    club_label: string | null;
    email?: string | null;
  } | null;
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

type EntriesTab = "manual" | "bulk" | "entries" | "summary";

function normalizeClubLabel(value: string | null | undefined) {
  const v = value?.trim();
  return v ? v : null;
}

function clubLabelFromClub(club: ClubRef | null | undefined) {
  return normalizeClubLabel(club?.short_name ?? club?.name ?? null);
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

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const requestedTournamentId =
    typeof params.tournament_id === "string" ? params.tournament_id : "";
  const activeTab = normalizeTab(params.tab);

  const supabase = await createClient();

  const [tournamentsRes, playersRes, categoriesRes] = await Promise.all([
    supabase.from("tournaments").select("id, name, status").order("name"),
    supabase
      .from("players")
      .select(`
        id,
        first_name,
        last_name,
        gender,
        handicap_index,
        clubs:clubs (
          name,
          short_name
        )
      `)
      .order("last_name")
      .order("first_name"),
    supabase
      .from("categories")
      .select("id, code, name, tournament_id")
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

  const categories = ((categoriesRes.data ?? []) as Array<
    Category & { tournament_id?: string | null }
  >)
    .filter((c) => !selectedTournamentId || c.tournament_id === selectedTournamentId)
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
    }));

  const players: Player[] = ((playersRes.data ?? []) as PlayerBase[]).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    gender: p.gender,
    handicap_index: p.handicap_index,
    club_label: clubLabelFromClub(p.clubs),
  }));

  let entries: EntryRow[] = [];

  if (selectedTournamentId) {
    const entriesRes = await supabase
      .from("tournament_entries")
      .select(`
        id,
        player_id,
        handicap_index,
        players:players (
          first_name,
          last_name,
          email,
          clubs:clubs (
            name,
            short_name
          )
        ),
        categories:categories (
          code,
          name
        )
      `)
      .eq("tournament_id", selectedTournamentId)
      .order("created_at", { ascending: false });

    if (entriesRes.error) {
      throw new Error(`Error leyendo tournament_entries: ${entriesRes.error.message}`);
    }

    entries = ((entriesRes.data ?? []) as EntryRowBase[]).map((e) => ({
      id: e.id,
      player_id: e.player_id,
      handicap_index: e.handicap_index,
      players: e.players
        ? {
            first_name: e.players.first_name,
            last_name: e.players.last_name,
            email: e.players.email ?? null,
            club_label: clubLabelFromClub(e.players.clubs),
          }
        : null,
      categories: e.categories
        ? {
            code: e.categories.code,
            name: e.categories.name,
          }
        : null,
    }));
  }

  return (
    <main className="space-y-2 p-2">
      <HeaderBar title="Entries">
        <div className="flex flex-wrap items-center gap-1">
          {selectedTournamentId ? (
            <EnrollExcelButton tournament_id={selectedTournamentId} />
          ) : null}
        </div>
      </HeaderBar>

      <section className="rounded border border-gray-300 bg-white p-1.5 shadow-sm">
        <form className="flex flex-wrap items-end gap-1.5" action="/entries">
          <input type="hidden" name="tab" value={activeTab} />

          <div className="grid gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.03em] text-gray-600">
              Torneo
            </label>
            <select
              name="tournament_id"
              defaultValue={selectedTournamentId}
              className="h-7 min-w-[260px] rounded border border-gray-300 bg-white px-2 text-[11px] text-black"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? "Sin nombre"}
                  {t.status ? ` (${t.status})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex min-h-7 items-center justify-center rounded border border-gray-700 bg-gray-700 px-2.5 text-[11px] font-medium leading-none text-white shadow-sm hover:bg-gray-800"
          >
            Cargar
          </button>
        </form>
      </section>

      {selectedTournamentId ? (
        <>
          <section className="rounded border border-gray-300 bg-white p-1.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-1">
              <a
                href={tabHref(selectedTournamentId, "manual")}
                className={tabClasses(activeTab === "manual")}
              >
                Manual
              </a>

              <a
                href={tabHref(selectedTournamentId, "bulk")}
                className={tabClasses(activeTab === "bulk")}
              >
                Masiva
              </a>

              <a
                href={tabHref(selectedTournamentId, "entries")}
                className={tabClasses(activeTab === "entries")}
              >
                Inscritos
              </a>

              <a
                href={tabHref(selectedTournamentId, "summary")}
                className={tabClasses(activeTab === "summary")}
              >
                Resumen
              </a>
            </div>
          </section>

          {activeTab === "manual" ? (
            <SinglePlayerEntryPanel
              players={players}
              tournamentId={selectedTournamentId}
            />
          ) : null}

          {activeTab === "bulk" ? (
            <BulkEntryPanel
              players={players}
              tournamentId={selectedTournamentId}
            />
          ) : null}

          {activeTab === "entries" ? (
            <EntriesListPanel
              entries={entries}
              tournamentId={selectedTournamentId}
            />
          ) : null}

          {activeTab === "summary" ? (
            <EntriesSummaryPanel entries={entries} />
          ) : null}
        </>
      ) : (
        <section className="rounded border border-gray-300 bg-white p-3 text-[12px] text-gray-700 shadow-sm">
          No hay torneo seleccionado.
        </section>
      )}
    </main>
  );
}