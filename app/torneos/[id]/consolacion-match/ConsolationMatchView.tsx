"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ConsolationMatchPlayPublic } from "@/lib/matchplay/loadConsolationMatchPlayPublic";
import MatchDetailModal from "@/app/torneos/[id]/matches-vivo/MatchDetailModal";

type Payload = ConsolationMatchPlayPublic & { error?: string };

const STATUS_COLOR: Record<string, string> = {
  completed: "border-emerald-500/40 bg-emerald-950/30",
  in_progress: "border-sky-500/40 bg-sky-950/30",
  scheduled: "border-white/10 bg-white/5",
};

export default function ConsolationMatchView({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [openMatch, setOpenMatch] = useState<{
    matchId: string;
    groupNo: number;
    roundNo: number;
  } | null>(null);

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      return fetch(
        `/api/matchplay/consolation-match?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((d: Payload) => {
          setData(d);
          setLastUpdated(new Date());
        })
        .catch(() =>
          setData({
            ok: false,
            tournamentName: "",
            activeRoundNo: null,
            fromRoundNo: null,
            groups: [],
            message: "Error de red",
          })
        )
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [tournamentId]
  );

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load({ silent: true }), 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () =>
      setSecondsAgo(
        Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (loading && !data) {
    return <p className="text-sm text-slate-400">Cargando consolación…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/torneos/${tournamentId}`}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            ← Torneo
          </Link>
          <h1 className="mt-1 text-lg font-bold text-white">
            {data?.tournamentName ?? "Consolación Match Play"}
          </h1>
          <p className="text-xs text-slate-400">
            Perdedores de R{data?.fromRoundNo ?? "—"} · juegan en R
            {data?.activeRoundNo ?? "—"}
            {data?.groups.length
              ? ` · ${data.groups.length} grupo(s)`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>
            {lastUpdated
              ? refreshing
                ? "Actualizando…"
                : `Actualizado hace ${secondsAgo}s`
              : "—"}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            ↻ Actualizar
          </button>
        </div>
      </div>

      {data?.message ? (
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
          {data.message}
        </p>
      ) : null}

      {data?.groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-950/20 px-4 py-6 text-center text-sm text-amber-100">
          Aún no hay salidas de consolación. Cuando cierren los partidos de la
          ronda anterior, el comité puede generarlas desde Match play →
          Consolaciones.
        </div>
      ) : (
        <ul className="space-y-3">
          {data?.groups.map((g) => {
            const statusKey =
              g.status === "completed"
                ? "completed"
                : g.liveText
                  ? "in_progress"
                  : "scheduled";
            const cardCls =
              STATUS_COLOR[statusKey] ?? STATUS_COLOR.scheduled;
            const detailMatchId =
              g.matchId && !g.matchId.startsWith("match-") ? g.matchId : null;

            return (
              <li
                key={g.groupId}
                className={`rounded-xl border p-3 ${cardCls}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-sky-300">
                    Grupo {g.groupNo}
                    {g.teeTime ? ` · ${g.teeTime}` : ""}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    R{g.roundNo}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="font-semibold text-white">{g.topLabel}</div>
                  <div className="text-[10px] text-slate-500">vs</div>
                  <div className="font-semibold text-white">{g.bottomLabel}</div>
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-300">
                  {g.liveText ?? g.resultText ?? "Sin resultado aún"}
                </div>
                {detailMatchId ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMatch({
                        matchId: detailMatchId,
                        groupNo: g.groupNo,
                        roundNo: g.roundNo,
                      })
                    }
                    className="mt-2 inline-flex text-[11px] font-bold text-sky-300 hover:text-sky-200"
                  >
                    Ver detalle de la jugada →
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3 text-[11px]">
        <Link
          href={`/torneos/${tournamentId}/matches-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          📺 Matches en vivo
        </Link>
        <Link
          href={`/torneos/${tournamentId}/consolacion-stroke`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          ⛳ Consolación stroke
        </Link>
      </div>

      <MatchDetailModal
        open={openMatch != null}
        onClose={() => setOpenMatch(null)}
        tournamentId={tournamentId}
        matchId={openMatch?.matchId ?? null}
        isDerived={false}
        topTeam={null}
        bottomTeam={null}
        roundLabel={
          openMatch ? `Consolación · R${openMatch.roundNo}` : undefined
        }
        positionNo={openMatch?.groupNo ?? 0}
        holesPerMatch={18}
        liveTick={secondsAgo}
      />
    </div>
  );
}
