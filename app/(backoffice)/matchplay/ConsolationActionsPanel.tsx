"use client";

import { useState } from "react";

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  padding: "0 12px",
  borderRadius: "6px",
  border: "1px solid #155e75",
  background: "linear-gradient(#0891b2, #0e7490)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "11px",
  cursor: "pointer",
};

type Result = {
  ok?: boolean;
  message?: string;
  error?: string;
  created?: number;
  processed?: number;
  groupsCreated?: number;
};

export default function ConsolationActionsPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null
  );

  async function call(endpoint: string, key: string) {
    setLoading(key);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = (await res.json()) as Result;
      if (data.ok) {
        setResult({
          tone: "ok",
          text:
            data.message ??
            `Listo. ${data.created ?? data.processed ?? 0} salida(s).`,
        });
      } else {
        setResult({ tone: "err", text: data.error ?? "Error desconocido." });
      }
    } catch (err) {
      setResult({
        tone: "err",
        text: err instanceof Error ? err.message : "Error de red.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-[#1a1206] p-3">
      <div>
        <h3 className="text-sm font-bold text-amber-200">Consolaciones</h3>
        <p className="mt-1 text-[11px] text-amber-100/70">
          Genera las salidas de consolación según la convocatoria: perdedores de
          R3 → Consolación Match Play (R4–R5); perdedores de R1, R2 y de la
          consolación MP → Stroke Play Agregado en la última ronda (foursomes
          random por género).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          style={btn}
          disabled={loading != null}
          onClick={() =>
            call("/api/matchplay/backfill-consolation", "mp")
          }
        >
          {loading === "mp" ? "Generando…" : "↻ Consolación Match Play"}
        </button>
        <button
          type="button"
          style={btn}
          disabled={loading != null}
          onClick={() =>
            call("/api/matchplay/create-stroke-consolation", "stroke")
          }
        >
          {loading === "stroke" ? "Creando…" : "⛳ Crear salidas Stroke Agregado"}
        </button>
      </div>

      {result ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            result.tone === "err"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {result.text}
        </div>
      ) : null}
    </div>
  );
}
