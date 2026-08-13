import Link from "next/link";
import { redirect } from "next/navigation";
import { tryCreateAdminClient } from "@/utils/supabase/admin";
import { getUserRoles, isCommitteeOnlyUser } from "@/lib/auth/getUserRoles";
import { requireGhinCommitteeAccess } from "@/lib/handicap-committee/requireGhinAccess";
import { loadCommitteeSelectionRows } from "@/lib/handicap-committee/loadSelectionRows";
import {
  loadOpenCommitteeTournamentsForUser,
} from "@/lib/handicap-committee/openCommitteesForUser";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
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

  const { supabase, userId } = await requireGhinCommitteeAccess();
  const locale = await getLocale();
  const t = messages[locale].handicapCommittee;

  if (!tournamentId) {
    const roles = await getUserRoles(supabase, userId);
    if (isCommitteeOnlyUser(roles)) {
      const db = tryCreateAdminClient() ?? supabase;
      const open = await loadOpenCommitteeTournamentsForUser(db, userId);
      if (open.length === 1) {
        redirect(
          `/comite-handicap/seleccion?tournament_id=${encodeURIComponent(open[0]!.tournamentId)}`
        );
      }
      return (
        <div className="mx-auto max-w-2xl space-y-4 p-6">
          <h1 className="text-lg font-bold text-white">{t.pageTitle}</h1>
          <p className="text-sm text-slate-300">
            {open.length ? t.pickOpenVote : t.noOpenVote}
          </p>
          {open.length === 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              {t.noOpenVote}
            </div>
          ) : (
            <ul className="space-y-2">
              {open.map((row) => (
                <li key={row.committeeId}>
                  <Link
                    href={`/comite-handicap/seleccion?tournament_id=${encodeURIComponent(row.tournamentId)}`}
                    className="block rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    {row.tournamentName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

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

  const loaded = await loadCommitteeSelectionRows(supabase, tournamentId);
  const rows = JSON.parse(JSON.stringify(loaded.rows)) as typeof loaded.rows;
  const clubIndexHistory = loaded.clubIndexHistory
    ? (JSON.parse(JSON.stringify(loaded.clubIndexHistory)) as typeof loaded.clubIndexHistory)
    : null;

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
        clubIndexHistory={clubIndexHistory}
      />
    </div>
  );
}
