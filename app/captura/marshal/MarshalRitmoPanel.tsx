"use client";

import { useCallback, useEffect, useState } from "react";
import { RitmoMap, type GroupDot } from "@/app/ritmo/demo/RitmoMap";
import { useViewport } from "@/app/ritmo/demo/useViewport";

type RitmoPayload = {
  tournamentName: string;
  roundLabel: string;
  mapGroups: GroupDot[];
  counts: {
    atrasado: number;
    en_ritmo: number;
    adelantado: number;
    sin_datos: number;
    cerrado: number;
  };
};

export default function MarshalRitmoPanel({
  tg,
  tournamentId,
}: {
  tg: string;
  tournamentId: string | null;
}) {
  const vp = useViewport();
  const [data, setData] = useState<RitmoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tg, tournament_id: tournamentId });
      const res = await fetch(`/api/marshal/ritmo?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Sin datos de ritmo para este torneo.");
        setData(null);
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Error cargando ritmo.");
        setData(null);
        return;
      }
      setError(null);
      setData({
        tournamentName: json.tournamentName,
        roundLabel: json.roundLabel,
        mapGroups: json.mapGroups as GroupDot[],
        counts: json.counts,
      });
    } finally {
      setLoading(false);
    }
  }, [tg, tournamentId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!tournamentId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Elige un torneo para ver el mapa de ritmo.
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13 }}>
        {loading ? "Cargando mapa…" : "—"}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #1e293b",
          fontSize: 11,
          color: "#94a3b8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>
          {data.roundLabel} · {data.mapGroups.length} en cancha
        </span>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 8px",
            borderRadius: 6,
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            cursor: "pointer",
          }}
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 10,
          color: "#cbd5e1",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <span>🔴 {data.counts.atrasado} lentos</span>
        <span>🟢 {data.counts.en_ritmo} en ritmo</span>
        <span>🔵 {data.counts.adelantado} adelant.</span>
        <span>⚪ {data.counts.sin_datos} sin ritmo</span>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: "50vh" }}>
        <RitmoMap
          groups={data.mapGroups}
          selectedId={selectedId}
          showHoleLabels={false}
          rotate={vp.shouldRotateMap}
          onSelectGroup={(id) =>
            setSelectedId((prev) => (prev === id ? null : id))
          }
        />
      </div>
    </div>
  );
}
