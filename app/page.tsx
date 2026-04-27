import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

type SearchParams = Promise<{
  club?: string | string[];
  status?: string | string[];
}>;

type TournamentRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  poster_path: string | null;
  club_id: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
};

type TournamentCard = TournamentRow & {
  club_label: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(date: string | null) {
  if (!date) return "Fecha por definir";

  return new Date(date).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildPosterUrl(posterPath: string | null) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!posterPath || !baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/tournament-posters/${posterPath}`;
}

function getTournamentStatusValue(startDate: string | null) {
  if (!startDate) return "undefined";

  const today = new Date();
  const target = new Date(startDate);

  return target > today ? "upcoming" : "finished";
}

function getTournamentStatus(startDate: string | null) {
  if (!startDate) {
    return {
      label: "Por definir",
      className: "bg-slate-600 text-white",
    };
  }

  const today = new Date();
  const target = new Date(startDate);

  if (target > today) {
    return {
      label: "Próximo",
      className: "bg-cyan-400 text-[#08111f]",
    };
  }

  return {
    label: "Finalizado",
    className: "bg-slate-600 text-white",
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedClub = firstValue(params.club).trim();
  const selectedStatus = firstValue(params.status).trim();

  const supabase = await createClient();

  const { data: tournamentsData, error: tournamentsError } = await supabase
    .from("tournaments")
    .select("id,name,start_date,poster_path,club_id")
    .eq("is_public", true)
    .eq("is_archived", false);

  if (tournamentsError) {
    throw new Error(
      `Error leyendo torneos públicos: ${tournamentsError.message}`
    );
  }

  const tournamentRows = (tournamentsData ?? []) as TournamentRow[];

  const clubIds = Array.from(
    new Set(
      tournamentRows
        .map((item) => item.club_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let clubsMap = new Map<string, ClubRow>();

  if (clubIds.length > 0) {
    const { data: clubsData, error: clubsError } = await supabase
      .from("clubs")
      .select("id,name,short_name")
      .in("id", clubIds);

    if (clubsError) {
      throw new Error(`Error leyendo clubs: ${clubsError.message}`);
    }

    clubsMap = new Map(
      ((clubsData ?? []) as ClubRow[]).map((clubItem) => [
        clubItem.id,
        clubItem,
      ])
    );
  }

  const allTournaments: TournamentCard[] = tournamentRows.map((item) => {
    const clubRow = item.club_id ? clubsMap.get(item.club_id) : null;

    return {
      ...item,
      club_label:
        clubRow?.short_name?.trim() || clubRow?.name?.trim() || null,
    };
  });

  const tournaments = allTournaments
    .filter((item) => {
      if (selectedClub && item.club_id !== selectedClub) return false;
      if (selectedStatus && getTournamentStatusValue(item.start_date) !== selectedStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aHasPoster = a.poster_path ? 1 : 0;
      const bHasPoster = b.poster_path ? 1 : 0;

      if (aHasPoster !== bHasPoster) {
        return bHasPoster - aHasPoster;
      }

      const aTime = a.start_date
        ? new Date(a.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bTime = b.start_date
        ? new Date(b.start_date).getTime()
        : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    });

  const availableClubs = Array.from(
    new Map(
      allTournaments
        .map((item) => {
          if (!item.club_id || !item.club_label) return null;

          return [
            item.club_id,
            {
              id: item.club_id,
              label: item.club_label,
            },
          ] as const;
        })
        .filter(Boolean) as [string, { id: string; label: string }][]
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label, "es-MX"));

  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      <section className="border-b border-white/10 bg-[#08111f]">
        <div className="mx-auto max-w-[1700px] px-4 py-4">
          <form
            method="GET"
            action="/"
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="mr-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Torneos públicos
              </h1>
              <p className="text-xs text-slate-400">Posters públicos</p>
            </div>

            <select
              name="club"
              defaultValue={selectedClub}
              className="h-10 rounded-lg border border-white/10 bg-[#0c1728] px-3 text-sm"
            >
              <option value="">Todos los clubs</option>
              {availableClubs.map((clubItem) => (
                <option key={clubItem.id} value={clubItem.id}>
                  {clubItem.label}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={selectedStatus}
              className="h-10 rounded-lg border border-white/10 bg-[#0c1728] px-3 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="upcoming">Próximos</option>
              <option value="finished">Finalizados</option>
            </select>

            <button
              type="submit"
              className="h-10 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-[#08111f] transition hover:bg-cyan-300"
            >
              Buscar
            </button>

            <Link
              href="/"
              className="flex h-10 items-center rounded-lg border border-white/10 px-4 text-sm transition hover:border-cyan-400/40 hover:bg-white/5"
            >
              Todos
            </Link>

            <div className="ml-auto rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold">
              {tournaments.length} torneo{tournaments.length === 1 ? "" : "s"}
            </div>
          </form>
        </div>
      </section>

      <section className="bg-[#0b1526]">
        <div className="mx-auto max-w-[1700px] px-4 py-5">
          {tournaments.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
              No hay torneos.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {tournaments.map((t) => {
                const posterUrl = buildPosterUrl(t.poster_path);
                const status = getTournamentStatus(t.start_date);

                return (
                  <Link
                    key={t.id}
                    href={`/torneos/${t.id}`}
                    className="group block overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-cyan-400/40"
                  >
                    <div className="relative h-[220px] bg-black">
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={`Poster de ${t.name ?? "torneo"}`}
                          className="absolute inset-0 h-full w-full bg-black object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
                          Sin poster
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-2.5">
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-300">
                              {t.club_label ?? "Sin club"}
                            </div>
                            <div className="mt-1 truncate text-xs font-semibold text-white">
                              {t.name ?? "Torneo"}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-300">
                              {formatDate(t.start_date)}
                            </div>
                          </div>

                          <div
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${status.className}`}
                          >
                            {status.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
