"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RitmoMap, type GroupDot, type MarshalDot } from "@/app/ritmo/demo/RitmoMap";
import { useViewport } from "@/app/ritmo/demo/useViewport";
import { formatStartTimeMexico } from "@/lib/ritmo/groupStart";
import { isGroupOnCourse } from "@/lib/ritmo/groupOnCourse";
import { getHoleCenter, offsetHolePosition } from "@/lib/ritmo/holeCenters";

export type LiveStatus =
  | "en_ritmo"
  | "adelantado"
  | "atrasado"
  | "sin_datos"
  | "cerrado";
export type GpsState = "live" | "stale" | "none";

export type CaddieCoverageRow = {
  name: string;
  hasTelegram: boolean;
};

export type PlayerRow = {
  name: string;
  caddieName: string | null;
  caddieHasTelegram: boolean;
};

export interface LiveGroup {
  id: string;
  number: number;
  label: string;
  startingHole: number;
  teeTime: string | null;
  actualStartAt: string | null;
  players: string[];
  playerRows: PlayerRow[];
  status: LiveStatus;
  hoyo: number | null;
  /** Fuente del hoyo mostrado: escores capturados, GPS, o ninguna. */
  holeSource: "scores" | "gps" | null;
  detail: string;
  deltaMinutes: number | null;
  lat: number | null;
  lon: number | null;
  lastTs: string | null;
  stale: boolean;
  gpsState: GpsState;
  /** Dispositivos distintos (telegram_user_id o player_id) que mandaron GPS
   *  en los últimos 5 minutos. 0 = sin tracking; 1 = un solo punto de falla;
   *  2-3+ = redundancia robusta. */
  activeSources: number;
  /** Hoyos capturados por el grupo (máximo entre jugadores). */
  scoreHolesPlayed: number;
  /** True si ya capturaron los 18 hoyos. */
  scoreFinished: boolean;
  /** Timestamp de la última captura de escores del grupo. */
  lastScoreTs: string | null;
  caddies: CaddieCoverageRow[];
  playersWithTelegram: number;
  playerCount: number;
}

interface RoundOption {
  id: string;
  round_no: number | null;
  groupCount: number;
}

interface Props {
  tournamentId: string;
  tournamentName: string;
  courseName: string | null;
  roundLabel: string;
  rounds: RoundOption[];
  currentRoundId: string | null;
  roundDate: string | null;
  groups: LiveGroup[];
  /** Grupos que ya salieron / capturan / GPS en la ronda elegida. */
  onCourseCount: number;
  /** Marshals con GPS reciente (mismas bolas azules que el panel marshal). */
  marshals?: MarshalDot[];
  /** ISO del momento en que el servidor calculó estos datos. */
  computedAtISO: string;
  /** true cuando el campo del torneo no está soportado por el mapa (no CCQ). */
  mapUnsupported: boolean;
}

const STATUS_COLOR: Record<LiveStatus, string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
  sin_datos: "#6b7280",
  cerrado: "#64748b",
};

const STATUS_RANK: Record<LiveStatus, number> = {
  atrasado: 0,
  sin_datos: 1,
  en_ritmo: 2,
  adelantado: 3,
  cerrado: 4,
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

/** "hace 3 min" / "hace 1 h 5 m" a partir de un ISO, relativo a ahora. */
function agoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `hace ${h} h${m ? ` ${m} m` : ""}`;
}

export default function RitmoLiveView({
  tournamentId,
  tournamentName,
  courseName,
  roundLabel,
  rounds,
  currentRoundId,
  roundDate,
  groups,
  onCourseCount,
  marshals = [],
  computedAtISO,
  mapUnsupported,
}: Props) {
  const router = useRouter();
  const vp = useViewport();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapHits, setMapHits] = useState<
    Array<{ id: string; number: number; left: number; top: number }>
  >([]);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [onlyMissingGps, setOnlyMissingGps] = useState(false);
  const [onlyOnCourse, setOnlyOnCourse] = useState(true);
  const [showMissingList, setShowMissingList] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [liveMarshals, setLiveMarshals] = useState<MarshalDot[]>(marshals);

  // Sync marshals del SSR cuando el server refresh trae datos nuevos.
  useEffect(() => {
    setLiveMarshals(marshals);
  }, [marshals]);

  // Poll dedicado de marshals (independiente del refresh completo de grupos).
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch(
          `/api/ritmo/marshals?tournament_id=${encodeURIComponent(tournamentId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.ok || !Array.isArray(json.marshals)) return;
        setLiveMarshals(json.marshals as MarshalDot[]);
      } catch {
        // silencioso: el SSR / refresh sigue como respaldo
      }
    };
    pull();
    const id = setInterval(pull, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tournamentId]);

  // Auto-refresco cada 30 s (re-render del Server Component con datos frescos).
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  // Contador "hace X s" basado en el momento de cálculo del servidor.
  useEffect(() => {
    const base = new Date(computedAtISO).getTime();
    const tick = () =>
      setSecondsAgo(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [computedAtISO]);

  const onCourseGroups = useMemo(() => {
    const now = new Date();
    return groups.filter((g) =>
      isGroupOnCourse({
        teeTime: g.teeTime,
        actualStartAt: g.actualStartAt,
        roundDate,
        scoreHolesPlayed: g.scoreHolesPlayed,
        lastScoreTs: g.lastScoreTs,
        gpsState: g.gpsState,
        now,
      })
    );
  }, [groups, roundDate]);

  const listGroups = useMemo(() => {
    if (!onlyOnCourse) return groups;
    return onCourseGroups;
  }, [groups, onlyOnCourse, onCourseGroups]);

  const sortedGroups = useMemo(() => {
    return [...listGroups].sort((a, b) => {
      const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (r !== 0) return r;
      return a.number - b.number;
    });
  }, [listGroups]);

  const mapGroups: GroupDot[] = useMemo(() => {
    const byHole = new Map<number, LiveGroup[]>();
    for (const g of listGroups) {
      const h = g.hoyo;
      if (h != null && h >= 1 && h <= 18) {
        const arr = byHole.get(h) ?? [];
        arr.push(g);
        byHole.set(h, arr);
      }
    }

    const out: GroupDot[] = [];
    for (const g of listGroups) {
      if (g.lat != null && g.lon != null) {
        out.push({
          id: g.id,
          number: g.number,
          lat: g.lat as number,
          lon: g.lon as number,
          hoyo: g.hoyo ?? 0,
          status: g.status,
          label: g.label,
          detail: g.detail,
          positionSource: "gps",
        });
        continue;
      }
      const h = g.hoyo;
      if (h == null || h < 1 || h > 18) continue;
      const center = getHoleCenter(h);
      if (!center) continue;
      const peers = byHole.get(h) ?? [g];
      const idx = peers.findIndex((p) => p.id === g.id);
      const pos = offsetHolePosition(center, idx, peers.length);
      out.push({
        id: g.id,
        number: g.number,
        lat: pos.lat,
        lon: pos.lon,
        hoyo: h,
        status: g.status,
        label: g.label,
        detail: g.detail,
        positionSource: "capture",
      });
    }
    return out;
  }, [listGroups]);

  const withPosition = mapGroups.length;
  const counts = useMemo(() => {
    const c = {
      atrasado: 0,
      en_ritmo: 0,
      adelantado: 0,
      sin_datos: 0,
      cerrado: 0,
    };
    for (const g of listGroups) c[g.status] += 1;
    return c;
  }, [listGroups]);

  const gpsCounts = useMemo(() => {
    let live = 0;
    let stale = 0;
    let none = 0;
    for (const g of listGroups) {
      if (g.gpsState === "live") live += 1;
      else if (g.gpsState === "stale") stale += 1;
      else none += 1;
    }
    return { live, stale, none, total: listGroups.length };
  }, [listGroups]);

  const missingGpsGroups = useMemo(
    () =>
      [...listGroups]
        .filter((g) => g.gpsState === "none")
        .sort((a, b) => a.number - b.number),
    [listGroups]
  );

  const visibleGroups = useMemo(() => {
    const base = onlyMissingGps
      ? sortedGroups.filter((g) => g.gpsState !== "live")
      : sortedGroups;
    return base;
  }, [sortedGroups, onlyMissingGps]);

  // ¿Algún grupo tiene captura de escores? Permite mostrar ritmo sin GPS.
  const withScores = useMemo(
    () =>
      groups.filter((g) => g.scoreHolesPlayed > 0 || g.lastScoreTs != null)
        .length,
    [groups]
  );

  const sidebar = (
    <div
      style={{
        height: "100%",
        background: "#111",
        color: "#fff",
        borderRight: "1px solid #222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        zIndex: 30,
        isolation: "isolate",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: "1px solid #222" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {tournamentName}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#9ca3af",
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "#064e3b",
              color: "#6ee7b7",
              padding: "1px 7px",
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#34d399",
                display: "inline-block",
              }}
            />
            EN VIVO
          </span>
          <span>{roundLabel}</span>
          {courseName ? <span>· {courseName}</span> : null}
        </div>
        <Link
          href={`/seguimiento-captura?scope=all`}
          style={{
            display: "block",
            marginTop: 8,
            fontSize: 11,
            fontWeight: 800,
            textAlign: "center",
            padding: "6px 8px",
            borderRadius: 7,
            textDecoration: "none",
            background: "#7f1d1d",
            color: "#fecaca",
            border: "1px solid #ef4444",
          }}
        >
          Capturas retrasadas →
        </Link>
      </div>

      {/* Selector de ronda */}
      {rounds.length > 1 ? (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #222",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Ronda
          </span>
          {rounds.map((r) => {
            const active = r.id === currentRoundId;
            return (
              <Link
                key={r.id}
                href={`/ritmo?tournament_id=${encodeURIComponent(
                  tournamentId
                )}&round_id=${encodeURIComponent(r.id)}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 9px",
                  borderRadius: 6,
                  textDecoration: "none",
                  background: active ? "#2563eb" : "#1f2937",
                  color: active ? "#fff" : "#cbd5e1",
                  border: `1px solid ${active ? "#2563eb" : "#374151"}`,
                }}
              >
                R{r.round_no ?? "?"}
                {r.groupCount > 0 ? ` · ${r.groupCount}` : ""}
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Resumen */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #222",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <SummaryChip color={STATUS_COLOR.atrasado} n={counts.atrasado} label="lentos" />
        <SummaryChip color={STATUS_COLOR.en_ritmo} n={counts.en_ritmo} label="en ritmo" />
        <SummaryChip color={STATUS_COLOR.adelantado} n={counts.adelantado} label="adelant." />
        <SummaryChip color={STATUS_COLOR.sin_datos} n={counts.sin_datos} label="sin ritmo" />
        {counts.cerrado > 0 ? (
          <SummaryChip
            color={STATUS_COLOR.cerrado}
            n={counts.cerrado}
            label="cerrados"
          />
        ) : null}
      </div>

      {/* Cuerpo con scroll: GPS + lista. El pie de acciones queda siempre visible. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {/* Cobertura GPS por grupo */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #222",
          background: "#0f1419",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 700,
            }}
          >
            Live Location (GPS)
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#e5e7eb" }}>
            {gpsCounts.live}/{gpsCounts.total} activos
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <SummaryChip color="#22c55e" n={gpsCounts.live} label="en vivo" />
          <SummaryChip color="#f59e0b" n={gpsCounts.stale} label="GPS viejo" />
          <SummaryChip color="#6b7280" n={gpsCounts.none} label="sin señal" />
          <SummaryChip
            color="#2563eb"
            n={liveMarshals.length}
            label="marshal GPS"
          />
        </div>
        {/* Mismo lugar que marshals: chips de grupos con GPS de jugador/caddie */}
        {(() => {
          const withGps = listGroups.filter(
            (g) => g.gpsState === "live" || g.gpsState === "stale"
          );
          if (withGps.length === 0 && liveMarshals.length === 0) {
            return (
              <div
                style={{
                  fontSize: 10,
                  color: "#64748b",
                  marginBottom: 8,
                }}
              >
                Sin GPS de grupos ni marshals. El caddie/jugador activa el chip
                GPS en captura (igual que marshals).
              </div>
            );
          }
          return (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginBottom: 8,
                alignItems: "center",
              }}
            >
              {withGps.map((g) => (
                <span
                  key={g.id}
                  title={`${g.label} · ${g.gpsState === "live" ? "GPS en vivo" : "GPS viejo"}${g.hoyo != null ? ` · H${g.hoyo}` : ""}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: g.gpsState === "live" ? "#064e3b" : "#78350f",
                    color: g.gpsState === "live" ? "#a7f3d0" : "#fde68a",
                    border: `1px solid ${g.gpsState === "live" ? "#10b981" : "#f59e0b"}`,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const params = new URLSearchParams({
                      scope: "one",
                      tournament_id: tournamentId,
                      group_id: g.id,
                    });
                    if (currentRoundId) params.set("round_id", currentRoundId);
                    router.push(`/seguimiento-captura?${params.toString()}`);
                  }}
                >
                  G{g.number}
                  {g.hoyo != null ? ` · H${g.hoyo}` : ""}
                </span>
              ))}
              {liveMarshals.map((m) => (
                <span
                  key={m.id}
                  title={`${m.name} — ver recorrido`}
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    window.location.assign(
                      `/ritmo/marshals?tournament_id=${encodeURIComponent(tournamentId)}`
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      window.location.assign(
                        `/ritmo/marshals?tournament_id=${encodeURIComponent(tournamentId)}`
                      );
                    }
                  }}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "#1e3a8a",
                    color: "#dbeafe",
                    border: "1px solid #2563eb",
                    cursor: "pointer",
                  }}
                >
                  {m.initials}
                  {m.hoyo != null ? ` · H${m.hoyo}` : ""}
                </span>
              ))}
            </div>
          );
        })()}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setOnlyOnCourse((v) => !v)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 5,
              border: `1px solid ${onlyOnCourse ? "#2563eb" : "#374151"}`,
              background: onlyOnCourse ? "#1e3a8a" : "#1f2937",
              color: onlyOnCourse ? "#dbeafe" : "#cbd5e1",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {onlyOnCourse
              ? `✓ En cancha (${onCourseCount})`
              : `Ver todos (${groups.length})`}
          </button>
          <button
            type="button"
            onClick={() => setOnlyMissingGps((v) => !v)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 8px",
              borderRadius: 5,
              border: `1px solid ${onlyMissingGps ? "#f59e0b" : "#374151"}`,
              background: onlyMissingGps ? "#78350f" : "#1f2937",
              color: onlyMissingGps ? "#fde68a" : "#cbd5e1",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {onlyMissingGps ? "✓ Solo sin GPS" : "Ver sin GPS"}
          </button>
          {missingGpsGroups.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowMissingList((v) => !v)}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 5,
                border: "1px solid #374151",
                background: "#1f2937",
                color: "#cbd5e1",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {showMissingList ? "▾" : "▸"} Lista ({missingGpsGroups.length})
            </button>
          ) : null}
        </div>
        {showMissingList && missingGpsGroups.length > 0 ? (
          <div
            style={{
              marginTop: 8,
              maxHeight: 120,
              overflowY: "auto",
              fontSize: 10,
              color: "#d1d5db",
              lineHeight: 1.45,
              borderTop: "1px solid #262626",
              paddingTop: 6,
            }}
          >
            <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: 4 }}>
              Pendientes de activar Live Location (8 h):
            </div>
            {missingGpsGroups.map((g) => (
              <div key={g.id} style={{ marginBottom: 3 }}>
                <b>G{g.number}</b> · tee {formatTime(g.teeTime)}
                {g.caddies.length > 0 ? (
                  <>
                    {" "}
                    · caddie{" "}
                    {g.caddies.map((c) => c.name).join(", ")}
                    {g.caddies.some((c) => c.hasTelegram) ? "" : " ⚠ sin ID Telegram"}
                  </>
                ) : (
                  <span style={{ color: "#f87171" }}> · sin caddie asignado</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ padding: "6px 8px" }}>
        {sortedGroups.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
            {onlyOnCourse && groups.length > onCourseCount ? (
              <>
                Ningún grupo en cancha en esta ronda todavía ({groups.length}{" "}
                programados). Quita el filtro <b>En cancha</b> o elige otra ronda
                (p. ej. R1 de hoy).
              </>
            ) : (
              "No hay grupos en esta ronda."
            )}
          </div>
        ) : withPosition === 0 && withScores === 0 ? (
          <div
            style={{
              margin: 8,
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #374151",
              background: "#0a0a0a",
              fontSize: 12,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#fbbf24" }}>
              Aún sin datos de ritmo
            </div>
            El ritmo se calcula con los <b>escores que captura el caddie</b> y,
            si está disponible, con la <b>ubicación en tiempo real</b> (Live
            Location) por Telegram. En cuanto el caddie capture el primer hoyo o
            alguien comparta ubicación aparecerá aquí el ritmo de cada grupo.
          </div>
        ) : visibleGroups.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "#9ca3af" }}>
            Todos los grupos tienen GPS activo.
          </div>
        ) : (
          <>
            {withPosition === 0 ? (
              <div
                style={{
                  margin: "4px 4px 8px",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #334155",
                  background: "#0b1220",
                  fontSize: 10,
                  color: "#93c5fd",
                  lineHeight: 1.4,
                }}
              >
                Ritmo derivado de los <b>escores capturados</b> (nadie comparte
                ubicación en vivo). El mapa se activa cuando llegue GPS.
              </div>
            ) : null}
            {visibleGroups.map((g) => (
              <GroupCard
                key={g.id}
                g={g}
                roundDate={roundDate}
                tournamentId={tournamentId}
                currentRoundId={currentRoundId}
                open={selectedId === g.id}
                onToggle={() =>
                  setSelectedId(selectedId === g.id ? null : g.id)
                }
              />
            ))}
          </>
        )}
      </div>
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #222",
          fontSize: 10,
          color: "#6b7280",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
          background: "#111",
          position: "relative",
          zIndex: 20,
        }}
      >
        <span>Actualizado hace {secondsAgo}s</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {currentRoundId ? (
            <button
              type="button"
              onClick={() => setShowSchedule(true)}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "7px 8px",
                borderRadius: 6,
                background: "#0c4a6e",
                color: "#bae6fd",
                border: "1px solid #075985",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🕐 Orden y horas
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.refresh()}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "7px 8px",
              borderRadius: 6,
              background: "#1f2937",
              color: "#e5e7eb",
              border: "1px solid #374151",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↻ Actualizar
          </button>
          <button
            type="button"
            onClick={() => {
              const href = `/ritmo/marshals?tournament_id=${encodeURIComponent(tournamentId)}`;
              // Navegación completa: el Link de Next a veces no responde
              // bajo el mapa Leaflet en este layout.
              window.location.assign(href);
            }}
            style={{
              gridColumn: "1 / -1",
              fontSize: 11,
              fontWeight: 800,
              padding: "8px 10px",
              borderRadius: 6,
              background: "#1e3a8a",
              color: "#dbeafe",
              border: "1px solid #2563eb",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "center",
              display: "block",
              width: "100%",
            }}
          >
            📍 Recorrido marshals
          </button>
        </div>
      </div>

      {showSchedule && currentRoundId ? (
        <GroupScheduleEditor
          roundId={currentRoundId}
          groups={groups}
          onClose={() => setShowSchedule(false)}
        />
      ) : null}
    </div>
  );

  const lagHrefFor = (groupId: string) => {
    const params = new URLSearchParams({
      scope: "one",
      tournament_id: tournamentId,
      group_id: groupId,
    });
    if (currentRoundId) params.set("round_id", currentRoundId);
    return `/seguimiento-captura?${params.toString()}`;
  };

  const chipGroups = useMemo(() => {
    const rank: Record<LiveStatus, number> = {
      atrasado: 0,
      sin_datos: 1,
      en_ritmo: 2,
      adelantado: 3,
      cerrado: 4,
    };
    return [...listGroups].sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return a.number - b.number;
    });
  }, [listGroups]);

  const map = (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <RitmoMap
        groups={mapGroups}
        marshals={liveMarshals}
        selectedId={selectedId}
        showHoleLabels={false}
        rotate={false}
        onHitsChange={setMapHits}
      />

      {/* Barra de grupos: links nativos (rojo=atrasado, verde=ritmo, azul=adelantado). */}
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
          <a
            key={g.id}
            href={lagHrefFor(g.id)}
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
              textDecoration: "none",
              border: "2px solid #fff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
              fontFamily: "inherit",
            }}
            title={`${g.label} · ${g.status} → capturas`}
          >
            G{g.number}
          </a>
        ))}
      </div>

      {/* Hits sobre cada bola del mapa (también links nativos). */}
      {mapHits.map((t) => {
        const g = listGroups.find((x) => x.id === t.id);
        return (
          <a
            key={t.id}
            href={lagHrefFor(t.id)}
            aria-label={`Grupo ${t.number}`}
            title={`G${t.number} → ver ritmo y captura`}
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
              border: g?.status === "atrasado" ? "2px solid rgba(255,255,255,0.35)" : "none",
            }}
          />
        );
      })}

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
          maxWidth: 300,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 4 }}>
          Mapa: {mapGroups.length} grupo{mapGroups.length === 1 ? "" : "s"}
          {` · ${liveMarshals.length} marshal${liveMarshals.length === 1 ? "" : "s"}`}{" "}
          · {listGroups.length} en lista
        </div>
        <div>
          Toca <b>G#</b> arriba (rojo atrasado · verde ritmo · azul adelantado)
          o la bola en el mapa → ritmo y captura de ese grupo.
        </div>
      </div>
      {mapUnsupported ? (
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 10,
            zIndex: 900,
            pointerEvents: "none",
            background: "rgba(0,0,0,0.75)",
            color: "#fbbf24",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 11,
            maxWidth: 280,
          }}
        >
          El mapa muestra los polígonos del CCQ. Este torneo está en otro campo,
          así que las posiciones pueden no coincidir con el mapa.
        </div>
      ) : null}
    </div>
  );

  // Mobile portrait: mapa arriba, lista abajo.
  if (vp.layout === "mobile_portrait") {
    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0a",
          fontFamily: "-apple-system, system-ui, sans-serif",
        }}
      >
        <div style={{ height: "48%", minHeight: 240 }}>{map}</div>
        <div style={{ flex: 1, minHeight: 0 }}>{sidebar}</div>
      </div>
    );
  }

  // Desktop / landscape: sidebar + mapa.
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "row",
        background: "#0a0a0a",
        fontFamily: "-apple-system, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: vp.isMobile ? 200 : 280,
          minWidth: vp.isMobile ? 200 : 280,
          height: "100%",
          minHeight: 0,
          position: "relative",
          zIndex: 30,
        }}
      >
        {sidebar}
      </div>
      <div style={{ flex: 1, height: "100%", minWidth: 0, overflow: "hidden", position: "relative", zIndex: 1 }}>
        {map}
      </div>
    </div>
  );
}

function SummaryChip({
  color,
  n,
  label,
}: {
  color: string;
  n: number;
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        color: "#d1d5db",
        background: "#1a1a1a",
        border: "1px solid #262626",
        borderRadius: 6,
        padding: "2px 7px",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          border: "1.5px solid #fff",
        }}
      />
      <b style={{ color: "#fff" }}>{n}</b> {label}
    </span>
  );
}

const GPS_BADGE: Record<
  GpsState,
  { label: string; bg: string; fg: string }
> = {
  live: { label: "GPS ✓", bg: "#064e3b", fg: "#6ee7b7" },
  stale: { label: "GPS viejo", bg: "#78350f", fg: "#fde68a" },
  none: { label: "Sin GPS", bg: "#450a0a", fg: "#fca5a5" },
};

function GroupCard({
  g,
  roundDate,
  tournamentId,
  currentRoundId,
  open,
  onToggle,
}: {
  g: LiveGroup;
  roundDate: string | null;
  tournamentId: string;
  currentRoundId: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const accent = STATUS_COLOR[g.status];
  const gpsBadge = GPS_BADGE[g.gpsState];
  const lagParams = new URLSearchParams({
    scope: "one",
    tournament_id: tournamentId,
    group_id: g.id,
  });
  if (currentRoundId) lagParams.set("round_id", currentRoundId);
  const lagHref = `/seguimiento-captura?${lagParams.toString()}`;
  return (
    <div
      style={{
        background: open ? "#1f2937" : "#1a1a1a",
        border: `1px solid ${accent}55`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 6,
        marginBottom: 6,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "8px 10px",
          background: "transparent",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {g.status === "cerrado" || g.scoreFinished ? (
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "2px solid #fff",
                  opacity: 0.85,
                }}
                title={`G${g.number} cerrado`}
              >
                {g.number}
              </span>
            ) : (
              <a
                href={lagHref}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: accent,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  textDecoration: "none",
                  border: "2px solid #fff",
                }}
                title={`Ver ritmo y captura G${g.number}`}
              >
                {g.number}
              </a>
            )}
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {g.scoreFinished || g.status === "cerrado"
                ? "🏁 Final"
                : g.hoyo != null
                  ? `Hoyo ${g.hoyo}`
                  : "Sin hoyo"}
              {g.holeSource === "scores" ? (
                <span style={{ fontSize: 9, color: "#86efac", marginLeft: 4 }}>
                  📝
                </span>
              ) : g.holeSource === "gps" ? (
                <span style={{ fontSize: 9, color: "#7dd3fc", marginLeft: 4 }}>
                  📡
                </span>
              ) : null}
            </div>
            <span
              style={{
                fontSize: 9,
                background: gpsBadge.bg,
                color: gpsBadge.fg,
                padding: "1px 6px",
                borderRadius: 3,
                fontWeight: 800,
              }}
            >
              {gpsBadge.label}
            </span>
          </div>
          <DeltaChip status={g.status} deltaMinutes={g.deltaMinutes} />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {g.actualStartAt ? (
              <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                ▶ salió {formatStartTimeMexico(g.actualStartAt)}
              </span>
            ) : (
              <>tee {formatTime(g.teeTime)}</>
            )}
            {g.startingHole && g.startingHole !== 1 ? ` · sale H${g.startingHole}` : ""}
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            {open ? "▾ jugadores" : "▸ ver jugadores"}
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 4 }}>
          {g.detail}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 3,
              background:
                g.scoreHolesPlayed > 0 ? "#064e3b" : "#3f3f46",
              color: g.scoreHolesPlayed > 0 ? "#6ee7b7" : "#a1a1aa",
            }}
          >
            {g.scoreHolesPlayed > 0
              ? `📝 ${g.scoreHolesPlayed}/18${
                  agoLabel(g.lastScoreTs) ? ` · ${agoLabel(g.lastScoreTs)}` : ""
                }`
              : "📝 sin captura"}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 3,
              background: g.gpsState === "live" ? "#0c4a6e" : "#3f3f46",
              color: g.gpsState === "live" ? "#7dd3fc" : "#a1a1aa",
            }}
            title={
              g.gpsState === "live" && g.activeSources >= 2
                ? `${g.activeSources} dispositivos del grupo mandando GPS — tracking redundante`
                : g.gpsState === "live" && g.activeSources === 1
                  ? "Solo 1 dispositivo mandando GPS — si se cae, perdemos el grupo"
                  : undefined
            }
          >
            {g.gpsState === "live"
              ? `📡 GPS${
                  g.activeSources >= 2 ? ` · ${g.activeSources} fuentes` : ""
                }${agoLabel(g.lastTs) ? ` · ${agoLabel(g.lastTs)}` : ""}`
              : g.gpsState === "stale"
                ? `📡 GPS viejo${
                    agoLabel(g.lastTs) ? ` · ${agoLabel(g.lastTs)}` : ""
                  }`
                : "📡 sin GPS"}
          </span>
        </div>
        {g.caddies.length > 0 ? (
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
            Caddie:{" "}
            {g.caddies.map((c, i) => (
              <span key={i}>
                {i > 0 ? ", " : ""}
                <span style={{ color: "#e5e7eb" }}>{c.name}</span>
                {c.hasTelegram ? (
                  <span style={{ color: "#6ee7b7" }}> ✓ TG</span>
                ) : (
                  <span style={{ color: "#f87171" }}> ⚠ sin ID</span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>
            Sin caddie asignado en esta ronda
          </div>
        )}
      </button>

      <GroupStartControl groupId={g.id} actualStartAt={g.actualStartAt} roundDate={roundDate} />

      {g.status !== "cerrado" && !g.scoreFinished ? (
        <a
          href={lagHref}
          style={{
            display: "block",
            width: "calc(100% - 16px)",
            margin: "0 8px 8px",
            padding: "10px 10px",
            borderRadius: 6,
            background: "#1d4ed8",
            border: "1px solid #3b82f6",
            color: "#eff6ff",
            fontSize: 12,
            fontWeight: 800,
            textAlign: "center",
            textDecoration: "none",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        >
          Ver ritmo y captura G{g.number} →
        </a>
      ) : null}

      {open ? (
        <div
          style={{
            background: "#0a0a0a",
            borderTop: `1px solid ${accent}33`,
            padding: "8px 12px",
          }}
        >
          {g.gpsState === "none" ? (
            <div
              style={{
                fontSize: 10,
                color: "#fde68a",
                background: "#422006",
                border: "1px solid #78350f",
                borderRadius: 6,
                padding: "6px 8px",
                marginBottom: 8,
                lineHeight: 1.4,
              }}
            >
              Que el <b>caddie</b> (o un jugador) comparta{" "}
              <b>Ubicación en tiempo real · 8 horas</b> en el bot de Telegram.
            </div>
          ) : null}
          <div
            style={{
              fontSize: 9,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Jugadores ({g.players.length}
            {g.playersWithTelegram > 0
              ? ` · ${g.playersWithTelegram} con Telegram`
              : ""}
            )
          </div>
          {g.playerRows.length === 0 ? (
            <div style={{ fontSize: 11, color: "#6b7280" }}>Sin jugadores.</div>
          ) : (
            g.playerRows.map((row, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  color: "#e5e7eb",
                  padding: "4px 0",
                  borderBottom:
                    i < g.playerRows.length - 1 ? "1px solid #161616" : "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                }}
              >
                <span style={{ color: "#6b7280", width: 14, flexShrink: 0 }}>
                  {i + 1}.
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div>{row.name}</div>
                  <div style={{ fontSize: 10, marginTop: 1 }}>
                    {row.caddieName ? (
                      <>
                        <span style={{ color: "#9ca3af" }}>caddie: </span>
                        <span style={{ color: "#cbd5e1" }}>
                          {row.caddieName}
                        </span>{" "}
                        {row.caddieHasTelegram ? (
                          <span style={{ color: "#6ee7b7", fontWeight: 700 }}>
                            ✓ Telegram
                          </span>
                        ) : (
                          <span style={{ color: "#f87171", fontWeight: 700 }}>
                            ⚠ sin ID Telegram
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "#f87171" }}>sin caddie asignado</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DeltaChip({
  status,
  deltaMinutes,
}: {
  status: LiveStatus;
  deltaMinutes: number | null;
}) {
  if (status === "sin_datos") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 7px",
          borderRadius: 4,
          background: "#1f2937",
          color: "#9ca3af",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        sin GPS
      </span>
    );
  }
  if (status === "cerrado") {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 7px",
          borderRadius: 4,
          background: "#334155",
          color: "#cbd5e1",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        cerrada
      </span>
    );
  }
  if (deltaMinutes == null) {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 7px",
          borderRadius: 4,
          background: "#064e3b",
          color: "#6ee7b7",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        OK
      </span>
    );
  }
  const ahead = deltaMinutes < 0;
  const mins = Math.abs(Math.round(deltaMinutes));
  const color = ahead
    ? { bg: "#0c4a6e", fg: "#bae6fd" }
    : { bg: "#7f1d1d", fg: "#fecaca" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        background: color.bg,
        color: color.fg,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {ahead ? "−" : "+"}
      {mins} min
    </span>
  );
}

type ScheduleRow = {
  groupId: string;
  number: number;
  order: number;
  time: string;
  players: string[];
  actualStartAt: string | null;
};

function GroupScheduleEditor({
  roundId,
  groups,
  onClose,
}: {
  roundId: string;
  groups: LiveGroup[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ScheduleRow[]>(() =>
    [...groups]
      .sort((a, b) => a.number - b.number)
      .map((g, i) => ({
        groupId: g.id,
        number: g.number,
        order: i + 1,
        time: g.teeTime ? g.teeTime.slice(0, 5) : "",
        players: g.players,
        actualStartAt: g.actualStartAt,
      }))
  );
  const [baseTime, setBaseTime] = useState("");
  const [intervalMin, setIntervalMin] = useState("10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function update(groupId: string, patch: Partial<ScheduleRow>) {
    setRows((prev) =>
      prev.map((r) => (r.groupId === groupId ? { ...r, ...patch } : r))
    );
  }

  function move(idx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((r, i) => ({ ...r, order: i + 1 }));
    });
  }

  function autofill() {
    const m = /^(\d{1,2}):(\d{2})$/.exec(baseTime.trim());
    if (!m) {
      setErr("Hora base inválida (HH:MM).");
      return;
    }
    const step = Math.max(1, Math.trunc(Number(intervalMin)) || 10);
    let mins = Number(m[1]) * 60 + Number(m[2]);
    setRows((prev) =>
      [...prev]
        .sort((a, b) => a.order - b.order)
        .map((r, i) => {
          const t = mins + i * step;
          const hh = String(Math.floor((t % 1440) / 60)).padStart(2, "0");
          const mm = String(t % 60).padStart(2, "0");
          return { ...r, time: `${hh}:${mm}` };
        })
    );
    setErr("");
  }

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const ordered = [...rows].sort((a, b) => a.order - b.order);
      const items = ordered.map((r, i) => ({
        group_id: r.groupId,
        group_no: i + 1,
        tee_time: r.time.trim() || null,
      }));
      const res = await fetch("/api/ritmo/group-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_id: roundId, items }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error ?? "Error guardando.");
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      setErr("Error de red.");
    } finally {
      setBusy(false);
    }
  }

  const ordered = [...rows].sort((a, b) => a.order - b.order);

  const cellBtn: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f1720",
          border: "1px solid #1f2937",
          borderRadius: 10,
          width: "min(560px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          color: "#e5e7eb",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14 }}>Orden y horas de salida</div>
          <button type="button" onClick={onClose} style={{ ...cellBtn, width: 26 }}>
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid #1f2937",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
          }}
        >
          <span style={{ color: "#9ca3af" }}>Autollenar:</span>
          <input
            type="time"
            value={baseTime}
            onChange={(e) => setBaseTime(e.target.value)}
            style={{
              fontSize: 12,
              padding: "3px 6px",
              borderRadius: 5,
              border: "1px solid #374151",
              background: "#0a0a0a",
              color: "#fff",
              fontFamily: "inherit",
            }}
          />
          <span style={{ color: "#9ca3af" }}>cada</span>
          <input
            type="number"
            min={1}
            value={intervalMin}
            onChange={(e) => setIntervalMin(e.target.value)}
            style={{
              fontSize: 12,
              width: 52,
              padding: "3px 6px",
              borderRadius: 5,
              border: "1px solid #374151",
              background: "#0a0a0a",
              color: "#fff",
              fontFamily: "inherit",
            }}
          />
          <span style={{ color: "#9ca3af" }}>min</span>
          <button
            type="button"
            onClick={autofill}
            style={{ ...cellBtn, width: "auto", padding: "0 10px" }}
          >
            Aplicar
          </button>
        </div>

        <div style={{ padding: "6px 8px" }}>
          {ordered.map((r, idx) => (
            <div
              key={r.groupId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 6px",
                borderBottom: "1px solid #161e2b",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  style={{ ...cellBtn, height: 16, opacity: idx === 0 ? 0.3 : 1 }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === ordered.length - 1}
                  style={{
                    ...cellBtn,
                    height: 16,
                    opacity: idx === ordered.length - 1 ? 0.3 : 1,
                  }}
                >
                  ▼
                </button>
              </div>
              <div
                style={{
                  width: 26,
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: 13,
                  color: "#38bdf8",
                }}
              >
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  G{r.number}
                  {r.actualStartAt ? (
                    <span style={{ color: "#6ee7b7", marginLeft: 6, fontWeight: 700 }}>
                      ▶ {formatStartTimeMexico(r.actualStartAt)}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#9ca3af",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.players.join(", ") || "Sin jugadores"}
                </div>
              </div>
              <input
                type="time"
                value={r.time}
                onChange={(e) => update(r.groupId, { time: e.target.value })}
                style={{
                  fontSize: 12,
                  padding: "3px 6px",
                  borderRadius: 5,
                  border: "1px solid #374151",
                  background: "#0a0a0a",
                  color: "#fff",
                  fontFamily: "inherit",
                }}
              />
            </div>
          ))}
        </div>

        {err ? (
          <div style={{ padding: "0 14px 8px", fontSize: 11, color: "#fca5a5" }}>{err}</div>
        ) : null}

        <div
          style={{
            padding: "10px 14px",
            borderTop: "1px solid #1f2937",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: "#6b7280" }}>
            El orden y la hora se guardan en la salida programada. La salida real
            (botón «Salió») manda en el ritmo si está marcada.
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #047857",
              background: "#065f46",
              color: "#d1fae5",
              cursor: busy ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupStartControl({
  groupId,
  actualStartAt,
  roundDate,
}: {
  groupId: string;
  actualStartAt: string | null;
  roundDate: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [timeValue, setTimeValue] = useState("");
  const [err, setErr] = useState("");

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/ritmo/mark-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, ...body }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error ?? "Error");
      } else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setErr("Error de red");
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderTop: "1px solid #222",
    background: "#101010",
  };
  const btn: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    padding: "4px 9px",
    borderRadius: 5,
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    cursor: busy ? "default" : "pointer",
    fontFamily: "inherit",
  };

  if (!actualStartAt) {
    return (
      <div style={wrap}>
        {!editing ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({})}
              style={{
                ...btn,
                background: "#065f46",
                borderColor: "#047857",
                color: "#d1fae5",
              }}
            >
              ▶ Salió ahora
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                const now = new Intl.DateTimeFormat("en-GB", {
                  timeZone: "America/Mexico_City",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date());
                setTimeValue(now);
              }}
              style={btn}
            >
              🕐 Hora…
            </button>
          </>
        ) : (
          <>
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              style={{
                fontSize: 11,
                padding: "3px 6px",
                borderRadius: 5,
                border: "1px solid #374151",
                background: "#0a0a0a",
                color: "#fff",
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              disabled={busy || !timeValue}
              onClick={() => void post({ time: timeValue, round_date: roundDate })}
              style={{ ...btn, background: "#065f46", borderColor: "#047857", color: "#d1fae5" }}
            >
              Guardar
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} style={btn}>
              Cancelar
            </button>
          </>
        )}
        {err ? <span style={{ fontSize: 10, color: "#fca5a5" }}>{err}</span> : null}
      </div>
    );
  }

  return (
    <div style={wrap}>
      <span style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 700 }}>
        ▶ Salida real {formatStartTimeMexico(actualStartAt)}
      </span>
      {!editing ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(true);
              setTimeValue(
                new Intl.DateTimeFormat("en-GB", {
                  timeZone: "America/Mexico_City",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(new Date(actualStartAt))
              );
            }}
            style={btn}
          >
            ✎ Editar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ clear: true })}
            style={{ ...btn, background: "#3f1d1d", borderColor: "#7f1d1d", color: "#fecaca" }}
          >
            ✕ Quitar
          </button>
        </>
      ) : (
        <>
          <input
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            style={{
              fontSize: 11,
              padding: "3px 6px",
              borderRadius: 5,
              border: "1px solid #374151",
              background: "#0a0a0a",
              color: "#fff",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            disabled={busy || !timeValue}
            onClick={() => void post({ time: timeValue, round_date: roundDate, force: true })}
            style={{ ...btn, background: "#065f46", borderColor: "#047857", color: "#d1fae5" }}
          >
            Guardar
          </button>
          <button type="button" disabled={busy} onClick={() => setEditing(false)} style={btn}>
            Cancelar
          </button>
        </>
      )}
      {err ? <span style={{ fontSize: 10, color: "#fca5a5" }}>{err}</span> : null}
    </div>
  );
}
