"use client";

import { useCallback, useEffect, useState } from "react";

type ApiMatch = {
  groupId: string;
  groupNo: number | null;
  roundId: string;
  roundNo: number;
  matchplayMatchId: string;
  resultText: string;
  decidedAtHole: number;
  viaPlayoff: boolean;
  playoffHole: number | null;
  topPair: { pairId: string; label: string; playerNames: string[] };
  bottomPair: { pairId: string; label: string; playerNames: string[] };
  winnerSide: "top" | "bottom";
  topTotal: number;
  bottomTotal: number;
};

type Feedback = {
  kind: "success" | "error";
  text: string;
};

export default function DecidedMatchesPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, Feedback>>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/matchplay/decided-pending?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok: boolean;
        matches?: ApiMatch[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setMatches(json.matches ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando matches.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function handleClose(match: ApiMatch) {
    const winnerLabel =
      match.winnerSide === "top" ? match.topPair.label : match.bottomPair.label;
    const ok = window.confirm(
      `¿Cerrar match y avanzar a ${winnerLabel}?\n\n` +
        `Resultado: ${match.resultText}\n` +
        `Esto moverá al ganador en el cuadro y, si la siguiente pareja ya está lista, ` +
        `generará la salida y enviará la notificación por Telegram a jugadores y caddies.`
    );
    if (!ok) return;

    setClosingId(match.groupId);
    setFeedbacks((prev) => {
      if (!(match.groupId in prev)) return prev;
      const next = { ...prev };
      delete next[match.groupId];
      return next;
    });
    try {
      const res = await fetch(`/api/captura/close-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: match.groupId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        nextGroupCreated?: boolean;
        nextGroupNo?: number | null;
        nextTeeTime?: string | null;
        telegramNotified?: { sent: number; failed: number; skipped: number };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const lines = [json.message ?? "Match cerrado."];
      if (json.nextGroupCreated && json.nextGroupNo != null) {
        lines.push(
          `Salida creada: G${json.nextGroupNo}${
            json.nextTeeTime ? ` · ${json.nextTeeTime}` : ""
          }.`
        );
      }
      if (json.telegramNotified && json.telegramNotified.sent > 0) {
        lines.push(
          `Telegram: ${json.telegramNotified.sent} enviado(s)${
            json.telegramNotified.failed
              ? `, ${json.telegramNotified.failed} fallaron`
              : ""
          }.`
        );
      }
      setFeedbacks((prev) => ({
        ...prev,
        [match.groupId]: { kind: "success", text: lines.join(" ") },
      }));
      setMatches((prev) =>
        prev ? prev.filter((m) => m.groupId !== match.groupId) : prev
      );
    } catch (err) {
      setFeedbacks((prev) => ({
        ...prev,
        [match.groupId]: {
          kind: "error",
          text: err instanceof Error ? err.message : "Error cerrando match.",
        },
      }));
    } finally {
      setClosingId(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Matches terminados pendientes de cierre
          </h2>
        </header>
        <p className="mt-3 text-sm text-slate-500">Cargando…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-red-800">
            Matches terminados pendientes de cierre
          </h2>
          <button
            type="button"
            onClick={loadList}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </header>
        <p className="mt-3 text-sm text-red-700">{error}</p>
      </section>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Matches terminados pendientes de cierre
          </h2>
          <button
            type="button"
            onClick={loadList}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Refrescar
          </button>
        </header>
        <p className="mt-3 text-sm text-slate-500">
          No hay matches matemáticamente decididos sin cerrar. Los matches que
          terminen automáticamente aparecerán aquí.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-emerald-900">
          Matches terminados pendientes de cierre ({matches.length})
        </h2>
        <button
          type="button"
          onClick={loadList}
          className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Refrescar
        </button>
      </header>

      <p className="mt-1 text-xs text-emerald-800/80">
        Al cerrar un match, el ganador avanza en el cuadro. Si la pareja rival
        de la siguiente ronda ya jugó, se asigna la nueva salida y se envía un
        mensaje a jugadores y caddies por Telegram.
      </p>

      <ul className="mt-3 space-y-3">
        {matches.map((m) => {
          const fb = feedbacks[m.groupId] ?? null;
          const isClosing = closingId === m.groupId;
          const winnerIsTop = m.winnerSide === "top";
          return (
            <li
              key={m.groupId}
              className="rounded-xl border border-emerald-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-emerald-700">
                    R{m.roundNo} · G{m.groupNo ?? "?"} · {m.resultText}
                  </p>
                  <div className="mt-1 grid gap-1 text-sm md:grid-cols-2">
                    <p
                      className={
                        winnerIsTop
                          ? "font-semibold text-emerald-800"
                          : "text-slate-500 line-through"
                      }
                      title={m.topPair.label}
                    >
                      {winnerIsTop ? "✓ " : "✕ "}
                      {m.topPair.label}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({m.topTotal})
                      </span>
                    </p>
                    <p
                      className={
                        !winnerIsTop
                          ? "font-semibold text-emerald-800"
                          : "text-slate-500 line-through"
                      }
                      title={m.bottomPair.label}
                    >
                      {!winnerIsTop ? "✓ " : "✕ "}
                      {m.bottomPair.label}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({m.bottomTotal})
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleClose(m)}
                  disabled={isClosing}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {isClosing ? "Cerrando…" : "Cerrar match y avanzar →"}
                </button>
              </div>

              {fb ? (
                <p
                  className={
                    fb.kind === "success"
                      ? "mt-2 rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-800"
                      : "mt-2 rounded-md bg-red-100 px-2 py-1 text-xs text-red-800"
                  }
                >
                  {fb.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
