import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import AutoRefresh from "@/components/public/AutoRefresh";
import {
  formatDistanceCm,
  loadClosestToPinPublicBoard,
  loadTournamentRounds,
} from "@/lib/cercanos/loadClosestToPin";
import { CLOSEST_TO_PIN_MAX_PRIZES } from "@/lib/cercanos/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteParams = { id: string };
type SP = { [key: string]: string | string[] | undefined };

function param(sp: SP, key: string): string {
  const v = sp[key];
  return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export async function generateMetadata(props: {
  params: Promise<RouteParams> | RouteParams;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("tournaments")
    .select("name, is_public")
    .eq("id", params.id)
    .maybeSingle();
  if (!t || t.is_public === false) {
    return { title: "Más cerca de la bandera" };
  }
  return {
    title: `Más cerca · ${t.name}`,
    description: "Premios a los más cercanos a la bandera en los pares 3.",
  };
}

export default async function PublicCercanosPage(props: {
  params: Promise<RouteParams> | RouteParams;
  searchParams?: Promise<SP> | SP;
}) {
  const params = await Promise.resolve(props.params);
  const sp = props.searchParams
    ? await Promise.resolve(props.searchParams)
    : {};
  const tournamentId = params.id;
  if (!tournamentId) notFound();

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name, is_public, is_archived")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.is_public === false) notFound();

  const rounds = await loadTournamentRounds(admin, tournamentId);
  const queryRoundId = param(sp as SP, "round_id");
  const roundId =
    (queryRoundId && rounds.some((r) => r.id === queryRoundId)
      ? queryRoundId
      : rounds[0]?.id) ?? "";

  const board = roundId
    ? await loadClosestToPinPublicBoard(admin, {
        tournamentId,
        roundId,
      })
    : [];

  const selectedRound = rounds.find((r) => r.id === roundId);

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <AutoRefresh intervalMs={15000} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/torneos/${tournamentId}`}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold hover:bg-slate-700"
          >
            ← Torneo
          </Link>
          {rounds.length > 1
            ? rounds.map((r) => {
                const active = r.id === roundId;
                const label = [
                  r.round_no != null ? `R${r.round_no}` : "Ronda",
                  r.round_date ? String(r.round_date).slice(0, 10) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Link
                    key={r.id}
                    href={`/torneos/${tournamentId}/cercanos?round_id=${r.id}`}
                    className={
                      active
                        ? "rounded-md border border-cyan-300 bg-cyan-500 px-3 py-1.5 text-xs font-bold text-[#08111f]"
                        : "rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold hover:bg-slate-700"
                    }
                  >
                    {label}
                  </Link>
                );
              })
            : null}
        </div>

        <header className="mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            Premios · pares 3
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            Más cerca de la bandera
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {(tournament as { name: string | null }).name}
            {selectedRound?.round_no != null
              ? ` · Ronda ${selectedRound.round_no}`
              : ""}
            {" · "}
            hasta {CLOSEST_TO_PIN_MAX_PRIZES} lugares por hoyo (1.º = más
            cercano)
          </p>
        </header>

        {board.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
            No hay pares 3 en la tarjeta de este torneo, o aún no hay ronda.
          </p>
        ) : (
          <div className="space-y-6">
            {board.map((hole) => (
              <section
                key={hole.holeNumber}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-white/10 bg-emerald-950/40 px-4 py-3">
                  <h2 className="text-lg font-extrabold text-white">
                    Hoyo {hole.holeNumber}
                    <span className="ml-2 text-sm font-semibold text-emerald-300/80">
                      Par {hole.par}
                    </span>
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    {hole.totalEntries} captura
                    {hole.totalEntries === 1 ? "" : "s"}
                  </span>
                </div>

                {hole.standings.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">
                    Sin distancias capturadas aún.
                  </p>
                ) : (
                  <ol className="divide-y divide-white/5">
                    {hole.standings.map((s, idx) => {
                      const isFirst = s.position === 1;
                      return (
                        <li
                          key={s.entryId}
                          className={`flex items-center gap-3 px-4 py-3 ${
                            isFirst ? "bg-amber-500/10" : ""
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                              isFirst
                                ? "bg-amber-400 text-[#08111f]"
                                : "bg-white/10 text-cyan-200"
                            }`}
                          >
                            {s.tied ? `T${s.position}` : s.position}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-white">
                              {s.playerName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {s.categoryCode ?? "—"}
                              {s.groupNo != null ? ` · G${s.groupNo}` : ""}
                              {s.capturistSigned ? " · ✍️ capturista" : ""}
                              {s.playerAccepted ? " · ✓ jugador" : ""}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 font-mono text-base font-bold ${
                              idx === 0 && isFirst
                                ? "text-amber-300"
                                : "text-emerald-300"
                            }`}
                          >
                            {formatDistanceCm(s.distanceCm)}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
