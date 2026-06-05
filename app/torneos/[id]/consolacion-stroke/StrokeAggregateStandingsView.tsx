"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FavoriteStar from "@/components/public/FavoriteStar";
import type {
  StrokeAggregateGroup,
  StrokeAggregatePairRow,
  StrokeAggregatePlayerRow,
} from "@/lib/matchplay/strokeAggregateStandings";

type StandingsPayload = {
  ok: boolean;
  tournamentName?: string;
  roundNo: number | null;
  allowancePct: number;
  pairs: StrokeAggregatePairRow[];
  groups: StrokeAggregateGroup[];
  message: string;
  error?: string;
};

const FAV_KEY = (tournamentId: string) => `listgolf:favorites:${tournamentId}`;

function fmtScore(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(n);
}

function fmtToPar(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

type Tab = "live" | "leaderboard";

export default function StrokeAggregateStandingsView({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [data, setData] = useState<StandingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [tab, setTab] = useState<Tab>("live");
  const [favs, setFavs] = useState<string[]>([]);
  const [onlyFavs, setOnlyFavs] = useState(false);

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setRefreshing(true);
      return fetch(
        `/api/matchplay/stroke-aggregate-standings?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((d: StandingsPayload) => {
          setData(d);
          setLastUpdated(new Date());
        })
        .catch(() =>
          setData({
            ok: false,
            message: "Error de red",
            pairs: [],
            groups: [],
            roundNo: null,
            allowancePct: 80,
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
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Favoritos (localStorage) + sincronización entre vistas.
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(FAV_KEY(tournamentId));
        const parsed = raw ? JSON.parse(raw) : [];
        setFavs(Array.isArray(parsed) ? parsed.map(String) : []);
      } catch {
        setFavs([]);
      }
    };
    read();
    const onChange = () => read();
    window.addEventListener("listgolf-favorites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("listgolf-favorites-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [tournamentId]);

  const favSet = useMemo(() => new Set(favs), [favs]);

  if (loading && !data) {
    return <p className="text-sm text-slate-400">Cargando consolación stroke…</p>;
  }
  if (!data?.ok) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
        {data?.error ?? data?.message ?? "No disponible"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-sky-500/30 bg-[#0c1728] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-sky-300/80">
          Consolación · Stroke Play Agregado
        </div>
        <h1 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
          {data.tournamentName ?? "Torneo"}
        </h1>
        <p className="mt-2 text-[12px] text-slate-300">
          Ronda {data.roundNo ?? "—"} · Neto {data.allowancePct}% HI · Total =
          suma neto de los 2 jugadores de la pareja.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <TabBtn active={tab === "live"} onClick={() => setTab("live")}>
          📺 En vivo (salidas)
        </TabBtn>
        <TabBtn active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>
          🏆 Clasificación
        </TabBtn>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500">
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
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={onlyFavs}
              onChange={(e) => setOnlyFavs(e.target.checked)}
            />
            Solo favoritos ★
          </label>
        </div>
      </div>

      {tab === "live" ? (
        <LiveGroups
          tournamentId={tournamentId}
          groups={data.groups}
          favSet={favSet}
          onlyFavs={onlyFavs}
        />
      ) : (
        <Leaderboard pairs={data.pairs} message={data.message} favSet={favSet} onlyFavs={onlyFavs} />
      )}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <Link
          href={`/torneos/${tournamentId}/matches-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          📺 Matches en vivo
        </Link>
        <Link
          href={`/torneos/${tournamentId}/cuadro-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          🎯 Cuadro en vivo
        </Link>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
        active
          ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function genderTint(label: string): { border: string; chip: string } {
  const l = label.toLowerCase();
  if (l.startsWith("hombre")) return { border: "#1d4ed8", chip: "#1d4ed8" };
  if (l.startsWith("mujer")) return { border: "#be185d", chip: "#be185d" };
  return { border: "#475569", chip: "#475569" };
}

function LiveGroups({
  tournamentId,
  groups,
  favSet,
  onlyFavs,
}: {
  tournamentId: string;
  groups: StrokeAggregateGroup[];
  favSet: Set<string>;
  onlyFavs: boolean;
}) {
  const sorted = [...groups].sort((a, b) => a.groupNo - b.groupNo);
  const filtered = onlyFavs
    ? sorted.filter((g) =>
        g.members.some((m) => m.playerId && favSet.has(m.playerId))
      )
    : sorted;

  if (filtered.length === 0) {
    return (
      <p className="rounded border border-white/10 bg-[#0c1728] p-4 text-sm text-slate-400">
        {onlyFavs
          ? "No hay favoritos en las salidas de la consolación."
          : "Aún no hay salidas creadas para la consolación stroke."}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((g) => {
        const tint = genderTint(g.label);
        return (
          <div
            key={g.groupId}
            className="rounded-xl border bg-[#0c1728] p-2"
            style={{ borderColor: tint.border }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-white">
                Salida {g.groupNo}
                <span
                  className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: tint.chip }}
                >
                  {g.label}
                </span>
              </span>
              <span className="text-[11px] text-slate-400">{g.teeTime ?? "—"}</span>
            </div>
            <div className="space-y-1">
              {g.members.map((m) => (
                <PlayerLiveRow
                  key={m.entryId}
                  tournamentId={tournamentId}
                  member={m}
                  isFav={!!m.playerId && favSet.has(m.playerId)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerLiveRow({
  tournamentId,
  member,
  isFav,
}: {
  tournamentId: string;
  member: StrokeAggregatePlayerRow;
  isFav: boolean;
}) {
  const started = member.holesPlayed > 0;
  return (
    <div
      className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[12px] ${
        isFav
          ? "border-amber-400/50 bg-amber-500/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {member.playerId ? (
        <FavoriteStar
          tournamentId={tournamentId}
          playerId={member.playerId}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-base leading-none"
        />
      ) : (
        <span className="inline-block h-6 w-6" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium text-slate-100">
        {member.name}
      </span>
      <span className="shrink-0 text-[10px] text-slate-500">
        PH {member.playingHandicap}
      </span>
      <span className="w-9 shrink-0 text-right text-[10px] text-slate-400">
        {started ? `${member.holesPlayed}h` : "—"}
      </span>
      <span className="w-12 shrink-0 text-right font-extrabold tabular-nums text-emerald-300">
        {started ? fmtScore(member.net) : "—"}
        {started && member.netToPar != null ? (
          <span className="ml-0.5 text-[9px] font-normal text-slate-400">
            {fmtToPar(member.netToPar)}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function Leaderboard({
  pairs,
  message,
  favSet,
  onlyFavs,
}: {
  pairs: StrokeAggregatePairRow[];
  message: string;
  favSet: Set<string>;
  onlyFavs: boolean;
}) {
  const filtered = onlyFavs
    ? pairs.filter(
        (p) =>
          (p.playerA.playerId && favSet.has(p.playerA.playerId)) ||
          (p.playerB.playerId && favSet.has(p.playerB.playerId))
      )
    : pairs;

  if (filtered.length === 0) {
    return (
      <p className="rounded border border-white/10 bg-[#0c1728] p-4 text-sm text-slate-400">
        {onlyFavs ? "No hay parejas favoritas." : message}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c1728]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-[#0a1220] text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Pareja</th>
            <th className="px-3 py-2">Jugador</th>
            <th className="px-3 py-2 text-right">Neto</th>
            <th className="px-3 py-2 text-right">PH</th>
            <th className="px-3 py-2 text-right">Hoyos</th>
            <th className="px-3 py-2 text-right font-bold text-sky-200">
              Total pareja
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <PairTableRows key={p.pairId} pair={p} favSet={favSet} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairTableRows({
  pair,
  favSet,
}: {
  pair: StrokeAggregatePairRow;
  favSet: Set<string>;
}) {
  const totalLabel = fmtScore(pair.aggregateNet);
  const totalToPar = fmtToPar(pair.aggregateNetToPar);
  const favA = !!pair.playerA.playerId && favSet.has(pair.playerA.playerId);
  const favB = !!pair.playerB.playerId && favSet.has(pair.playerB.playerId);
  const isFav = favA || favB;

  return (
    <>
      <tr className={`border-b border-white/5 ${isFav ? "bg-amber-500/10" : "bg-white/[0.02]"}`}>
        <td className="px-3 py-2 align-top font-bold text-white" rowSpan={2}>
          {pair.position}
          {pair.tied ? <span className="ml-0.5 text-[9px] text-slate-500">T</span> : null}
        </td>
        <td className="px-3 py-2 align-top font-semibold text-slate-200" rowSpan={2}>
          {pair.label}
          {pair.seed != null ? (
            <span className="ml-1 text-[10px] text-slate-500">#{pair.seed}</span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-slate-300">
          {favA ? <span className="mr-1 text-amber-300">★</span> : null}
          {pair.playerA.name}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
          {fmtScore(pair.playerA.net)}
          {pair.playerA.netToPar != null ? (
            <span className="ml-1 text-[10px] text-slate-500">
              ({fmtToPar(pair.playerA.netToPar)})
            </span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerA.playingHandicap}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerA.holesPlayed}/18
        </td>
        <td
          className="px-3 py-2 text-right align-middle text-lg font-extrabold tabular-nums text-sky-200"
          rowSpan={2}
        >
          {totalLabel}
          {totalToPar ? (
            <div className="text-[11px] font-normal text-slate-400">{totalToPar}</div>
          ) : null}
        </td>
      </tr>
      <tr className={`border-b border-white/10 ${isFav ? "bg-amber-500/10" : ""}`}>
        <td className="px-3 py-1.5 text-slate-300">
          {favB ? <span className="mr-1 text-amber-300">★</span> : null}
          {pair.playerB.name}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
          {fmtScore(pair.playerB.net)}
          {pair.playerB.netToPar != null ? (
            <span className="ml-1 text-[10px] text-slate-500">
              ({fmtToPar(pair.playerB.netToPar)})
            </span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerB.playingHandicap}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerB.holesPlayed}/18
        </td>
      </tr>
    </>
  );
}
