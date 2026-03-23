import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { saveTournamentHoles, seedTournamentHoles } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

type Tournament = {
  id: string;
  name: string | null;
};

type HoleRow = {
  hole_number: number;
  par: number;
  handicap_index: number | null;
};

function buildDefaultHoles(): HoleRow[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
  }));
}

export default async function TournamentHolesPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};

  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { data: tData, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (tErr) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-bold">Hoyos del torneo</h1>
        <p className="text-red-600">Error cargando torneos: {tErr.message}</p>
      </div>
    );
  }

  const tournaments: Tournament[] = (tData ?? []) as any[];
  const effectiveTournamentId = tournamentId || (tournaments[0]?.id ?? "");

  if (!tournamentId && effectiveTournamentId) {
    redirect(`/tournament-holes?tournament_id=${effectiveTournamentId}`);
  }

  let holes: HoleRow[] = buildDefaultHoles();
  let hasRealRows = false;
  let holesError = "";

  if (effectiveTournamentId) {
    const { data, error } = await supabase
      .from("tournament_holes")
      .select("hole_number, par, handicap_index")
      .eq("tournament_id", effectiveTournamentId)
      .order("hole_number", { ascending: true });

    if (error) {
      holesError = error.message;
    } else if (data && data.length > 0) {
      hasRealRows = true;
      holes = (data as any[]).map((r) => ({
        hole_number: Number(r.hole_number),
        par: Number(r.par),
        handicap_index:
          r.handicap_index == null ? null : Number(r.handicap_index),
      }));
    }
  }

  const tournamentLabel = (t: Tournament) =>
    (t.name ?? "").trim() || `Torneo ${t.id.slice(0, 8)}`;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hoyos del torneo</h1>
          <p className="text-sm opacity-80">
            Configura par y handicap de cada hoyo por torneo.
          </p>
        </div>
      </header>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Torneo</h2>

        {tournaments.length === 0 ? (
          <p className="text-red-600">No hay torneos. Crea uno primero.</p>
        ) : (
          <form
            method="GET"
            action="/tournament-holes"
            className="flex flex-wrap items-center gap-3"
          >
            <select
              name="tournament_id"
              defaultValue={effectiveTournamentId}
              className="rounded border px-3 py-2"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {tournamentLabel(t)}
                </option>
              ))}
            </select>

            <button className="rounded bg-black px-3 py-2 text-white">
              Cambiar torneo
            </button>

            <a className="ml-auto underline" href="/tournaments/new">
              + Nuevo torneo
            </a>
          </form>
        )}
      </section>

      {holesError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {holesError}
        </div>
      )}

      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Configuración de hoyos</h2>
            <p className="text-sm text-gray-600">
              Edita los 18 hoyos. Par entre 3 y 6. Handicap del hoyo entre 1 y
              18.
            </p>
          </div>

          {!hasRealRows && effectiveTournamentId && (
            <form action={seedTournamentHoles}>
              <input
                type="hidden"
                name="tournament_id"
                value={effectiveTournamentId}
              />
              <button className="rounded border px-3 py-2">
                Generar 18 hoyos base
              </button>
            </form>
          )}
        </div>

        <form action={saveTournamentHoles} className="space-y-4">
          <input type="hidden" name="tournament_id" value={effectiveTournamentId} />

          <div className="overflow-x-auto">
            <table className="min-w-[520px] w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="w-28 border p-2">Hoyo</th>
                  <th className="w-40 border p-2">Par</th>
                  <th className="w-48 border p-2">HCP hoyo</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h) => (
                  <tr key={h.hole_number}>
                    <td className="border p-2 font-medium">{h.hole_number}</td>
                    <td className="border p-2">
                      <input
                        name={`par_${h.hole_number}`}
                        type="number"
                        min="3"
                        max="6"
                        defaultValue={h.par}
                        className="w-full rounded border px-2 py-1"
                        required
                        disabled={!effectiveTournamentId}
                      />
                    </td>
                    <td className="border p-2">
                      <input
                        name={`hcp_${h.hole_number}`}
                        type="number"
                        min="1"
                        max="18"
                        defaultValue={h.handicap_index ?? ""}
                        className="w-full rounded border px-2 py-1"
                        required
                        disabled={!effectiveTournamentId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              className="rounded bg-black px-4 py-2 text-white"
              disabled={!effectiveTournamentId}
            >
              Guardar hoyos
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}