"use client";

import { useCallback, useEffect, useState } from "react";

type ApiMatch = {
  groupId: string;
  groupNo: number | null;
  roundId: string;
  roundNo: number;
  matchplayMatchId: string | null;
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

type Diagnostics = {
  pairFormat: string | null;
  bracketId: string | null;
  bracketPublished: boolean;
  derivedMatchesCount: number;
  decisionsCount: number;
  realMatchesCount: number;
  matchedRealMatches: number;
  alreadyCompleted: number;
  reason: string | null;
};

export default function DecidedMatchesPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, Feedback>>({});
  const [publishingBracket, setPublishingBracket] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);
  const [regeneratingFromPairings, setRegeneratingFromPairings] = useState(false);

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
        diagnostics?: Diagnostics;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setMatches(json.matches ?? []);
      setDiagnostics(json.diagnostics ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando matches.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function handlePublishBracket() {
    if (publishingBracket) return;
    const ok = window.confirm(
      "¿Generar y publicar el cuadro del torneo ahora?\n\n" +
        "Se crearán los cruces a partir de los equipos del match play y se publicará el bracket. " +
        "Después podrás cerrar cada match decidido aquí mismo."
    );
    if (!ok) return;

    setPublishingBracket(true);
    setPublishFeedback(null);
    try {
      const res = await fetch(`/api/matchplay/auto-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        teamCount?: number;
        bracketSize?: number;
        byeCount?: number;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setPublishFeedback({
        kind: "ok",
        text: json.message ?? "Cuadro publicado.",
      });
      // Refrescar listado: ya con bracketPublished=true los botones aparecen.
      await loadList();
    } catch (err) {
      setPublishFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "No se pudo publicar el cuadro.",
      });
    } finally {
      setPublishingBracket(false);
    }
  }

  async function handleRegenerateFromPairings() {
    if (regeneratingFromPairings) return;
    const ok = window.confirm(
      "¿Re-armar el cuadro usando los grupos del calendario R1?\n\n" +
        "Esto BORRA el cuadro actual y crea uno nuevo donde cada grupo de R1 (2 parejas) " +
        "es un match R1 del cuadro. Las parejas activas sin grupo R1 quedan como BYE en R1.\n\n" +
        "Úsalo cuando el cuadro generado por subasta/HI no refleja los enfrentamientos reales " +
        "(por ejemplo, parejas que jugaron R1 aparecen como BYE en el bracket)."
    );
    if (!ok) return;

    setRegeneratingFromPairings(true);
    setPublishFeedback(null);
    try {
      const res = await fetch(`/api/matchplay/auto-publish-from-pairings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        pairedMatchesR1?: number;
        bracketSize?: number;
        byeCount?: number;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setPublishFeedback({
        kind: "ok",
        text: json.message ?? "Cuadro re-armado desde grupos R1.",
      });
      await loadList();
    } catch (err) {
      setPublishFeedback({
        kind: "error",
        text:
          err instanceof Error
            ? err.message
            : "No se pudo re-armar el cuadro.",
      });
    } finally {
      setRegeneratingFromPairings(false);
    }
  }

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
          {diagnostics?.reason ??
            "No hay matches matemáticamente decididos sin cerrar. Los matches que terminen automáticamente aparecerán aquí."}
        </p>
        {diagnostics ? (
          <details className="mt-2 text-[11px] text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">
              Detalle técnico
            </summary>
            <ul className="mt-1 space-y-0.5 pl-4">
              <li>
                Formato de parejas: <code>{diagnostics.pairFormat ?? "—"}</code>
              </li>
              <li>
                Bracket publicado:{" "}
                <code>{diagnostics.bracketId ? "sí" : "no"}</code>
              </li>
              <li>
                Matches derivados (pairings):{" "}
                <code>{diagnostics.derivedMatchesCount}</code>
              </li>
              <li>
                Decisiones calculadas: <code>{diagnostics.decisionsCount}</code>
              </li>
              <li>
                Matches reales en el cuadro:{" "}
                <code>{diagnostics.realMatchesCount}</code>
              </li>
              <li>
                Cruzaron con pairing:{" "}
                <code>{diagnostics.matchedRealMatches}</code>
              </li>
              <li>
                Ya cerrados: <code>{diagnostics.alreadyCompleted}</code>
              </li>
            </ul>
          </details>
        ) : null}
      </section>
    );
  }

  const bracketPublished = diagnostics?.bracketPublished !== false;

  return (
    <section
      className={`mt-8 rounded-2xl border p-4 shadow-sm ${
        bracketPublished
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-amber-300 bg-amber-50/60"
      }`}
    >
      <header className="flex items-center justify-between">
        <h2
          className={
            bracketPublished
              ? "text-base font-semibold text-emerald-900"
              : "text-base font-semibold text-amber-900"
          }
        >
          Matches terminados ({matches.length})
          {bracketPublished ? " · pendientes de cierre" : " · pendientes de publicar bracket"}
        </h2>
        <button
          type="button"
          onClick={loadList}
          className={
            bracketPublished
              ? "rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              : "rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          }
        >
          Refrescar
        </button>
      </header>

      {!bracketPublished ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">⚠️ El cuadro de match play no se ha publicado.</p>
          <p className="mt-1">
            Estas {matches.length} parejas ya tienen resultado matemático. Publica
            el cuadro ahora con un clic — se generan los cruces y, al cerrar cada
            match, el ganador avanza automáticamente al siguiente cruce.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePublishBracket}
              disabled={publishingBracket || regeneratingFromPairings}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {publishingBracket
                ? "Publicando…"
                : "Generar y publicar bracket (auction/HI)"}
            </button>
            <button
              type="button"
              onClick={handleRegenerateFromPairings}
              disabled={publishingBracket || regeneratingFromPairings}
              className="rounded-md border border-amber-500 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              title="Cada grupo R1 del calendario = un match R1 del cuadro"
            >
              {regeneratingFromPairings
                ? "Re-armando…"
                : "Re-armar según grupos R1"}
            </button>
            <a
              href={`/matchplay?tournament_id=${encodeURIComponent(tournamentId)}`}
              className="text-[11px] text-amber-700 underline hover:text-amber-900"
            >
              Abrir configuración avanzada
            </a>
          </div>
          {publishFeedback ? (
            <p
              className={
                publishFeedback.kind === "ok"
                  ? "mt-2 rounded-md bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800"
                  : "mt-2 rounded-md bg-red-100 px-2 py-1 text-[11px] text-red-800"
              }
            >
              {publishFeedback.text}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 space-y-2">
          <p className="text-xs text-emerald-800/80">
            Al cerrar un match, el ganador avanza en el cuadro. Si la pareja rival
            de la siguiente ronda ya jugó, se asigna la nueva salida y se envía un
            mensaje a jugadores y caddies por Telegram.
          </p>
          <details className="rounded-md border border-emerald-200 bg-white/60 px-2 py-1 text-[11px] text-emerald-800/80">
            <summary className="cursor-pointer font-medium hover:text-emerald-900">
              ¿El cuadro no refleja los enfrentamientos reales?
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                Si el cuadro fue sembrado por subasta/HI y las parejas que
                jugaron R1 aparecen como BYE (o cruzadas en rondas tardías),
                puedes re-armarlo usando los grupos del calendario:
              </p>
              <button
                type="button"
                onClick={handleRegenerateFromPairings}
                disabled={regeneratingFromPairings}
                className="rounded-md border border-emerald-400 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {regeneratingFromPairings
                  ? "Re-armando…"
                  : "Re-armar bracket según grupos R1"}
              </button>
              {publishFeedback ? (
                <p
                  className={
                    publishFeedback.kind === "ok"
                      ? "rounded-md bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800"
                      : "rounded-md bg-red-100 px-2 py-1 text-[11px] text-red-800"
                  }
                >
                  {publishFeedback.text}
                </p>
              ) : null}
            </div>
          </details>
        </div>
      )}

      <ul className="mt-3 space-y-3">
        {matches.map((m) => {
          const fb = feedbacks[m.groupId] ?? null;
          const isClosing = closingId === m.groupId;
          const winnerIsTop = m.winnerSide === "top";
          const canClose = m.matchplayMatchId != null;
          return (
            <li
              key={m.groupId}
              className={`rounded-xl border bg-white p-3 ${
                canClose ? "border-emerald-200" : "border-amber-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      canClose
                        ? "text-xs font-semibold text-emerald-700"
                        : "text-xs font-semibold text-amber-700"
                    }
                  >
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

                {canClose ? (
                  <button
                    type="button"
                    onClick={() => handleClose(m)}
                    disabled={isClosing}
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {isClosing ? "Cerrando…" : "Cerrar match y avanzar →"}
                  </button>
                ) : (
                  <span
                    className="shrink-0 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800"
                    title="Necesitas publicar el bracket antes de poder cerrar este match"
                  >
                    Publica el bracket primero
                  </span>
                )}
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
