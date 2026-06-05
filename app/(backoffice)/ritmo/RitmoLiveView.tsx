"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RitmoMap, type GroupDot } from "@/app/ritmo/demo/RitmoMap";
import { useViewport } from "@/app/ritmo/demo/useViewport";
import { formatStartTimeMexico } from "@/lib/ritmo/groupStart";

export type LiveStatus = "en_ritmo" | "adelantado" | "atrasado" | "sin_datos";
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
  detail: string;
  deltaMinutes: number | null;
  lat: number | null;
  lon: number | null;
  lastTs: string | null;
  stale: boolean;
  gpsState: GpsState;
  caddies: CaddieCoverageRow[];
  playersWithTelegram: number;
  playerCount: number;
}

interface RoundOption {
  id: string;
  round_no: number | null;
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
};

const STATUS_RANK: Record<LiveStatus, number> = {
  atrasado: 0,
  sin_datos: 1,
  en_ritmo: 2,
  adelantado: 3,
};

function formatTime(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 5);
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
  computedAtISO,
  mapUnsupported,
}: Props) {
  const router = useRouter();
  const vp = useViewport();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [onlyMissingGps, setOnlyMissingGps] = useState(false);
  const [showMissingList, setShowMissingList] = useState(true);

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

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (r !== 0) return r;
      return a.number - b.number;
    });
  }, [groups]);

  const mapGroups: GroupDot[] = useMemo(
    () =>
      groups
        .filter((g) => g.lat != null && g.lon != null)
        .map((g) => ({
          id: g.id,
          number: g.number,
          lat: g.lat as number,
          lon: g.lon as number,
          hoyo: g.hoyo ?? 0,
          status: g.status,
          label: g.label,
          detail: g.detail,
        })),
    [groups]
  );

  const withPosition = mapGroups.length;
  const counts = useMemo(() => {
    const c = { atrasado: 0, en_ritmo: 0, adelantado: 0, sin_datos: 0 };
    for (const g of groups) c[g.status] += 1;
    return c;
  }, [groups]);

  const gpsCounts = useMemo(() => {
    let live = 0;
    let stale = 0;
    let none = 0;
    for (const g of groups) {
      if (g.gpsState === "live") live += 1;
      else if (g.gpsState === "stale") stale += 1;
      else none += 1;
    }
    return { live, stale, none, total: groups.length };
  }, [groups]);

  const missingGpsGroups = useMemo(
    () =>
      [...groups]
        .filter((g) => g.gpsState === "none")
        .sort((a, b) => a.number - b.number),
    [groups]
  );

  const visibleGroups = useMemo(() => {
    const base = onlyMissingGps
      ? sortedGroups.filter((g) => g.gpsState !== "live")
      : sortedGroups;
    return base;
  }, [sortedGroups, onlyMissingGps]);

  const sidebar = (
    <div
      style={{
        height: "100%",
        background: "#111",
        color: "#fff",
        borderRight: "1px solid #222",
        display: "flex",
        flexDirection: "column",
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
        }}
      >
        <SummaryChip color={STATUS_COLOR.atrasado} n={counts.atrasado} label="lentos" />
        <SummaryChip color={STATUS_COLOR.en_ritmo} n={counts.en_ritmo} label="en ritmo" />
        <SummaryChip color={STATUS_COLOR.adelantado} n={counts.adelantado} label="adelant." />
        <SummaryChip color={STATUS_COLOR.sin_datos} n={counts.sin_datos} label="sin ritmo" />
      </div>

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
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {sortedGroups.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "#9ca3af" }}>
            No hay grupos en esta ronda.
          </div>
        ) : withPosition === 0 ? (
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
              Aún nadie comparte ubicación
            </div>
            Para ver el ritmo en vivo, los jugadores o caddies deben compartir su
            <b> Ubicación en tiempo real</b> (Live Location) por Telegram al bot
            del torneo. En cuanto lleguen posiciones aparecerán aquí los grupos
            sobre el mapa.
          </div>
        ) : visibleGroups.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: "#9ca3af" }}>
            Todos los grupos tienen GPS activo.
          </div>
        ) : (
          visibleGroups.map((g) => (
            <GroupCard
              key={g.id}
              g={g}
              roundDate={roundDate}
              open={selectedId === g.id}
              onToggle={() =>
                setSelectedId(selectedId === g.id ? null : g.id)
              }
            />
          ))
        )}
      </div>

      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #222",
          fontSize: 10,
          color: "#6b7280",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Actualizado hace {secondsAgo}s</span>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 5,
            background: "#1f2937",
            color: "#e5e7eb",
            border: "1px solid #374151",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ↻ Actualizar
        </button>
      </div>
    </div>
  );

  const map = (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <RitmoMap
        groups={mapGroups}
        selectedId={selectedId}
        rotate={vp.shouldRotateMap}
      />
      {mapUnsupported ? (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 1000,
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
        }}
      >
        {sidebar}
      </div>
      <div style={{ flex: 1, height: "100%" }}>{map}</div>
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
  open,
  onToggle,
}: {
  g: LiveGroup;
  roundDate: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const accent = STATUS_COLOR[g.status];
  const gpsBadge = GPS_BADGE[g.gpsState];
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
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {g.number}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {g.hoyo != null ? `Hoyo ${g.hoyo}` : "Sin hoyo"}
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
