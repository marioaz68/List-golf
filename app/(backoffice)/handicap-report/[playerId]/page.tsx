import { createClient } from "@/utils/supabase/server";
import { loadGhinLiveReport } from "@/lib/ghin-report/loadGhinReport";
import GhinLiveReport from "@/lib/ghin-report/GhinLiveReport";
import { formatDateEs } from "@/lib/ghin-report/formatDateEs";
import { notFound, redirect } from "next/navigation";

type Props = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ return?: string; tournament_id?: string }>;
};

function safeReturnUrl(raw: string | undefined): string {
  const fallback = "/comite-handicap";
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export const dynamic = "force-dynamic";

export default async function HandicapReportViewerPage({
  params,
  searchParams,
}: Props) {
  const { playerId } = await params;
  const sp = await searchParams;
  const back = safeReturnUrl(sp.return);
  const tournamentId =
    typeof sp.tournament_id === "string" && sp.tournament_id.trim()
      ? sp.tournament_id.trim()
      : null;

  // Cliente de sesión (cookies): la RLS de tablas GHIN aplica vía
  // fn_user_can_read_ghin(auth.uid()). No usar service_role aquí.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: canRead } = await supabase.rpc("fn_user_can_read_ghin", {
    user_uuid: user.id,
  });
  if (!canRead) notFound();

  const report = await loadGhinLiveReport(supabase, {
    playerId,
    tournamentId,
  });

  if ("error" in report) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900 text-white">
        <header className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
          <p className="text-sm font-bold">Reporte GHIN</p>
          <a href={back} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
            Cerrar
          </a>
        </header>
        <main className="flex flex-1 items-center justify-center p-4 text-sm text-red-300">
          {report.error}
        </main>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f1720]">
      <header className="flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">
            {report.fullName}
          </p>
          <p className="text-[10px] leading-tight text-slate-300">
            {report.ghin ? `GHIN ${report.ghin}` : "Sin GHIN"}
            {report.tournamentName ? ` · ${report.tournamentName}` : ""}
            {report.provisional ? " · provisional" : ""}
          </p>
          {(report.dataCutoffs.revisions || report.dataCutoffs.rounds) && (
            <p className="mt-0.5 text-[10px] leading-snug text-amber-200/90">
              Cortes de datos
              {report.dataCutoffs.revisions
                ? ` · Revisiones HI al ${formatDateEs(report.dataCutoffs.revisions)}`
                : ""}
              {report.dataCutoffs.rounds
                ? ` · Rondas del jugador al ${formatDateEs(report.dataCutoffs.rounds)}`
                : ""}
            </p>
          )}
        </div>
        <a
          href={back}
          aria-label="Cerrar y volver"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-bold text-white no-underline hover:bg-white/20 active:bg-white/30"
        >
          <span aria-hidden>✕</span>
          <span className="hidden sm:inline">Cerrar</span>
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <GhinLiveReport data={report} />
      </main>

      <footer
        className="border-t border-slate-700 bg-slate-800 px-3 py-2 text-white"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <a
          href={back}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-emerald-600 px-4 text-sm font-bold text-white no-underline shadow-sm hover:bg-emerald-700 active:bg-emerald-800"
        >
          <span aria-hidden>✕</span>
          Cerrar y volver a votar
        </a>
      </footer>
    </div>
  );
}
