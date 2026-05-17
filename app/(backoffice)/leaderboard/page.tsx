import { createClient } from "@/utils/supabase/server";
import { unstable_noStore as noStore } from "next/cache";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import LeaderboardTournamentEmbed from "./LeaderboardTournamentEmbed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
};

export default async function LeaderboardPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  noStore();
  const locale = await getLocale();
  const leaderboardTitle = messages[locale].leaderboard.title;
  const pub = messages[locale].publicTournament;

  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const requestedTournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const requestedView =
    typeof sp.view === "string" ? sp.view.trim().toLowerCase() : "official";

  const view =
    requestedView === "live"
      ? "live"
      : requestedView === "favorites"
        ? "favorites"
        : requestedView === "tee-sheet" || requestedView === "salidas"
          ? "tee-sheet"
          : "official";

  const categoryId =
    typeof sp.category_id === "string" ? sp.category_id.trim() : "";
  const roundId = typeof sp.round_id === "string" ? sp.round_id.trim() : "";
  const detailId =
    typeof sp.detail_id === "string" ? sp.detail_id.trim() : "";

  const { data: tournamentsData, error: tournamentsErr } = await supabase
    .from("tournaments")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });

  if (tournamentsErr) {
    return (
      <div className="p-3 text-xs text-red-300">
        Error cargando torneos: {tournamentsErr.message}
      </div>
    );
  }

  const tournaments = (tournamentsData ?? []) as TournamentRow[];

  if (tournaments.length === 0) {
    return (
      <div className="p-3">
        <h1 className="text-lg font-bold text-white">{leaderboardTitle}</h1>
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
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
      <div className="p-3 text-xs text-red-300">
        No se pudo determinar el torneo seleccionado.
      </div>
    );
  }

  return (
    <div className="-mx-4 max-w-none space-y-3 md:mx-auto md:max-w-[1600px]">
      <div className="flex flex-col gap-3 px-4 md:flex-row md:items-end md:justify-between md:px-0">
        <div>
          <h1 className="text-xl font-bold text-white">{leaderboardTitle}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Vista pública integrada: Live, Oficial, Salidas y Favoritos sin salir
            del sistema.
          </p>
        </div>

        <form className="flex w-full flex-col gap-2 rounded-lg border border-white/10 bg-[#141c26] p-3 sm:flex-row sm:flex-wrap sm:items-end">
          {categoryId ? (
            <input type="hidden" name="category_id" value={categoryId} />
          ) : null}
          {roundId ? <input type="hidden" name="round_id" value={roundId} /> : null}

          <div className="w-full min-w-0 flex-1 space-y-1 sm:min-w-[200px]">
            <label className="block text-xs font-medium text-slate-300">
              Torneo
            </label>
            <select
              name="tournament_id"
              defaultValue={selectedTournament.id}
              className="h-9 w-full rounded-md border border-white/15 bg-[#0c1728] px-2 text-sm text-white"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? "Sin nombre"}
                  {t.status ? ` · ${t.status}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full space-y-1 sm:w-auto">
            <label className="block text-xs font-medium text-slate-300">
              Vista inicial
            </label>
            <select
              name="view"
              defaultValue={view}
              className="h-9 rounded-md border border-white/15 bg-[#0c1728] px-2 text-sm text-white"
            >
              <option value="official">{pub.leaderboard}</option>
              <option value="live">{pub.live}</option>
              <option value="tee-sheet">{pub.teeSheet}</option>
              <option value="favorites">{pub.favorites}</option>
            </select>
          </div>

          <button
            type="submit"
            className="h-11 w-full rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 sm:h-9 sm:w-auto"
          >
            Cargar
          </button>
        </form>
      </div>

      {activeTournaments.length > 1 && !requestedTournamentId ? (
        <p className="px-4 text-xs text-amber-200/90 md:px-0">
          Hay {activeTournaments.length} torneos activos. Se mostró el más reciente;
          cámbialo arriba si necesitas otro.
        </p>
      ) : null}

      <div className="px-0 md:px-0">
      <LeaderboardTournamentEmbed
        tournamentId={selectedTournament.id}
        tournamentName={selectedTournament.name}
        view={view}
        categoryId={categoryId}
        roundId={roundId}
        detailId={detailId}
      />
      </div>
    </div>
  );
}
