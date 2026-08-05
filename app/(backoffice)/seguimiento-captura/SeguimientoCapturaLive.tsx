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
import { isCaptureProblem } from "@/lib/ritmo/captureLag";

export type SegGroup = {
  id: string;
  number: number;
  label: string;
  startingHole: number;
  teeTime: string | null;
  actualStartAt: string | null;
  players: string[];
  caddies: string[];
  holesPlayed: number;
  lastHole: number | null;
  lastCaptureTs: string | null;
  kind: CaptureLagKind;
  expectedHoles: number;
  holesBehind: number;
  minutesSinceStart: number | null;
  minutesSinceLastCapture: number | null;
  captureHole: number | null;
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
}: Props) {
  const router = useRouter();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    return [...groups].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (b.holesBehind !== a.holesBehind) return b.holesBehind - a.holesBehind;
      const silentA = a.minutesSinceLastCapture ?? 9999;
      const silentB = b.minutesSinceLastCapture ?? 9999;
      if (silentB !== silentA) return silentB - silentA;
      const tn = a.tournamentName.localeCompare(b.tournamentName, "es");
      if (tn !== 0) return tn;
      return a.number - b.number;
    });
  }, [groups]);

  const visible = useMemo(() => {
    if (!onlyProblems) return sorted;
    return sorted.filter((g) => isCaptureProblem(g.kind));
  }, [sorted, onlyProblems]);

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
              Grupos que no capturan a tiempo · actualiza cada 20 s · mandar
              marshal a pedir que anoten
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((g) => {
              const meta = KIND_META[g.kind];
              const open = expandedId === g.id;
              return (
                <article
                  key={g.id}
                  style={{
                    borderRadius: 12,
                    border: `2px solid ${meta.border}`,
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
                      padding: "10px 12px",
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
                        gap: 10,
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
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 18,
                              fontWeight: 900,
                              letterSpacing: -0.5,
                            }}
                          >
                            G{g.number}
                          </span>
                          {mode === "all" ||
                          (tournamentId &&
                            g.tournamentId !== tournamentId) ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#1e3a8a",
                                background: "#dbeafe",
                                border: "1px solid #93c5fd",
                                padding: "2px 7px",
                                borderRadius: 999,
                                maxWidth: 160,
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
                              fontSize: 10,
                              fontWeight: 800,
                              color: meta.color,
                              background: "#fff",
                              border: `1px solid ${meta.border}`,
                              padding: "2px 7px",
                              borderRadius: 999,
                            }}
                          >
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 11, color: "#475569" }}>
                            tee {formatTime(g.teeTime)}
                            {g.actualStartAt ? " · salida real" : ""} · H
                            {g.startingHole}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: meta.color,
                            lineHeight: 1.3,
                          }}
                        >
                          {g.reason}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#334155",
                            marginTop: 4,
                            lineHeight: 1.35,
                          }}
                        >
                          {g.players.slice(0, 4).join(" · ")}
                          {g.players.length > 4
                            ? ` +${g.players.length - 4}`
                            : ""}
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          flexShrink: 0,
                          minWidth: 88,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 20,
                            fontWeight: 900,
                            fontVariantNumeric: "tabular-nums",
                            color: meta.color,
                          }}
                        >
                          {g.holesPlayed}
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                            /{g.expectedHoles || "–"}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>
                          capt / esp
                        </div>
                        <div
                          style={{
                            fontSize: 11,
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
                          ? ` · deberían ir en H${g.captureHole}`
                          : ""}
                      </div>
                      <div>
                        <b>Hoyos de retraso:</b> {g.holesBehind}
                        {g.minutesSinceStart != null
                          ? ` · ${g.minutesSinceStart} min desde salida`
                          : ""}
                      </div>
                      {g.caddies.length > 0 ? (
                        <div>
                          <b>Caddies:</b> {g.caddies.join(", ")}
                        </div>
                      ) : (
                        <div style={{ color: "#b45309" }}>
                          Sin caddie asignado en la ronda
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
          Criterio: compara hoyos capturados en secuencia vs el ritmo del campo
          (minutos por hoyo). Crítico = sin captura &gt;22 min o ≥3 hoyos
          atrasados. Atrasado = 1–2 hoyos. Silencio = sin captura &gt;20 min.
          Comparte con marshals para que pidan anotar en el grupo.
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
