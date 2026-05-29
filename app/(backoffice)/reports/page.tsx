import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listAccessibleTournaments } from "@/lib/auth/listAccessibleTournaments";
import HandicapsByCategoryReport from "./HandicapsByCategoryReport";
import { recomputeReportHandicaps } from "./actions";

export const dynamic = "force-dynamic";

type SP = { [key: string]: string | string[] | undefined };

type ReportTab = {
  id: string;
  label: string;
};

const REPORT_TABS: ReportTab[] = [
  { id: "handicaps", label: "Handicaps por categoría" },
];

export default async function ReportsPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";
  const requestedTab =
    typeof sp.tab === "string" ? sp.tab.trim() : REPORT_TABS[0].id;
  const tab = REPORT_TABS.some((t) => t.id === requestedTab)
    ? requestedTab
    : REPORT_TABS[0].id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const list = await listAccessibleTournaments(supabase, user.id);

  if (list.length === 0) {
    return (
      <div className="space-y-3 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Reportes</h1>
        <p className="text-[12px] text-amber-200">
          No tienes torneos autorizados. Pide a un administrador que te dé
          acceso.
        </p>
      </div>
    );
  }

  const accessibleIds = new Set(list.map((t) => t.id));
  const isRequestedAccessible = tournamentId
    ? accessibleIds.has(tournamentId)
    : false;
  const effectiveId = isRequestedAccessible
    ? tournamentId
    : (list[0]?.id as string);

  if (tournamentId && !isRequestedAccessible) {
    redirect(`/reports?tournament_id=${effectiveId}&tab=${tab}`);
  }
  if (!tournamentId) {
    redirect(`/reports?tournament_id=${effectiveId}`);
  }

  const tournament = list.find((t) => t.id === effectiveId);

  const hcapStatus =
    typeof sp.hcap_status === "string" ? sp.hcap_status.trim() : "";
  const hcapMessage =
    typeof sp.hcap_message === "string" ? sp.hcap_message.trim() : "";

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold leading-none text-white">
            Reportes
          </h1>
          <p className="mt-1 text-[11px] text-slate-400">
            Torneo:{" "}
            <span className="font-semibold text-slate-200">
              {tournament?.name ?? effectiveId.slice(0, 8)}
            </span>
          </p>
        </div>

        <form method="GET" action="/reports" className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select
            name="tournament_id"
            defaultValue={effectiveId}
            className="rounded border border-white/15 bg-[#0a1220] px-2 py-1 text-[11px] text-white"
          >
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-white/15 bg-[#1f2937] px-3 py-1 text-[11px] font-semibold text-white"
          >
            Cambiar torneo
          </button>
        </form>
      </header>

      {REPORT_TABS.length > 1 ? (
        <nav className="flex flex-wrap gap-1 border-b border-white/10 pb-1 print:hidden">
          {REPORT_TABS.map((t) => {
            const isActive = t.id === tab;
            const href = `/reports?tournament_id=${effectiveId}&tab=${t.id}`;
            return (
              <a
                key={t.id}
                href={href}
                className={`rounded-t px-3 py-1 text-[11px] font-semibold ${
                  isActive
                    ? "bg-[#0f172a] text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </a>
            );
          })}
        </nav>
      ) : null}

      {tab === "handicaps" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0f172a] px-3 py-2 print:hidden">
            <div className="text-[11px] text-slate-300">
              <span className="font-semibold text-white">Persistencia.</span>{" "}
              El reporte calcula CH/PH en vivo. Si quieres que la leaderboard y
              la vista pública usen los mismos valores, guárdalos en BD.
            </div>
            <form action={recomputeReportHandicaps}>
              <input type="hidden" name="tournament_id" value={effectiveId} />
              <button
                type="submit"
                className="rounded border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30"
              >
                Recalcular y guardar CH/PH
              </button>
            </form>
          </div>

          {hcapMessage ? (
            <p
              className={`rounded-md border px-3 py-1.5 text-[11px] print:hidden ${
                hcapStatus === "ok"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/40 bg-amber-500/10 text-amber-200"
              }`}
            >
              {hcapMessage}
            </p>
          ) : null}

          <HandicapsByCategoryReport
            tournamentId={effectiveId}
            tournamentName={tournament?.name ?? "Torneo"}
          />
        </>
      ) : null}
    </div>
  );
}
