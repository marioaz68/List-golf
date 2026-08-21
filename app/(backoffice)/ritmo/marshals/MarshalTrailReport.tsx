"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RitmoMap,
  type MarshalDot,
  type MarshalTrailPath,
} from "@/app/ritmo/demo/RitmoMap";
import type { MarshalDayTrail } from "@/lib/marshal/loadMarshalDayTrails";

type Props = {
  tournamentId: string;
  tournamentName: string;
  day: string;
  initialTrails: MarshalDayTrail[];
  computedAtISO: string;
};

function fmtMin(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return min ? `${h} h ${min} min` : `${h} h`;
}

function agoLabel(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)} h`;
}

function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export default function MarshalTrailReport({
  tournamentId,
  tournamentName,
  day,
  initialTrails,
  computedAtISO,
}: Props) {
  const [trails, setTrails] = useState(initialTrails);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTrails[0]?.profileId ?? null
  );
  const [updatedAt, setUpdatedAt] = useState(computedAtISO);
  const [live, setLive] = useState(true);

  useEffect(() => {
    setTrails(initialTrails);
    if (
      selectedId &&
      !initialTrails.some((t) => t.profileId === selectedId) &&
      initialTrails[0]
    ) {
      setSelectedId(initialTrails[0].profileId);
    }
  }, [initialTrails, selectedId]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ritmo/marshal-trails?tournament_id=${encodeURIComponent(
          tournamentId
        )}&day=${encodeURIComponent(day)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!json?.ok || !Array.isArray(json.trails)) return;
      setTrails(json.trails as MarshalDayTrail[]);
      setUpdatedAt(String(json.computedAtISO ?? new Date().toISOString()));
    } catch {
      /* ignore */
    }
  }, [tournamentId, day]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 20000);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  const selected = useMemo(
    () => trails.find((t) => t.profileId === selectedId) ?? null,
    [trails, selectedId]
  );

  const mapTrails: MarshalTrailPath[] = useMemo(() => {
    return trails.map((t) => ({
      id: t.profileId,
      color: t.color,
      active: !selectedId || t.profileId === selectedId,
      points: t.points.map((p) => ({ lat: p.lat, lon: p.lon })),
    }));
  }, [trails, selectedId]);

  const mapMarshals: MarshalDot[] = useMemo(() => {
    const out: MarshalDot[] = [];
    for (const t of trails) {
      const last = t.points[t.points.length - 1];
      if (!last) continue;
      out.push({
        id: t.profileId,
        lat: last.lat,
        lon: last.lon,
        initials: t.initials,
        name: t.name,
        hoyo: null,
        updatedAt: t.stats.lastTs,
      });
    }
    return out;
  }, [trails]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 340px) 1fr",
        height: "calc(100dvh - 90px)",
        minHeight: 420,
        gap: 0,
        background: "#0a0f14",
        color: "#e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #1f2937",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #1f2937",
          overflow: "auto",
          background: "#0f1419",
          padding: 12,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <Link
            href={`/ritmo?tournament_id=${encodeURIComponent(tournamentId)}`}
            style={{ fontSize: 11, color: "#93c5fd", textDecoration: "none" }}
          >
            ← Ritmo en vivo
          </Link>
          <h1 style={{ fontSize: 16, fontWeight: 800, margin: "6px 0 2px" }}>
            Recorrido marshals
          </h1>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {tournamentName} · {day}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
            Estático = ≤100 m · GPS apagado = sin ping ≥3 min
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 5,
              border: `1px solid ${live ? "#16a34a" : "#374151"}`,
              background: live ? "#14532d" : "#1f2937",
              color: live ? "#bbf7d0" : "#cbd5e1",
              cursor: "pointer",
            }}
          >
            {live ? "● En vivo 20s" : "○ Pausa"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 5,
              border: "1px solid #374151",
              background: "#1f2937",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            ↻ Actualizar
          </button>
          <span style={{ fontSize: 10, color: "#6b7280" }}>
            {agoLabel(updatedAt)}
          </span>
        </div>

        {trails.length === 0 ? (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "#1f2937",
              fontSize: 12,
              color: "#9ca3af",
            }}
          >
            Sin pings GPS de marshals en este día.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {trails.map((t) => {
              const active = t.profileId === selectedId;
              return (
                <li key={t.profileId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.profileId)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${active ? t.color : "#374151"}`,
                      background: active ? "#111827" : "#0b1220",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: t.color,
                          color: "#0f172a",
                          fontSize: 9,
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {t.initials}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>
                        {t.name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 4,
                        fontSize: 10,
                        color: "#cbd5e1",
                      }}
                    >
                      <span>Pings: {t.stats.pointCount}</span>
                      <span>Dist: {t.stats.distanceM} m</span>
                      <span title="Permaneció dentro de 100 m">
                        Estático: {fmtMin(t.stats.staticMin)}
                      </span>
                      <span title="Huecos ≥3 min sin ping">
                        GPS off: {fmtMin(t.stats.gpsOffMin)}
                      </span>
                      <span>En movimiento: {fmtMin(t.stats.movingMin)}</span>
                      <span>Último: {agoLabel(t.stats.lastTs)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected ? (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Detalle · {selected.name}
            </div>
            <div style={{ fontSize: 11, color: "#e5e7eb", marginBottom: 8 }}>
              Ventana {fmtMin(selected.stats.spanMin)} · desde primer ping
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
              Estancias ≥2 min (≤100 m)
            </div>
            {selected.stats.dwells.length === 0 ? (
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
                Ninguna estancia larga.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 12px",
                  padding: 0,
                  fontSize: 11,
                  color: "#cbd5e1",
                }}
              >
                {selected.stats.dwells
                  .slice()
                  .sort((a, b) => b.durationMin - a.durationMin)
                  .slice(0, 8)
                  .map((d, i) => (
                    <li key={`${d.startTs}-${i}`} style={{ marginBottom: 4 }}>
                      {fmtMin(d.durationMin)} · {timeLabel(d.startTs)}–
                      {timeLabel(d.endTs)}
                    </li>
                  ))}
              </ul>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
              GPS apagado / sin datos (≥3 min)
            </div>
            {selected.stats.gaps.length === 0 ? (
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Sin huecos largos.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  fontSize: 11,
                  color: "#fca5a5",
                }}
              >
                {selected.stats.gaps
                  .slice()
                  .sort((a, b) => b.durationMin - a.durationMin)
                  .slice(0, 10)
                  .map((g, i) => (
                    <li key={`${g.startTs}-${i}`} style={{ marginBottom: 4 }}>
                      {fmtMin(g.durationMin)} · {timeLabel(g.startTs)}–
                      {Date.now() - new Date(g.endTs).getTime() < 120_000
                        ? "ahora"
                        : timeLabel(g.endTs)}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ) : null}
      </aside>

      <div style={{ position: "relative", minHeight: 0 }}>
        <RitmoMap
          groups={[]}
          marshals={
            selected
              ? mapMarshals.filter((m) => m.id === selected.profileId)
              : mapMarshals
          }
          trails={mapTrails}
          showHoleLabels={false}
          rotate={false}
        />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            zIndex: 1000,
            background: "rgba(0,0,0,0.78)",
            color: "#e2e8f0",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 10,
            maxWidth: 320,
            lineHeight: 1.4,
          }}
        >
          Línea = recorrido del día. Punto grande = última posición. Elige un
          marshal a la izquierda para resaltar su trazo.
        </div>
      </div>
    </div>
  );
}
