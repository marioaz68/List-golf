import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tournament = {
  id: string;
  name: string | null;
  status: string | null;
};

export default async function Home() {
  const supabase = await createClient();

  const [
    tournamentsRes,
    playersRes,
    entriesRes,
    categoriesRes,
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id,name,status")
      .order("name"),

    supabase
      .from("players")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("tournament_entries")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("categories")
      .select("id", { count: "exact", head: true }),
  ]);

  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const totalPlayers = playersRes.count ?? 0;
  const totalEntries = entriesRes.count ?? 0;
  const totalCategories = categoriesRes.count ?? 0;

  const statCard =
    "rounded-xl border border-white/20 bg-white/10 p-4 shadow";

  return (
    <main className="p-10 space-y-6">

      <h1 className="text-3xl font-bold text-white">
        Sistema de Torneos de Golf
      </h1>

      {/* BOTONES PRINCIPALES */}

      <div className="flex gap-3 flex-wrap">

        <Link href="/players" className="btn3d">
          Players
        </Link>

        <Link href="/entries" className="btn3d-blue">
          Inscripciones
        </Link>

        <Link href="/categories" className="btn3d">
          Categorías
        </Link>

        <Link href="/tee-sheet" className="btn3d">
          Tee Sheet
        </Link>

        <Link href="/leaderboard" className="btn3d-green">
          Leaderboard
        </Link>

      </div>

      {/* MÉTRICAS */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className={statCard}>
          <p className="text-sm text-white/70">Torneos</p>
          <div className="text-3xl font-bold text-white">
            {tournaments.length}
          </div>
        </div>

        <div className={statCard}>
          <p className="text-sm text-white/70">Jugadores</p>
          <div className="text-3xl font-bold text-white">
            {totalPlayers}
          </div>
        </div>

        <div className={statCard}>
          <p className="text-sm text-white/70">Inscripciones</p>
          <div className="text-3xl font-bold text-white">
            {totalEntries}
          </div>
        </div>

        <div className={statCard}>
          <p className="text-sm text-white/70">Categorías</p>
          <div className="text-3xl font-bold text-white">
            {totalCategories}
          </div>
        </div>

      </section>

      {/* LISTA DE TORNEOS */}

      <section className="rounded-lg border border-white/20 bg-white/10 p-5">

        <h2 className="text-xl font-semibold text-white mb-3">
          Torneos
        </h2>

        {tournaments.length === 0 ? (

          <p className="text-white">
            No hay torneos todavía.
          </p>

        ) : (

          <ul className="space-y-2">

            {tournaments.map((t) => (

              <li key={t.id}>

                <Link
                  href={`/entries?tournament_id=${t.id}`}
                  className="block rounded-md border border-white/10 bg-black/10 p-3 hover:bg-white/10"
                >

                  <span className="font-medium text-white">
                    {t.name}
                  </span>

                  {t.status && (
                    <span className="text-sm text-white/70 ml-2">
                      ({t.status})
                    </span>
                  )}

                </Link>

              </li>

            ))}

          </ul>

        )}

      </section>

    </main>
  );
}