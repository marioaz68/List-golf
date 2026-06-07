"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FavoriteStar from "@/components/public/FavoriteStar";
import type {
  StrokeAggregateGroup,
  StrokeAggregatePairRow,
  StrokeAggregatePlayerRow,
} from "@/lib/matchplay/strokeAggregateStandings";
import type { HoleDetail } from "@/app/torneos/[id]/lib/types";

/** Jugador mostrado dentro del detalle (con hoyos resueltos). */
type DetailPlayer = {
  entryId: string;
  playerId: string | null;
  name: string;
  net: number | null;
  netToPar: number | null;
  holesPlayed: number;
  holes?: HoleDetail[];
};

/** Descriptor del detalle abierto (grupo o pareja). */
type DetailTarget = {
  title: string;
  subtitle?: string;
  players: DetailPlayer[];
};

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
  const [detail, setDetail] = useState<DetailTarget | null>(null);

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

  // Hoyos por entry (de las parejas: detailA / detailB) para mostrar el
  // marcador hoyo por hoyo tanto en grupos como en clasificación.
  const holesByEntry = useMemo(() => {
    const m = new Map<string, HoleDetail[]>();
    const put = (entryId: string, holes: HoleDetail[] | undefined) => {
      if (entryId && holes && holes.length > 0) m.set(entryId, holes);
    };
    for (const p of data?.pairs ?? []) {
      put(p.playerA.entryId, p.playerA.holes ?? p.detailA?.holes);
      put(p.playerB.entryId, p.playerB.holes ?? p.detailB?.holes);
    }
    for (const g of data?.groups ?? []) {
      for (const mem of g.members) put(mem.entryId, mem.holes);
    }
    return m;
  }, [data?.pairs, data?.groups]);

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
          onOpenDetail={setDetail}
        />
      ) : (
        <Leaderboard
          tournamentId={tournamentId}
          pairs={data.pairs}
          message={data.message}
          favSet={favSet}
          onlyFavs={onlyFavs}
          onOpenDetail={setDetail}
        />
      )}

      {detail ? (
        <StrokeDetailModal
          tournamentId={tournamentId}
          detail={detail}
          holesByEntry={holesByEntry}
          favSet={favSet}
          onClose={() => setDetail(null)}
        />
      ) : null}

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
  onOpenDetail,
}: {
  tournamentId: string;
  groups: StrokeAggregateGroup[];
  favSet: Set<string>;
  onlyFavs: boolean;
  onOpenDetail: (d: DetailTarget) => void;
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
              <span className="text-[11px] text-slate-400">
                {g.teeTime ?? "—"}
                {g.cardsClosed ? " · cerrada" : ""}
              </span>
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
            <button
              type="button"
              onClick={() =>
                onOpenDetail({
                  title: `Salida ${g.groupNo} · ${g.label}`,
                  subtitle: g.teeTime ? `Tee ${g.teeTime.slice(0, 5)}` : undefined,
                  players: g.members.map((m) => ({
                    entryId: m.entryId,
                    playerId: m.playerId,
                    name: m.name,
                    net: m.net,
                    netToPar: m.netToPar,
                    holesPlayed: m.holesPlayed,
                    holes: m.holes,
                  })),
                })
              }
              className="mt-2 w-full rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/20"
            >
              Ver detalle hoyo por hoyo →
            </button>
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
        {member.lockedAt ? (
          <span className="ml-1 text-[9px] font-semibold text-slate-500">🔒</span>
        ) : null}
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
  tournamentId,
  pairs,
  message,
  favSet,
  onlyFavs,
  onOpenDetail,
}: {
  tournamentId: string;
  pairs: StrokeAggregatePairRow[];
  message: string;
  favSet: Set<string>;
  onlyFavs: boolean;
  onOpenDetail: (d: DetailTarget) => void;
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
    <>
      {/* Móvil: tarjetas clicables */}
      <ul className="space-y-2 md:hidden">
        {filtered.map((p) => (
          <LeaderboardPairCard
            key={p.pairId}
            tournamentId={tournamentId}
            pair={p}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </ul>

      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 bg-[#0c1728] md:block">
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
            <PairTableRows
              key={p.pairId}
              tournamentId={tournamentId}
              pair={p}
              favSet={favSet}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function pairToDetail(pair: StrokeAggregatePairRow): DetailTarget {
  return {
    title: pair.label,
    subtitle:
      pair.aggregateNet != null
        ? `Total pareja: ${fmtScore(pair.aggregateNet)}${
            fmtToPar(pair.aggregateNetToPar)
              ? ` (${fmtToPar(pair.aggregateNetToPar)})`
              : ""
          }`
        : undefined,
    players: [pair.playerA, pair.playerB].map((pl) => ({
      entryId: pl.entryId,
      playerId: pl.playerId,
      name: pl.name,
      net: pl.net,
      netToPar: pl.netToPar,
      holesPlayed: pl.holesPlayed,
      holes: pl.holes,
    })),
  };
}

function LeaderboardPairCard({
  tournamentId,
  pair,
  onOpenDetail,
}: {
  tournamentId: string;
  pair: StrokeAggregatePairRow;
  onOpenDetail: (d: DetailTarget) => void;
}) {
  const open = () => onOpenDetail(pairToDetail(pair));
  const totalToPar = fmtToPar(pair.aggregateNetToPar);

  return (
    <li className="rounded-xl border border-white/10 bg-[#0c1728] p-3">
      <button
        type="button"
        onClick={open}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-lg font-extrabold text-white">
              {pair.position}
              {pair.tied ? (
                <span className="ml-0.5 text-[10px] text-slate-500">T</span>
              ) : null}
            </span>
            <div className="mt-0.5 text-sm font-semibold text-slate-200">
              {pair.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold tabular-nums text-sky-200">
              {fmtScore(pair.aggregateNet)}
            </div>
            {totalToPar ? (
              <div className="text-[11px] text-slate-400">{totalToPar}</div>
            ) : null}
          </div>
        </div>
      </button>
      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        {[pair.playerA, pair.playerB].map((pl) => (
          <button
            key={pl.entryId}
            type="button"
            onClick={open}
            className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-left hover:border-sky-400/30 hover:bg-sky-500/10"
          >
            {pl.playerId ? (
              <span
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <FavoriteStar
                  tournamentId={tournamentId}
                  playerId={pl.playerId}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none"
                />
              </span>
            ) : (
              <span className="h-5 w-5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-200">
              {pl.name}
            </span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {pl.holesPlayed}/18
            </span>
            <span className="shrink-0 font-mono text-[12px] font-bold text-emerald-300">
              {fmtScore(pl.net)}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={open}
        className="mt-2 w-full rounded border border-sky-400/30 bg-sky-500/10 px-2 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/20"
      >
        Ver detalle hoyo por hoyo →
      </button>
    </li>
  );
}

function PairTableRows({
  tournamentId,
  pair,
  favSet,
  onOpenDetail,
}: {
  tournamentId: string;
  pair: StrokeAggregatePairRow;
  favSet: Set<string>;
  onOpenDetail: (d: DetailTarget) => void;
}) {
  const openDetail = () => onOpenDetail(pairToDetail(pair));
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
          <button
            type="button"
            onClick={openDetail}
            className="mt-1 block rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-200 hover:bg-sky-500/20"
          >
            Ver detalle →
          </button>
        </td>
        <td className="px-3 py-1.5 text-slate-300">
          <span className="inline-flex max-w-full items-center gap-1">
            {pair.playerA.playerId ? (
              <FavoriteStar
                tournamentId={tournamentId}
                playerId={pair.playerA.playerId}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm leading-none"
              />
            ) : null}
            <button
              type="button"
              onClick={openDetail}
              className="truncate text-left hover:text-sky-200 hover:underline"
            >
              {pair.playerA.name}
            </button>
          </span>
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
          <span className="inline-flex max-w-full items-center gap-1">
            {pair.playerB.playerId ? (
              <FavoriteStar
                tournamentId={tournamentId}
                playerId={pair.playerB.playerId}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm leading-none"
              />
            ) : null}
            <button
              type="button"
              onClick={openDetail}
              className="truncate text-left hover:text-sky-200 hover:underline"
            >
              {pair.playerB.name}
            </button>
          </span>
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

function holeCellClass(strokes: number | null, par: number | null): string {
  if (strokes == null || par == null) return "text-slate-500";
  const d = strokes - par;
  if (d <= -2) return "bg-amber-400/20 font-bold text-amber-200";
  if (d === -1) return "bg-emerald-500/20 font-bold text-emerald-200";
  if (d === 0) return "text-slate-200";
  if (d === 1) return "bg-rose-500/15 text-rose-200";
  return "bg-rose-600/25 font-bold text-rose-100";
}

function StrokeDetailModal({
  tournamentId,
  detail,
  holesByEntry,
  favSet,
  onClose,
}: {
  tournamentId: string;
  detail: DetailTarget;
  holesByEntry: Map<string, HoleDetail[]>;
  favSet: Set<string>;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-sky-500/30 bg-[#0b1422] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-2xl border-b border-white/10 bg-[#0b1422] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-white">
              {detail.title}
            </div>
            {detail.subtitle ? (
              <div className="truncate text-[11px] text-sky-300">{detail.subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-bold text-slate-200 hover:bg-white/10"
          >
            ← Volver
          </button>
        </div>

        <div className="space-y-4 p-4">
          {detail.players.map((pl) => {
            const holes =
              pl.holes ??
              holesByEntry.get(pl.entryId) ??
              [];
            const byNo = new Map(holes.map((h) => [h.hole_number, h]));
            const front = Array.from({ length: 9 }, (_, i) => i + 1);
            const back = Array.from({ length: 9 }, (_, i) => i + 10);
            const isFav = !!pl.playerId && favSet.has(pl.playerId);
            return (
              <div
                key={pl.entryId}
                className={`rounded-xl border p-3 ${
                  isFav ? "border-amber-400/40 bg-amber-500/5" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                    {pl.playerId ? (
                      <FavoriteStar
                        tournamentId={tournamentId}
                        playerId={pl.playerId}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sm leading-none"
                      />
                    ) : null}
                    {pl.name}
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-slate-300">
                    Neto{" "}
                    <span className="font-extrabold text-sky-200">
                      {fmtScore(pl.net)}
                    </span>
                    {fmtToPar(pl.netToPar) ? (
                      <span className="ml-1 text-slate-500">({fmtToPar(pl.netToPar)})</span>
                    ) : null}
                    <span className="ml-2 text-[10px] text-slate-500">
                      {pl.holesPlayed}/18
                    </span>
                  </span>
                </div>

                {holes.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Sin hoyos capturados aún.</p>
                ) : (
                  <div className="space-y-2">
                    {[front, back].map((nums, idx) => (
                      <div key={idx} className="overflow-x-auto">
                        <table className="w-full min-w-[420px] border-collapse text-center text-[11px]">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="px-1 py-0.5 text-left font-semibold">
                                {idx === 0 ? "Ida" : "Vuelta"}
                              </th>
                              {nums.map((n) => (
                                <th key={n} className="px-1 py-0.5 font-semibold">
                                  {n}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="text-slate-500">
                              <td className="px-1 py-0.5 text-left">Par</td>
                              {nums.map((n) => (
                                <td key={n} className="px-1 py-0.5">
                                  {byNo.get(n)?.par ?? "·"}
                                </td>
                              ))}
                            </tr>
                            <tr>
                              <td className="px-1 py-0.5 text-left font-semibold text-slate-300">
                                Golpes
                              </td>
                              {nums.map((n) => {
                                const h = byNo.get(n);
                                return (
                                  <td
                                    key={n}
                                    className={`rounded px-1 py-0.5 ${holeCellClass(
                                      h?.strokes ?? null,
                                      h?.par ?? null
                                    )}`}
                                  >
                                    {h?.strokes ?? "·"}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
