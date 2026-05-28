import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listAccessibleTournaments } from "@/lib/auth/listAccessibleTournaments";
import HandicapsByCategoryReport from "./HandicapsByCategoryReport";

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

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
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
        <nav className="flex flex-wrap gap-1 border-b border-white/10 pb-1">
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
        <HandicapsByCategoryReport tournamentId={effectiveId} />
      ) : null}
    </div>
  );
}
