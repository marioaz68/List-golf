"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FavoriteStar from "@/components/public/FavoriteStar";
import type { ConsolationMatchPlayPublic } from "@/lib/matchplay/loadConsolationMatchPlayPublic";
import type {
  StrokeAggregateGroup,
  StrokeAggregatePairRow,
} from "@/lib/matchplay/strokeAggregateStandings";

type StrokePayload = {
  ok: boolean;
  roundNo: number | null;
  pairs: StrokeAggregatePairRow[];
  groups: StrokeAggregateGroup[];
  message: string;
};

const FAV_KEY = (tournamentId: string) => `listgolf:favorites:${tournamentId}`;

function fmtToPar(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function readFavorites(tournamentId: string): string[] {
  try {
    const raw = window.localStorage.getItem(FAV_KEY(tournamentId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function ConsolationIntegratedPanel({
  tournamentId,
  mode,
  className,
}: {
  tournamentId: string;
  /** live = salidas en vivo · favorites = solo favoritos · leaderboard = clasificación stroke */
  mode: "live" | "favorites" | "leaderboard";
  className?: string;
}) {
  const [mpData, setMpData] = useState<ConsolationMatchPlayPublic | null>(null);
  const [strokeData, setStrokeData] = useState<StrokePayload | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    const [mpRes, strokeRes] = await Promise.all([
      fetch(
        `/api/matchplay/consolation-match?tournament_id=${encodeURIComponent(tournamentId)}`,
        { cache: "no-store" }
      ).then((r) => r.json() as Promise<ConsolationMatchPlayPublic>),
      fetch(
        `/api/matchplay/stroke-aggregate-standings?tournament_id=${encodeURIComponent(tournamentId)}`,
        { cache: "no-store" }
      ).then((r) => r.json() as Promise<StrokePayload>),
    ]);
    setMpData(mpRes);
    setStrokeData(strokeRes);
  }, [tournamentId]);

  useEffect(() => {
    setFavs(readFavorites(tournamentId));
    setHydrated(true);
    const onChange = () => setFavs(readFavorites(tournamentId));
    window.addEventListener("listgolf-favorites-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("listgolf-favorites-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [tournamentId]);

  useEffect(() => {
    void load();
    if (mode === "leaderboard") return;
    const poll = setInterval(() => void load(), 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, mode]);

  const favSet = useMemo(() => new Set(favs), [favs]);

  const mpGroups = useMemo(() => {
    const groups = mpData?.groups ?? [];
    if (mode !== "favorites" || !hydrated) return groups;
    return groups.filter((g) =>
      [...g.topPlayers, ...g.bottomPlayers].some((p) => favSet.has(p.playerId))
    );
  }, [mpData?.groups, mode, favSet, hydrated]);

  const strokeGroups = useMemo(() => {
    const groups = strokeData?.groups ?? [];
    if (mode !== "favorites" || !hydrated) return groups;
    return groups.filter((g) =>
      g.members.some((m) => m.playerId && favSet.has(m.playerId))
    );
  }, [strokeData?.groups, mode, favSet, hydrated]);

  const strokePairs = useMemo(() => {
    const pairs = strokeData?.pairs ?? [];
    if (mode !== "favorites" || !hydrated) return pairs;
    return pairs.filter(
      (p) =>
        (p.playerA.playerId && favSet.has(p.playerA.playerId)) ||
        (p.playerB.playerId && favSet.has(p.playerB.playerId))
    );
  }, [strokeData?.pairs, mode, favSet, hydrated]);

  const hasMp = mpGroups.length > 0;
  const hasStrokeLive = strokeGroups.length > 0;
  const hasStrokeLb = strokePairs.length > 0;

  if (!hasMp && !hasStrokeLive && !hasStrokeLb) {
    if (mode === "favorites" && hydrated) {
      return (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
          Ninguno de tus favoritos está en consolación en este momento.
        </p>
      );
    }
    return null;
  }

  return (
    <div className={`${className ?? "mt-6"} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
          Consolación
          {mode === "live" ? " · en vivo" : mode === "favorites" ? " · favoritos" : " · clasificación"}
        </h2>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Link
            href={`/torneos/${tournamentId}/consolacion-match`}
            className="rounded border border-violet-400/30 px-2 py-0.5 text-violet-200 hover:bg-violet-950/40"
          >
            Match play →
          </Link>
          <Link
            href={`/torneos/${tournamentId}/consolacion-stroke`}
            className="rounded border border-sky-400/30 px-2 py-0.5 text-sky-200 hover:bg-sky-950/40"
          >
            Stroke agregado →
          </Link>
        </div>
      </div>

      {hasMp ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-violet-300">Match Play</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {mpGroups.map((g) => (
              <li
                key={g.groupId}
                className={`rounded-lg border p-3 ${
                  g.cardsClosed
                    ? "border-slate-500/30 bg-slate-950/40"
                    : g.liveText
                      ? "border-sky-500/30 bg-sky-950/20"
                      : "border-white/10 bg-white/5"
                }`}
              >
                <div className="text-[10px] font-bold text-violet-300">
                  G{g.groupNo}
                  {g.teeTime ? ` · ${g.teeTime}` : ""}
                  {g.cardsClosed ? " · cerrada" : ""}
                </div>
                <div className="mt-1 text-xs text-white">{g.topLabel}</div>
                <div className="text-[10px] text-slate-500">vs</div>
                <div className="text-xs text-white">{g.bottomLabel}</div>
                <div className="mt-1 text-[11px] font-semibold text-emerald-300">
                  {g.cardsClosed
                    ? g.resultText ?? "Tarjeta cerrada"
                    : g.liveText ?? g.resultText ?? "—"}
                </div>
                {mode === "favorites" ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...g.topPlayers, ...g.bottomPlayers]
                      .filter((p) => favSet.has(p.playerId))
                      .map((p) => (
                        <span
                          key={p.playerId}
                          className="inline-flex items-center gap-0.5 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300"
                        >
                          <FavoriteStar
                            tournamentId={tournamentId}
                            playerId={p.playerId}
                            className="inline-flex h-4 w-4 items-center justify-center text-[9px]"
                          />
                          {p.name}
                        </span>
                      ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mode !== "leaderboard" && hasStrokeLive ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-sky-300">
            Stroke agregado · salidas
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {strokeGroups.map((g) => (
              <li
                key={g.groupId}
                className={`rounded-lg border p-3 ${
                  g.cardsClosed
                    ? "border-slate-500/30 bg-slate-950/40"
                    : "border-sky-500/30 bg-sky-950/20"
                }`}
              >
                <div className="text-[10px] font-bold text-sky-300">
                  G{g.groupNo} · {g.label}
                  {g.teeTime ? ` · ${g.teeTime.slice(0, 5)}` : ""}
                  {g.cardsClosed ? " · cerrada" : ""}
                </div>
                <ul className="mt-2 space-y-1">
                  {g.members.map((m) => (
                    <li
                      key={m.entryId}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="flex min-w-0 items-center gap-1 text-slate-200">
                        {m.playerId ? (
                          <FavoriteStar
                            tournamentId={tournamentId}
                            playerId={m.playerId}
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[9px]"
                          />
                        ) : null}
                        <span className="truncate">{m.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-emerald-300">
                        {m.net != null ? `${m.net}${fmtToPar(m.netToPar) ? ` (${fmtToPar(m.netToPar)})` : ""}` : "—"}
                        {m.lockedAt ? " 🔒" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(mode === "leaderboard" || mode === "live") && hasStrokeLb ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-sky-300">
            Stroke agregado · clasificación
          </h3>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[420px] text-[11px] text-white">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-slate-400">
                  <th className="px-2 py-1.5 text-left">POS</th>
                  <th className="px-2 py-1.5 text-left">Pareja</th>
                  <th className="px-2 py-1.5 text-right">Net agregado</th>
                </tr>
              </thead>
              <tbody>
                {(mode === "leaderboard" ? strokeData?.pairs ?? [] : strokePairs).map(
                  (p) => (
                    <tr key={p.pairId} className="border-b border-white/5">
                      <td className="px-2 py-1.5 font-bold text-slate-300">
                        {p.tied ? `T${p.position}` : p.position}
                      </td>
                      <td className="px-2 py-1.5">
                        <div>{p.label}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.playerA.name} / {p.playerB.name}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-emerald-300">
                        {p.aggregateNet ?? "—"}
                        {p.aggregateNetToPar != null
                          ? ` (${fmtToPar(p.aggregateNetToPar)})`
                          : ""}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
