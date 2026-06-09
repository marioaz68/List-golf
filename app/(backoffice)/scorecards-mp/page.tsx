import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { listAccessibleTournaments } from "@/lib/auth/listAccessibleTournaments";
import { loadPrintableMpScorecards } from "@/lib/matchplay/loadPrintableMpScorecards";
import PrintableScorecardsClient from "./PrintableScorecardsClient";

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };

export default async function ScorecardsMpPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const list = await listAccessibleTournaments(supabase, user.id);
  if (list.length === 0) {
    return (
      <div className="space-y-3 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Tarjetas MP (imprimir)</h1>
        <p className="text-[12px] text-amber-200">
          No tienes torneos autorizados.
        </p>
      </div>
    );
  }

  const accessibleIds = new Set(list.map((t) => t.id));
  const effectiveId =
    tournamentId && accessibleIds.has(tournamentId)
      ? tournamentId
      : (list[0]?.id as string);

  if (!tournamentId || !accessibleIds.has(tournamentId)) {
    redirect(`/scorecards-mp?tournament_id=${effectiveId}`);
  }

  const tournament = list.find((t) => t.id === effectiveId);
  const bundle = await loadPrintableMpScorecards(effectiveId);

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header className="print:hidden flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-white">
            Tarjetas físicas Match Play
          </h1>
          <p className="text-[12px] text-slate-400">
            {tournament?.name ?? "Torneo"} — imprimir para anotar en campo
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Link
            href={`/matchplay?tournament_id=${effectiveId}`}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
          >
            Cuadro MP
          </Link>
          <Link
            href={`/tee-sheet?tournament_id=${effectiveId}`}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
          >
            Salidas
          </Link>
        </div>
      </header>

      <PrintableScorecardsClient bundle={bundle} />
    </div>
  );
}
