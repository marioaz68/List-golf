"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RitmoMap, type GroupDot, type MarshalDot } from "@/app/ritmo/demo/RitmoMap";

type RitmoPayload = {
  tournamentName: string;
  roundLabel: string;
  mapGroups: GroupDot[];
  mapMarshals: MarshalDot[];
  counts: {
    atrasado: number;
    en_ritmo: number;
    adelantado: number;
    sin_datos: number;
    cerrado: number;
  };
};

const STATUS_COLOR: Record<GroupDot["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
  sin_datos: "#6b7280",
  cerrado: "#64748b",
};

const STATUS_RANK: Record<GroupDot["status"], number> = {
  atrasado: 0,
  sin_datos: 1,
  en_ritmo: 2,
  adelantado: 3,
  cerrado: 4,
};

const MAP_HEIGHT = "calc(100dvh - 210px)";

export default function MarshalRitmoPanel({
  tg,
  tournamentId,
  roundId = null,
  active = true,
  onOpenGroup,
}: {
  tg: string;
  tournamentId: string | null;
  roundId?: string | null;
  active?: boolean;
  /** Abre capturas retrasadas enfocadas en ese grupo (pestaña Capturas). */
  onOpenGroup?: (groupId: string) => void;
}) {
  const [data, setData] = useState<RitmoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [mapHits, setMapHits] = useState<
    Array<{ id: string; number: number; left: number; top: number }>
  >([]);

  const refresh = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tg, tournament_id: tournamentId });
      if (roundId) params.set("round_id", roundId);
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
        mapMarshals: (json.mapMarshals ?? []) as MarshalDot[],
        counts: json.counts,
      });
    } finally {
      setLoading(false);
    }
  }, [tg, tournamentId, roundId]);

  useEffect(() => {
    if (!active) return;
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh, active]);

  useEffect(() => {
    if (!active || !data) return;
    const id = window.setTimeout(() => setMapEpoch((n) => n + 1), 80);
    return () => window.clearTimeout(id);
  }, [active, data?.roundLabel, tournamentId]);

  const chipGroups = useMemo(() => {
    if (!data) return [];
    return [...data.mapGroups].sort((a, b) => {
      const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (r !== 0) return r;
      return a.number - b.number;
    });
  }, [data]);

  if (!tournamentId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        Sin torneo asignado para hoy.
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
          {data.mapMarshals.length > 0
            ? ` · ${data.mapMarshals.length} marshal${data.mapMarshals.length === 1 ? "" : "s"} GPS`
            : ""}
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
        {data.mapMarshals.length > 0 ? (
          <span>🔵 {data.mapMarshals.length} marshal GPS</span>
        ) : null}
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: MAP_HEIGHT,
          minHeight: 320,
          flexShrink: 0,
        }}
      >
        <RitmoMap
          key={`marshal-map-${tournamentId}-${mapEpoch}`}
          groups={data.mapGroups}
          marshals={data.mapMarshals}
          showHoleLabels={false}
          rotate={false}
          onHitsChange={setMapHits}
        />

        {/* Chips G# idénticos a ritmo backoffice */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            zIndex: 5000,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            pointerEvents: "auto",
          }}
        >
          {chipGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onOpenGroup?.(g.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 36,
                height: 32,
                padding: "0 10px",
                borderRadius: 999,
                background: STATUS_COLOR[g.status],
                color: "#fff",
                fontSize: 13,
                fontWeight: 900,
                border: "2px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
              title={`${g.label} · ${g.status} → captura`}
            >
              G{g.number}
            </button>
          ))}
        </div>

        {mapHits.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Grupo ${t.number}`}
            title={`G${t.number} → captura`}
            onClick={() => onOpenGroup?.(t.id)}
            style={{
              position: "absolute",
              left: t.left,
              top: t.top,
              width: 44,
              height: 44,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              zIndex: 5000,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            zIndex: 900,
            pointerEvents: "none",
            background: "rgba(0,0,0,0.78)",
            color: "#e2e8f0",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 10,
            lineHeight: 1.45,
            maxWidth: 280,
          }}
        >
          Toca <b>G#</b> (rojo atrasado · verde ritmo · azul adelantado) →
          capturas de ese grupo.
        </div>

        {data.mapGroups.length === 0 ? (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              right: 12,
              zIndex: 500,
              background: "rgba(0,0,0,0.72)",
              color: "#cbd5e1",
              padding: "8px 10px",
              borderRadius: 8,
              fontSize: 11,
              textAlign: "center",
            }}
          >
            Sin grupos en cancha todavía · el mapa del campo sigue activo
          </div>
        ) : null}
      </div>
    </div>
  );
}
