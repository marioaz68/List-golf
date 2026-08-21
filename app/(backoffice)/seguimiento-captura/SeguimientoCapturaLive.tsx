"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { CaptureLagKind } from "@/lib/ritmo/captureLag";
import {
  classifyDelayCause,
  delayCauseLabel,
  formatCaptureVsPaceLine,
  isCaptureProblem,
} from "@/lib/ritmo/captureLag";
import {
  capturerRoleLabel,
  compareGroupsForMarshalRoute,
  type ActiveCapturer,
} from "@/lib/ritmo/activeCapturers";

export type SegGroup = {
  id: string;
  number: number;
  label: string;
  startingHole: number;
  teeTime: string | null;
  actualStartAt: string | null;
  players: string[];
  caddies: string[];
  capturers: ActiveCapturer[];
  holesPlayed: number;
  lastHole: number | null;
  lastCaptureTs: string | null;
  kind: CaptureLagKind;
  expectedHoles: number;
  holesBehind: number;
  minutesSinceStart: number | null;
  minutesSinceLastCapture: number | null;
  captureHole: number | null;
  expectedHole: number | null;
  paceDelayMinutes: number | null;
  reason: string;
  priority: number;
  capturaHref: string;
  scoreEntryHref: string;
  tournamentId: string;
  tournamentName: string;
  courseName: string | null;
  roundId: string;
  roundNo: number | null;
};

export type TournamentFilterOption = {
  id: string;
  name: string;
};

type RoundOption = { id: string; round_no: number | null };

type Props = {
  mode: "all" | "one";
  tournamentId: string | null;
  tournamentName: string;
  courseName: string | null;
  roundLabel: string;
  rounds: RoundOption[];
  currentRoundId: string | null;
  tournamentsToday: TournamentFilterOption[];
  groups: SegGroup[];
  computedAtISO: string;
  todayLabel: string;
  /** Desde el mapa de ritmo: abrir y destacar este group_id. */
  focusGroupId?: string | null;
};

const KIND_META: Record<
  CaptureLagKind,
  { label: string; color: string; bg: string; border: string }
> = {
  critico: {
    label: "CRÍTICO",
    color: "#991b1b",
    bg: "#fef2f2",
    border: "#ef4444",
  },
  atrasado: {
    label: "ATRASADO",
    color: "#9a3412",
    bg: "#fff7ed",
    border: "#f97316",
  },
  silencioso: {
    label: "SILENCIO",
    color: "#854d0e",
    bg: "#fefce8",
    border: "#eab308",
  },
  ok: {
    label: "AL DÍA",
    color: "#065f46",
    bg: "#ecfdf5",
    border: "#10b981",
  },
  no_salido: {
    label: "PENDIENTE",
    color: "#475569",
    bg: "#f8fafc",
    border: "#94a3b8",
  },
  sin_hora: {
    label: "SIN HORA",
    color: "#334155",
    bg: "#f1f5f9",
    border: "#64748b",
  },
  terminado: {
    label: "TERMINÓ",
    color: "#1e3a8a",
    bg: "#eff6ff",
    border: "#3b82f6",
  },
  cerrado: {
    label: "CERRADA",
    color: "#334155",
    bg: "#f1f5f9",
    border: "#64748b",
  },
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

/** Hoyo visible para marshals: captura vs ritmo del campo (hoyo EN cancha). */
function captureHoleDisplay(g: SegGroup): {
  headline: string;
  detail: string;
  paceLabel: string | null;
} {
  const paceLabel =
    g.expectedHole != null ? `ritmo debería H${g.expectedHole}` : null;

  if (g.kind === "terminado" || g.holesPlayed >= 18) {
    return { headline: "H18", detail: "captura completa", paceLabel: null };
  }
  if (g.holesPlayed <= 0) {
    return {
      headline: g.expectedHole != null ? `H${g.expectedHole}` : `H${g.startingHole}`,
      detail: "sin captura aún",
      paceLabel,
    };
  }
  const current = g.captureHole;
  if (current != null) {
    return {
      headline: `H${current}`,
      detail:
        g.lastHole != null
          ? `último anotado H${g.lastHole}`
          : "hoyo en cancha (captura)",
      paceLabel,
    };
  }
  if (g.lastHole != null) {
    return { headline: `H${g.lastHole}`, detail: "último capturado", paceLabel };
  }
  return { headline: "—", detail: "sin dato de hoyo", paceLabel };
}

function shortPlayerName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return full.trim() || "—";
  return `${parts[0]} ${parts[1]}`;
}

function DelayCauseBanner({ g }: { g: SegGroup }) {
  const cause = classifyDelayCause({
    paceDelayMinutes: g.paceDelayMinutes,
    holesBehind: g.holesBehind,
    kind: g.kind,
  });
  const label = delayCauseLabel(cause);
  if (!label) return null;
  const bits: string[] = [label];
  if (g.paceDelayMinutes != null && g.paceDelayMinutes > 0) {
    bits.push(`ritmo ~${g.paceDelayMinutes} min`);
  }
  if (g.holesBehind > 0) {
    bits.push(
      `captura ${g.holesBehind} hoyo${g.holesBehind === 1 ? "" : "s"}`
    );
  }
  const color =
    cause === "ambas"
      ? "#991b1b"
      : cause === "ritmo"
        ? "#9a3412"
        : "#854d0e";
  const bg =
    cause === "ambas"
      ? "#fef2f2"
      : cause === "ritmo"
        ? "#fff7ed"
        : "#fefce8";
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 13,
        fontWeight: 800,
        color,
        background: bg,
        border: `1px solid ${color}44`,
        padding: "6px 10px",
        borderRadius: 8,
        lineHeight: 1.35,
      }}
    >
      {bits.join(" · ")}
    </div>
  );
}

export default function SeguimientoCapturaLive({
  mode,
  tournamentId,
  tournamentName,
  courseName,
  roundLabel,
  rounds,
  currentRoundId,
  tournamentsToday,
  groups,
  computedAtISO,
  todayLabel,
  focusGroupId = null,
}: Props) {
  const router = useRouter();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const focus = String(focusGroupId ?? "").trim() || null;
  const focusGroup = useMemo(
    () => (focus ? groups.find((g) => g.id === focus) ?? null : null),
    [groups, focus]
  );
  const [onlyProblems, setOnlyProblems] = useState(() => !focusGroup);
  const [expandedId, setExpandedId] = useState<string | null>(() => focus);

  useEffect(() => {
    if (!focus) return;
    setExpandedId(focus);
    // Si el grupo no es “problema”, quitar filtro para que se vea.
    if (focusGroup && !isCaptureProblem(focusGroup.kind)) {
      setOnlyProblems(false);
    } else if (focusGroup) {
      setOnlyProblems(true);
    }
    const t = window.setTimeout(() => {
      const el = document.getElementById(`seg-group-${focus}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focus, focusGroup]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    const base = new Date(computedAtISO).getTime();
    const tick = () =>
      setSecondsAgo(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [computedAtISO]);

  const counts = useMemo(() => {
    const c = {
      critico: 0,
      atrasado: 0,
      silencioso: 0,
      ok: 0,
      terminado: 0,
      otros: 0,
    };
    for (const g of groups) {
      if (g.kind === "critico") c.critico += 1;
      else if (g.kind === "atrasado") c.atrasado += 1;
      else if (g.kind === "silencioso") c.silencioso += 1;
      else if (g.kind === "ok") c.ok += 1;
      else if (g.kind === "terminado") c.terminado += 1;
      else c.otros += 1;
    }
    return c;
  }, [groups]);

  const sorted = useMemo(() => {
    return [...groups].sort(compareGroupsForMarshalRoute);
  }, [groups]);

  const visible = useMemo(() => {
    if (focus) {
      const hit = sorted.find((g) => g.id === focus);
      if (hit) {
        // Siempre mostrar el grupo pedido desde ritmo, más el resto según filtro.
        const rest = onlyProblems
          ? sorted.filter((g) => g.id !== focus && isCaptureProblem(g.kind))
          : sorted.filter((g) => g.id !== focus);
        return [hit, ...rest];
      }
    }
    if (!onlyProblems) return sorted;
    return sorted.filter((g) => isCaptureProblem(g.kind));
  }, [sorted, onlyProblems, focus]);

  const problemN = counts.critico + counts.atrasado + counts.silencioso;

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 90px)",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "-apple-system, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #1e293b",
          background: "#020617",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "flex-start",
            justifyContent: "space-between",
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
              <h1
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: -0.3,
                }}
              >
                Seguimiento de captura
              </h1>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  background: problemN > 0 ? "#7f1d1d" : "#064e3b",
                  color: problemN > 0 ? "#fecaca" : "#6ee7b7",
                  padding: "2px 8px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: problemN > 0 ? "#f87171" : "#34d399",
                    display: "inline-block",
                  }}
                />
                EN VIVO
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              {mode === "all"
                ? `Todos los torneos con ronda el ${todayLabel}`
                : `${tournamentName}${courseName ? ` · ${courseName}` : ""} · ${roundLabel}`}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
              Grupos que no capturan a tiempo · actualiza cada 20 s · orden por
              ritmo del campo (atrás → adelante) para ruta de marshal
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tournamentId ? (
              <Link
                href={`/ritmo?tournament_id=${encodeURIComponent(tournamentId)}${
                  currentRoundId
                    ? `&round_id=${encodeURIComponent(currentRoundId)}`
                    : ""
                }`}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "#1e293b",
                  color: "#e2e8f0",
                  textDecoration: "none",
                  border: "1px solid #334155",
                }}
              >
                Mapa ritmo
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => router.refresh()}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 8,
                background: "#2563eb",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ↻ Actualizar
            </button>
          </div>
        </div>

        {/* Alcance: todos los torneos hoy / uno solo */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
            TORNEO
          </span>
          <Link
            href="/seguimiento-captura?scope=all"
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 6,
              textDecoration: "none",
              background: mode === "all" ? "#2563eb" : "#1e293b",
              color: mode === "all" ? "#fff" : "#cbd5e1",
              border: `1px solid ${mode === "all" ? "#2563eb" : "#334155"}`,
            }}
          >
            Todos hoy ({tournamentsToday.length})
          </Link>
          {tournamentsToday.map((t) => {
            const active = mode === "one" && tournamentId === t.id;
            return (
              <Link
                key={t.id}
                href={`/seguimiento-captura?scope=one&tournament_id=${encodeURIComponent(
                  t.id
                )}`}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                  textDecoration: "none",
                  background: active ? "#2563eb" : "#1e293b",
                  color: active ? "#fff" : "#cbd5e1",
                  border: `1px solid ${active ? "#2563eb" : "#334155"}`,
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={t.name}
              >
                {t.name}
              </Link>
            );
          })}
        </div>

        {mode === "one" && rounds.length > 1 && tournamentId ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginTop: 10,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
              RONDA
            </span>
            {rounds.map((r) => {
              const active = r.id === currentRoundId;
              return (
                <Link
                  key={r.id}
                  href={`/seguimiento-captura?scope=one&tournament_id=${encodeURIComponent(
                    tournamentId
                  )}&round_id=${encodeURIComponent(r.id)}`}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 6,
                    textDecoration: "none",
                    background: active ? "#2563eb" : "#1e293b",
                    color: active ? "#fff" : "#cbd5e1",
                    border: `1px solid ${active ? "#2563eb" : "#334155"}`,
                  }}
                >
                  R{r.round_no ?? "?"}
                </Link>
              );
            })}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
            alignItems: "center",
          }}
        >
          <Chip n={counts.critico} label="críticos" color="#ef4444" />
          <Chip n={counts.atrasado} label="atrasados" color="#f97316" />
          <Chip n={counts.silencioso} label="silencio" color="#eab308" />
          <Chip n={counts.ok} label="al día" color="#10b981" />
          <Chip n={counts.terminado} label="terminaron" color="#3b82f6" />
          <button
            type="button"
            onClick={() => setOnlyProblems((v) => !v)}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${onlyProblems ? "#f97316" : "#334155"}`,
              background: onlyProblems ? "#7c2d12" : "#1e293b",
              color: onlyProblems ? "#fed7aa" : "#cbd5e1",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {onlyProblems
              ? `✓ Solo problemas (${problemN})`
              : `Ver todos (${groups.length})`}
          </button>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#64748b",
            textAlign: "right",
          }}
        >
          Actualizado hace {secondsAgo}s
        </div>
      </header>

      <main style={{ flex: 1, padding: "12px 12px 28px", maxWidth: 920, width: "100%", margin: "0 auto" }}>
        {focusGroup ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#1e3a8a",
              border: "1px solid #3b82f6",
              color: "#dbeafe",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            Desde ritmo · G{focusGroup.number}
            {focusGroup.players.length
              ? ` · ${focusGroup.players
                  .slice(0, 2)
                  .map((n) => n.split(/\s+/)[0])
                  .join(", ")}…`
              : ""}
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, opacity: 0.95 }}>
              Revisa abajo si el problema es{" "}
              <b>ritmo de juego</b>, <b>captura de tarjeta</b> o ambas.
            </div>
          </div>
        ) : null}
        {groups.length === 0 ? (
          <EmptyBox>
            {mode === "all"
              ? "No hay grupos con ronda programada para hoy en ningún torneo."
              : "No hay grupos en esta ronda."}
          </EmptyBox>
        ) : visible.length === 0 ? (
          <EmptyBox>
            {onlyProblems ? (
              <>
                <div style={{ fontWeight: 800, color: "#6ee7b7", marginBottom: 6 }}>
                  Ningún grupo retrasado en captura
                </div>
                Todos los que ya salieron van al día con sus escores (o aún no
                salen). Quita el filtro para ver el listado completo.
              </>
            ) : (
              "Sin grupos."
            )}
          </EmptyBox>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visible.map((g, routeIndex) => {
              const meta = KIND_META[g.kind];
              const open = expandedId === g.id;
              const holeInfo = captureHoleDisplay(g);
              return (
                <article
                  key={g.id}
                  id={`seg-group-${g.id}`}
                  style={{
                    borderRadius: 14,
                    border: `2px solid ${
                      focus === g.id ? "#2563eb" : meta.border
                    }`,
                    boxShadow:
                      focus === g.id
                        ? "0 0 0 3px rgba(37,99,235,0.35)"
                        : undefined,
                    background: meta.bg,
                    color: "#0f172a",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : g.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 14px 10px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 22,
                              fontWeight: 900,
                              letterSpacing: -0.5,
                            }}
                          >
                            G{g.number}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#64748b",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              padding: "3px 8px",
                              borderRadius: 999,
                            }}
                            title="Orden sugerido de ruta (de atrás hacia adelante)"
                          >
                            #{routeIndex + 1}
                          </span>
                          {mode === "all" ||
                          (tournamentId &&
                            g.tournamentId !== tournamentId) ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#1e3a8a",
                                background: "#dbeafe",
                                border: "1px solid #93c5fd",
                                padding: "3px 8px",
                                borderRadius: 999,
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={g.tournamentName}
                            >
                              {g.tournamentName}
                              {g.roundNo != null ? ` · R${g.roundNo}` : ""}
                            </span>
                          ) : null}
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: meta.color,
                              background: "#fff",
                              border: `1px solid ${meta.border}`,
                              padding: "3px 8px",
                              borderRadius: 999,
                            }}
                          >
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                            tee {formatTime(g.teeTime)}
                            {g.actualStartAt ? " · salida real" : ""} · salida
                            H{g.startingHole}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: "#0f172a",
                            lineHeight: 1.35,
                            marginBottom: 4,
                          }}
                        >
                          {g.players.map(shortPlayerName).join(" · ") ||
                            "Sin jugadores"}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#1e3a8a",
                            background: "#eff6ff",
                            border: "1px solid #93c5fd",
                            padding: "4px 10px",
                            borderRadius: 8,
                            display: "inline-block",
                            marginBottom: 4,
                          }}
                        >
                          {formatCaptureVsPaceLine({
                            holesPlayed: g.holesPlayed,
                            captureHole: g.captureHole,
                            expectedHole: g.expectedHole,
                            expectedHoles: g.expectedHoles,
                          })}
                        </div>
                        <DelayCauseBanner g={g} />
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: meta.color,
                            lineHeight: 1.35,
                            marginTop: 6,
                          }}
                        >
                          {g.reason}
                        </div>
                        {g.capturers.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              marginTop: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "#166534",
                                alignSelf: "center",
                              }}
                            >
                              Pedir captura a:
                            </span>
                            {g.capturers.map((c) => (
                              <span
                                key={`${c.role}-${c.name}`}
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: "#14532d",
                                  background: "#dcfce7",
                                  border: "1px solid #86efac",
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                }}
                              >
                                {c.name} · {capturerRoleLabel(c.role)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#b45309",
                              marginTop: 6,
                              fontWeight: 600,
                            }}
                          >
                            Sin capturador identificado en bitácora — revisar
                            quién lleva la tarjeta
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          flexShrink: 0,
                          minWidth: 110,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 34,
                            fontWeight: 900,
                            fontVariantNumeric: "tabular-nums",
                            color: meta.color,
                            lineHeight: 1,
                          }}
                        >
                          {holeInfo.headline}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748b",
                            fontWeight: 700,
                            marginTop: 3,
                          }}
                        >
                          {holeInfo.detail}
                        </div>
                        {holeInfo.paceLabel ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#1d4ed8",
                              fontWeight: 800,
                              marginTop: 5,
                            }}
                          >
                            {holeInfo.paceLabel}
                          </div>
                        ) : null}
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            fontVariantNumeric: "tabular-nums",
                            color: "#334155",
                            marginTop: 8,
                          }}
                        >
                          {g.holesPlayed}
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                            }}
                          >
                            /{g.expectedHoles || "–"} hoyos
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            marginTop: 4,
                            fontWeight: 600,
                          }}
                        >
                          {agoLabel(g.lastCaptureTs)}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      padding: "0 12px 10px",
                    }}
                  >
                    <a
                      href={g.capturaHref}
                      target="_blank"
                      rel="noreferrer"
                      style={actionBtn("#0f172a", "#fff")}
                    >
                      Abrir captura
                    </a>
                    <a
                      href={g.scoreEntryHref}
                      target="_blank"
                      rel="noreferrer"
                      style={actionBtn("#fff", "#0f172a", "#cbd5e1")}
                    >
                      Score entry
                    </a>
                    <Link
                      href={`/ritmo?tournament_id=${encodeURIComponent(
                        g.tournamentId
                      )}&round_id=${encodeURIComponent(g.roundId)}`}
                      style={actionBtn("#fff", "#0f172a", "#cbd5e1")}
                    >
                      Ver en ritmo
                    </Link>
                  </div>

                  {open ? (
                    <div
                      style={{
                        padding: "8px 12px 12px",
                        borderTop: "1px solid rgba(15,23,42,0.08)",
                        fontSize: 12,
                        color: "#334155",
                        lineHeight: 1.5,
                        background: "rgba(255,255,255,0.45)",
                      }}
                    >
                      <div>
                        <b>Último hoyo capturado (secuencia):</b>{" "}
                        {g.lastHole ?? "—"}
                        {g.captureHole != null
                          ? ` · captura va en H${g.captureHole}`
                          : ""}
                        {g.expectedHole != null
                          ? ` · ritmo del campo H${g.expectedHole}`
                          : ""}
                      </div>
                      <div>
                        <b>Hoyos de retraso:</b> {g.holesBehind}
                        {g.minutesSinceStart != null
                          ? ` · ${g.minutesSinceStart} min desde salida`
                          : ""}
                      </div>
                      {g.capturers.length > 0 ? (
                        <div>
                          <b>Capturan en esta ronda:</b>{" "}
                          {g.capturers
                            .map(
                              (c) =>
                                `${c.name} (${capturerRoleLabel(c.role)}, ${c.captureCount} acciones)`
                            )
                            .join(" · ")}
                        </div>
                      ) : g.caddies.length > 0 ? (
                        <div style={{ color: "#b45309" }}>
                          Sin bitácora de jugador/caddie — asignados:{" "}
                          {g.caddies.join(", ")}
                        </div>
                      ) : (
                        <div style={{ color: "#b45309" }}>
                          Sin capturador identificado en bitácora
                        </div>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <b>Jugadores:</b>
                        <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                          {g.players.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            color: "#64748b",
            lineHeight: 1.45,
          }}
        >
          Criterio: compara hoyos capturados vs el ritmo del campo. El número
          grande es el <b>hoyo en cancha</b> (si anotaron hasta H7 → van en H8).
          La etiqueta aclara si el problema es <b>ritmo de juego</b>,{" "}
          <b>captura de tarjeta</b> o <b>ambas</b>.
        </p>
      </main>
    </div>
  );
}

function Chip({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 700,
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 999,
        padding: "3px 9px",
        color: "#e2e8f0",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
      {label}
    </span>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: 12,
        border: "1px dashed #334155",
        background: "#0b1220",
        textAlign: "center",
        fontSize: 14,
        color: "#94a3b8",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function actionBtn(
  bg: string,
  color: string,
  border?: string
): CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 800,
    padding: "7px 12px",
    borderRadius: 8,
    background: bg,
    color,
    textDecoration: "none",
    border: `1px solid ${border ?? bg}`,
    display: "inline-block",
  };
}
