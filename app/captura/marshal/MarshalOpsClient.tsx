"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { initTelegramWebApp } from "@/lib/telegram/miniapp";
import type { CaptureLagKind } from "@/lib/ritmo/captureLag";
import { isCaptureProblem } from "@/lib/ritmo/captureLag";
import {
  capturerRoleLabel,
  compareGroupsForMarshalRoute,
  type ActiveCapturer,
} from "@/lib/ritmo/activeCapturers";
import type { CaptureLagGroupRow } from "@/lib/ritmo/loadCaptureLagGroups";
import type {
  MarshalOpsPayload,
  MarshalTournamentOption,
} from "@/lib/marshal/loadMarshalOpsData";
import MarshalRitmoPanel from "./MarshalRitmoPanel";

type Tab = "capturas" | "ritmo" | "resultados";

const KIND_META: Record<
  CaptureLagKind,
  { label: string; color: string; bg: string }
> = {
  critico: { label: "CRÍTICO", color: "#991b1b", bg: "#fef2f2" },
  atrasado: { label: "ATRASADO", color: "#9a3412", bg: "#fff7ed" },
  silencioso: { label: "SILENCIO", color: "#854d0e", bg: "#fefce8" },
  ok: { label: "AL DÍA", color: "#065f46", bg: "#ecfdf5" },
  no_salido: { label: "PENDIENTE", color: "#475569", bg: "#f8fafc" },
  sin_hora: { label: "SIN HORA", color: "#334155", bg: "#f1f5f9" },
  terminado: { label: "TERMINÓ", color: "#1e3a8a", bg: "#eff6ff" },
  cerrado: { label: "CERRADA", color: "#334155", bg: "#f1f5f9" },
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

function agoLabel(iso: string | null): string {
  if (!iso) return "nunca";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `hace ${h} h${m ? ` ${m} m` : ""}`;
}

function holeLine(g: CaptureLagGroupRow): string {
  if (g.kind === "terminado" || g.holesPlayed >= 18) return "H18 · completo";
  if (g.captureHole != null && g.expectedHole != null) {
    return `H${g.captureHole} · deberían H${g.expectedHole}`;
  }
  if (g.captureHole != null) return `van en H${g.captureHole}`;
  if (g.expectedHole != null) return `deberían H${g.expectedHole}`;
  return `salida H${g.startingHole}`;
}

function PaceDelayBadge({
  minutes,
  holesBehind,
}: {
  minutes: number | null;
  holesBehind: number;
}) {
  if (minutes == null || minutes <= 0) {
    if (holesBehind <= 0) return null;
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#9a3412",
          background: "#fff7ed",
          padding: "4px 8px",
          borderRadius: 8,
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {holesBehind} hoyo{holesBehind === 1 ? "" : "s"} atrás
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: minutes >= 20 ? "#991b1b" : "#9a3412",
        background: minutes >= 20 ? "#fef2f2" : "#fff7ed",
        padding: "4px 8px",
        borderRadius: 8,
        whiteSpace: "nowrap",
        textAlign: "right",
        lineHeight: 1.25,
      }}
    >
      ~{minutes} min
      <span style={{ display: "block", fontSize: 9, fontWeight: 700, opacity: 0.85 }}>
        ritmo campo
      </span>
    </span>
  );
}

function CapturerChips({ capturers }: { capturers: ActiveCapturer[] }) {
  if (capturers.length === 0) {
    return (
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Sin capturista activo</span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {capturers.map((c) => (
        <span
          key={`${c.role}-${c.name}`}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 6,
            background: "#1e293b",
            color: "#e2e8f0",
          }}
        >
          {c.name} · {capturerRoleLabel(c.role)}
        </span>
      ))}
    </div>
  );
}

interface Props {
  tg: string;
  initial: MarshalOpsPayload;
  initialTournamentId: string | null;
}

export default function MarshalOpsClient({
  tg,
  initial,
  initialTournamentId,
}: Props) {
  const [tab, setTab] = useState<Tab>("capturas");
  const [data, setData] = useState<MarshalOpsPayload>(initial);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  const selectedTournamentId =
    data.selectedTournamentId ?? initialTournamentId ?? null;

  const selectedTournament = useMemo(
    () =>
      data.tournaments.find((t) => t.id === selectedTournamentId) ??
      data.tournaments[0] ??
      null,
    [data.tournaments, selectedTournamentId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tg });
      if (selectedTournamentId) {
        params.set("tournament_id", selectedTournamentId);
      }
      const res = await fetch(`/api/marshal/capture-lag?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) {
        setData({
          marshalName: json.marshalName,
          today: json.today,
          computedAtISO: json.computedAtISO,
          tournaments: json.tournaments as MarshalTournamentOption[],
          selectedTournamentId: json.selectedTournamentId,
          groups: json.groups as CaptureLagGroupRow[],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [tg, selectedTournamentId]);

  useEffect(() => {
    initTelegramWebApp();
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const base = new Date(data.computedAtISO).getTime();
    const tick = () =>
      setSecondsAgo(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data.computedAtISO]);

  const sorted = useMemo(
    () => [...data.groups].sort(compareGroupsForMarshalRoute),
    [data.groups]
  );

  const visible = useMemo(() => {
    if (!onlyProblems) return sorted;
    return sorted.filter((g) => isCaptureProblem(g.kind));
  }, [sorted, onlyProblems]);

  const problemN = useMemo(
    () =>
      data.groups.filter((g) => isCaptureProblem(g.kind)).length,
    [data.groups]
  );

  function selectTournament(id: string) {
    const params = new URLSearchParams({ tg, tournament_id: id });
    window.location.href = `/captura/marshal?${params.toString()}`;
  }

  const livePath = selectedTournament?.liveResultsPath ?? null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "-apple-system, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #1e293b",
          background: "#020617",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              Panel marshal
            </h1>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {data.marshalName} · {data.today}
            </div>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "6px 10px",
              borderRadius: 8,
              background: "#2563eb",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            {loading ? "…" : "↻"}
          </button>
        </div>

        {data.tournaments.length > 1 ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              marginTop: 10,
              paddingBottom: 2,
            }}
          >
            {data.tournaments.map((t) => {
              const active = t.id === selectedTournamentId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTournament(t.id)}
                  style={{
                    flex: "0 0 auto",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "#2563eb" : "#334155"}`,
                    background: active ? "#2563eb" : "#1e293b",
                    color: active ? "#fff" : "#cbd5e1",
                    cursor: "pointer",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : selectedTournament ? (
          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 8 }}>
            {selectedTournament.name}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setTab("capturas")}
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === "capturas" ? "#2563eb" : "#1e293b",
              color: tab === "capturas" ? "#fff" : "#94a3b8",
            }}
          >
            Capturas retrasadas
            {problemN > 0 ? ` (${problemN})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("ritmo")}
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === "ritmo" ? "#2563eb" : "#1e293b",
              color: tab === "ritmo" ? "#fff" : "#94a3b8",
            }}
          >
            Ritmo del campo
          </button>
          <button
            type="button"
            onClick={() => setTab("resultados")}
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === "resultados" ? "#2563eb" : "#1e293b",
              color: tab === "resultados" ? "#fff" : "#94a3b8",
            }}
          >
            Resultados en vivo
          </button>
        </div>
      </header>

      {tab === "capturas" ? (
        <>
          <div
            style={{
              padding: "8px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #1e293b",
              fontSize: 11,
              color: "#64748b",
            }}
          >
            <span>
              {visible.length} grupo{visible.length === 1 ? "" : "s"} · hace{" "}
              {secondsAgo}s
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
              />
              Solo problemas
            </label>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 24px" }}>
            {data.tournaments.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "#94a3b8",
                  fontSize: 13,
                }}
              >
                No hay torneos con ronda hoy en tu club.
              </div>
            ) : visible.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 16px",
                  color: "#6ee7b7",
                  fontSize: 13,
                }}
              >
                {onlyProblems
                  ? "Sin capturas retrasadas ahora mismo."
                  : "No hay grupos en cancha todavía."}
              </div>
            ) : (
              visible.map((g, idx) => {
                const meta = KIND_META[g.kind];
                const expanded = expandedId === g.id;
                return (
                  <div
                    key={g.id}
                    style={{
                      marginBottom: 10,
                      borderRadius: 12,
                      border: `1px solid ${meta.color}55`,
                      background: "#0b1220",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId((prev) => (prev === g.id ? null : g.id))
                      }
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          alignItems: "flex-start",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ fontWeight: 800, fontSize: 15 }}>
                              #{idx + 1} · G{g.number}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: meta.color,
                                background: meta.bg,
                                padding: "2px 6px",
                                borderRadius: 6,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
                            {holeLine(g)}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            Salida {formatTime(g.teeTime)} · {g.reason}
                          </div>
                          {g.paceDelayMinutes != null && g.paceDelayMinutes > 0 ? (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: g.paceDelayMinutes >= 20 ? "#fca5a5" : "#fdba74",
                                marginTop: 4,
                              }}
                            >
                              Retraso en ritmo del campo: ~{g.paceDelayMinutes} min
                              {g.holesBehind > 0
                                ? ` · ${g.holesBehind} hoyo${g.holesBehind === 1 ? "" : "s"} de captura atrás`
                                : ""}
                            </div>
                          ) : g.holesBehind > 0 ? (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#fdba74",
                                marginTop: 4,
                              }}
                            >
                              {g.holesBehind} hoyo{g.holesBehind === 1 ? "" : "s"} de captura atrás vs ritmo
                            </div>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <PaceDelayBadge
                            minutes={g.paceDelayMinutes}
                            holesBehind={g.holesBehind}
                          />
                          <span style={{ fontSize: 18, color: "#64748b" }}>
                            {expanded ? "▾" : "▸"}
                          </span>
                        </div>
                      </div>
                    </button>

                    {expanded ? (
                      <div
                        style={{
                          padding: "0 12px 12px",
                          borderTop: "1px solid #1e293b",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                          {g.players.join(" · ")}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <CapturerChips capturers={g.capturers} />
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748b",
                            marginTop: 8,
                          }}
                        >
                          Última captura: {agoLabel(g.lastCaptureTs)}
                          {g.paceDelayMinutes != null && g.paceDelayMinutes > 0
                            ? ` · retraso ritmo ~${g.paceDelayMinutes} min`
                            : ""}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <Link
                            href={g.capturaHref}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "6px 10px",
                              borderRadius: 8,
                              background: "#14532d",
                              color: "#ecfdf5",
                              textDecoration: "none",
                            }}
                          >
                            Abrir captura
                          </Link>
                          <Link
                            href={g.scoreEntryHref}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "6px 10px",
                              borderRadius: 8,
                              background: "#1e293b",
                              color: "#e2e8f0",
                              textDecoration: "none",
                              border: "1px solid #334155",
                            }}
                          >
                            Score entry
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : tab === "ritmo" ? (
        <MarshalRitmoPanel tg={tg} tournamentId={selectedTournamentId} />
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {!selectedTournament || !livePath ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
              }}
            >
              Elige un torneo para ver resultados en vivo.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  color: "#64748b",
                  borderBottom: "1px solid #1e293b",
                }}
              >
                Actualiza solo ·{" "}
                <Link href={livePath} style={{ color: "#93c5fd" }}>
                  Abrir en pantalla completa
                </Link>
              </div>
              <iframe
                title="Resultados en vivo"
                src={livePath}
                style={{
                  flex: 1,
                  width: "100%",
                  border: "none",
                  background: "#fff",
                  minHeight: "calc(100dvh - 180px)",
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
