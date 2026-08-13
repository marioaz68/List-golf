import Link from "next/link";
import { requireGhinCommitteeAccess } from "@/lib/handicap-committee/requireGhinAccess";
import { loadCommitteeSelectionRows } from "@/lib/handicap-committee/loadSelectionRows";
import CommitteeSelectionClient from "./CommitteeSelectionClient";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function CommitteeSelectionPage({
  searchParams,
}: {
  searchParams?: SP;
}) {
  const sp = (await searchParams) ?? {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { supabase } = await requireGhinCommitteeAccess();

  if (!tournamentId) {
    const { data: tours } = await supabase
      .from("tournaments")
      .select("id, name")
      .order("start_date", { ascending: false })
      .limit(20);
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-lg font-bold">Selección para comité</h1>
        <p className="mt-2 text-sm text-slate-600">
          Elige un torneo:
        </p>
        <ul className="mt-3 space-y-1">
          {(tours ?? []).map((t) => (
            <li key={t.id}>
              <Link
                href={`/comite-handicap/seleccion?tournament_id=${t.id}`}
                className="text-indigo-700 underline"
              >
                {t.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/comite-handicap"
          className="mt-4 inline-block text-sm text-slate-600 underline"
        >
          ← Volver al comité
        </Link>
      </div>
    );
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();

  const rows = await loadCommitteeSelectionRows(supabase, tournamentId);

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/comite-handicap?tournament_id=${tournamentId}`}
          className="text-indigo-700 underline"
        >
          ← Votación
        </Link>
        <Link
          href="/comite-handicap/ghin-datos"
          className="text-indigo-700 underline"
        >
          Datos GHIN
        </Link>
      </div>
      <CommitteeSelectionClient
        tournamentId={tournamentId}
        tournamentName={tournament?.name ?? "Torneo"}
        initialRows={rows}
      />
    </div>
  );
}
