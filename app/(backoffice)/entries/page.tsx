import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import SinglePlayerEntryPanel from "./SinglePlayerEntryPanel";
import BulkEntryPanel from "./BulkEntryPanel";
import EntriesListPanel from "./EntriesListPanel";
import EntriesSummaryPanel from "./EntriesSummaryPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  club: string | null;
};

type EntryRow = {
  id: string;
  player_id: string;
  handicap_index: number | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    club: string | null;
  };
  categories: {
    code: string | null;
    name: string | null;
  } | null;
};

const tabBaseClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border px-3 text-[11px] font-medium";
const tabIdleClass =
  `${tabBaseClass} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const tabActiveClass =
  `${tabBaseClass} border-blue-700 bg-blue-700 text-white`;

export default async function EntriesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const view = typeof sp.view === "string" ? sp.view.trim() : "single";
  const tournament_id =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { data: tournaments, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-base font-semibold text-white">
          Inscripciones
        </h1>
        <p className="text-xs text-red-200">
          Error cargando torneos: {tErr.message}
        </p>
      </div>
    );
  }

  if (!tournaments || tournaments.length === 0) {
    return (
      <div className="space-y-2 p-3">
        <h1 className="text-base font-semibold text-white">
          Inscripciones
        </h1>

        <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-yellow-900">
          <div className="text-xs font-semibold">
            Primero necesitas crear un torneo
          </div>

          <div className="mt-1 text-xs leading-5">
            Todavía no existe ningún torneo. Crea uno primero y después podrás
            inscribir jugadores.
          </div>

          <div className="mt-2">
            <a
              href="/tournaments/new"
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-gray-700 bg-gray-700 px-3 text-[11px] font-semibold text-white shadow"
            >
              Ir a nuevo torneo
            </a>
          </div>
        </div>
      </div>
    );
  }

  const typedTournaments = (tournaments ?? []) as Tournament[];
  const effectiveTournamentId = tournament_id || (typedTournaments[0]?.id ?? "");

  if (!tournament_id && effectiveTournamentId) {
    redirect(
      `/entries?view=${encodeURIComponent(view)}&tournament_id=${effectiveTournamentId}`
    );
  }

  await requireTournamentAccess({
    tournamentId: effectiveTournamentId,
    allowedRoles: [
      "super_admin",
      "club_admin",
      "tournament_director",
      "checkin",
    ],
  });

  const { data: players, error: pErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, gender, handicap_index, club")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (pErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-base font-semibold text-white">
          Inscripciones
        </h1>
        <p className="text-xs text-red-200">
          Error cargando players: {pErr.message}
        </p>
      </div>
    );
  }

  const { data: rawEntries, error: eErr } = await supabase
    .from("tournament_entries")
    .select(
      `
      id,
      player_id,
      handicap_index,
      players:players (
        first_name,
        last_name,
        club
      ),
      categories:categories (
        code,
        name
      )
    `
    )
    .eq("tournament_id", effectiveTournamentId)
    .order("created_at", { ascending: true });

  if (eErr) {
    return (
      <div className="p-3">
        <h1 className="mb-1 text-base font-semibold text-white">
          Inscripciones
        </h1>
        <p className="text-xs text-red-200">
          Error cargando inscritos: {eErr.message}
        </p>
      </div>
    );
  }

  const typedPlayers = (players ?? []) as Player[];
  const typedEntries = (rawEntries ?? []) as EntryRow[];

  const enrolledPlayerIds = new Set(typedEntries.map((e) => e.player_id));
  const availablePlayers = typedPlayers.filter(
    (p) => !enrolledPlayerIds.has(p.id)
  );

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-3">
        <div className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-end">
          <div className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">
            Inscripciones
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_auto] xl:justify-end">
            <form
              action="/entries"
              method="GET"
              className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end"
            >
              <input type="hidden" name="view" value={view} />

              <div className="grid gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/80">
                  Torneo
                </label>
                <select
                  name="tournament_id"
                  defaultValue={effectiveTournamentId}
                  className="h-8 min-w-[240px] rounded-md border border-gray-300 bg-white px-2.5 text-[12px] text-black"
                >
                  {typedTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Torneo ${t.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-gray-700 bg-gray-700 px-3 text-[11px] font-medium text-white shadow-sm hover:bg-gray-800"
              >
                Cambiar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <a
                href={`/entries?view=single&tournament_id=${effectiveTournamentId}`}
                className={view === "single" ? tabActiveClass : tabIdleClass}
              >
                Nuevo jugador
              </a>

              <a
                href={`/entries?view=bulk&tournament_id=${effectiveTournamentId}`}
                className={view === "bulk" ? tabActiveClass : tabIdleClass}
              >
                Masivo
              </a>

              <a
                href={`/entries?view=list&tournament_id=${effectiveTournamentId}`}
                className={view === "list" ? tabActiveClass : tabIdleClass}
              >
                Inscritos
              </a>

              <a
                href={`/entries?view=summary&tournament_id=${effectiveTournamentId}`}
                className={view === "summary" ? tabActiveClass : tabIdleClass}
              >
                Resumen
              </a>
            </div>
          </div>
        </div>
      </div>

      {view === "single" && (
        <SinglePlayerEntryPanel
          tournamentId={effectiveTournamentId}
          players={availablePlayers}
        />
      )}

      {view === "bulk" && (
        <BulkEntryPanel
          tournamentId={effectiveTournamentId}
          players={availablePlayers}
        />
      )}

      {view === "list" && (
        <EntriesListPanel
          entries={typedEntries}
          tournamentId={effectiveTournamentId}
        />
      )}

      {view === "summary" && <EntriesSummaryPanel entries={typedEntries} />}
    </div>
  );
}