"use client";

import { useState } from "react";
import StrokeAggregateTeeSheetDnD from "@/app/(backoffice)/matchplay/StrokeAggregateTeeSheetDnD";

export default function StrokeAggregateSalidasPanel({
  tournamentId,
  roundNo,
  initialGroupCount,
}: {
  tournamentId: string;
  roundNo: number;
  initialGroupCount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null
  );
  const [groupCount, setGroupCount] = useState(initialGroupCount);

  async function generate(replace: boolean) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/matchplay/create-stroke-consolation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          replace,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        created?: number;
      };
      if (data.ok) {
        setGroupCount(data.created ?? groupCount);
        setMessage({
          tone: "ok",
          text: data.message ?? `${data.created ?? 0} salida(s) creada(s).`,
        });
      } else {
        setMessage({ tone: "err", text: data.error ?? "Error desconocido." });
      }
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : "Error de red.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border-2 border-sky-400 bg-sky-50 p-4 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold text-sky-950">
          Consolación Stroke Play Agregado · R{roundNo}
        </h2>
        <p className="mt-1 text-sm text-sky-900">
          Perdedores de R1, R2 y consolación Match Play en foursomes random por
          género. Se agregan después de las finales (G3 en adelante). Arrastra
          jugadores entre grupos para acomodar las salidas.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          onClick={() => void generate(groupCount > 0)}
        >
          {loading
            ? "Generando…"
            : groupCount > 0
              ? "↻ Regenerar salidas random"
              : "⛳ Crear salidas random"}
        </button>
        {groupCount > 0 ? (
          <span className="self-center text-sm text-sky-800">
            {groupCount} salida(s) stroke agregado
          </span>
        ) : null}
      </div>

      {message ? (
        <div
          className={`mt-2 rounded px-3 py-2 text-sm ${
            message.tone === "err"
              ? "border border-red-300 bg-red-50 text-red-900"
              : "border border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {groupCount > 0 ? (
        <div className="mt-4 rounded-lg border border-sky-300 bg-white p-2">
          <StrokeAggregateTeeSheetDnD tournamentId={tournamentId} />
        </div>
      ) : null}
    </section>
  );
}
