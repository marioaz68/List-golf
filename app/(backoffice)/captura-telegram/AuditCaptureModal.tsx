"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ActorRole = "player" | "caddie" | "witness" | "admin" | "system" | null;

type AuditEntry = {
  id: string;
  entry_id: string;
  hole_no: number;
  action: "create" | "update" | "delete" | string;
  old_strokes: number | null;
  new_strokes: number | null;
  old_picked_up: boolean | null;
  new_picked_up: boolean | null;
  actor_role: ActorRole;
  actor_label: string | null;
  source: string | null;
  created_at: string;
};

type PlayerRow = {
  entryId: string;
  position: number | null;
  playerNumber: number | null;
  name: string;
};

type ApiResponse = {
  ok: boolean;
  players?: PlayerRow[];
  entries?: AuditEntry[];
  missingAuditTable?: boolean;
  error?: string;
};

const HOLES_ALL = Array.from({ length: 18 }, (_, i) => i + 1);

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

function roleBadge(role: ActorRole): {
  label: string;
  color: string;
  icon: string;
} {
  switch (role) {
    case "player":
      return { label: "Jugador", color: "bg-sky-100 text-sky-800", icon: "🏌️" };
    case "caddie":
      return {
        label: "Caddie",
        color: "bg-emerald-100 text-emerald-800",
        icon: "🎒",
      };
    case "witness":
      return {
        label: "Testigo",
        color: "bg-amber-100 text-amber-800",
        icon: "👀",
      };
    case "admin":
      return {
        label: "Admin",
        color: "bg-purple-100 text-purple-800",
        icon: "🛡️",
      };
    case "system":
      return { label: "Sistema", color: "bg-slate-200 text-slate-700", icon: "⚙️" };
    default:
      return {
        label: "Desconocido",
        color: "bg-slate-100 text-slate-600",
        icon: "?",
      };
  }
}

function actionLabel(action: string): {
  label: string;
  color: string;
  icon: string;
} {
  if (action === "create")
    return { label: "Captura", color: "text-emerald-700", icon: "＋" };
  if (action === "update")
    return { label: "Modificación", color: "text-amber-700", icon: "✎" };
  if (action === "delete")
    return { label: "Borrado", color: "text-red-700", icon: "✕" };
  return { label: action, color: "text-slate-700", icon: "•" };
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatScore(strokes: number | null, pickedUp: boolean | null): string {
  if (pickedUp) return "X";
  if (strokes == null) return "—";
  return String(strokes);
}

function buildDemoData(realPlayers: PlayerRow[]): {
  players: PlayerRow[];
  entries: AuditEntry[];
} {
  // Si hay jugadores reales del grupo úsalos; si no, inventa 4.
  const players: PlayerRow[] =
    realPlayers.length > 0
      ? realPlayers
      : [
          {
            entryId: "demo-1",
            position: 1,
            playerNumber: 11,
            name: "Mario Álvarez Z.",
          },
          {
            entryId: "demo-2",
            position: 2,
            playerNumber: 12,
            name: "Adriana Guadalupe López",
          },
          {
            entryId: "demo-3",
            position: 3,
            playerNumber: 21,
            name: "José Alberto Fernández",
          },
          {
            entryId: "demo-4",
            position: 4,
            playerNumber: 22,
            name: "Paulina Septien",
          },
        ];

  const entries: AuditEntry[] = [];
  const t0 = Date.now() - 1000 * 60 * 60 * 2;
  let seq = 0;
  const stamp = () => new Date(t0 + (seq++ * 1000 * 60)).toISOString();

  const roles: AuditEntry["actor_role"][] = ["player", "caddie", "witness", "admin"];
  const roleLabels: Record<string, string> = {
    player: "(jugador)",
    caddie: "Carlos Caddie",
    witness: "Testigo Adversario",
    admin: "Comité",
  };
  const sources: Record<string, string> = {
    player: "telegram_player",
    caddie: "telegram_caddie",
    witness: "telegram_witness",
    admin: "backoffice",
  };

  const baseScores: Record<string, number[]> = {};
  for (const p of players) {
    baseScores[p.entryId] = Array.from({ length: 18 }, (_, i) => {
      const par = i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 5;
      const dev = Math.floor(Math.random() * 3) - 1;
      return Math.max(2, par + dev);
    });
  }

  // Captura inicial para cada jugador/hoyo
  players.forEach((p, pi) => {
    const role = roles[pi % roles.length] ?? "player";
    const label =
      role === "player" ? p.name : roleLabels[role ?? "player"] ?? "Capturador";
    for (let hole = 1; hole <= 18; hole++) {
      const strokes = baseScores[p.entryId][hole - 1];
      entries.push({
        id: `e-${p.entryId}-${hole}-init`,
        entry_id: p.entryId,
        hole_no: hole,
        action: "create",
        old_strokes: null,
        new_strokes: strokes,
        old_picked_up: null,
        new_picked_up: false,
        actor_role: role,
        actor_label: label,
        source: sources[role ?? "player"] ?? null,
        created_at: stamp(),
      });
    }
  });

  // Algunas modificaciones por testigos/admin
  const tweaks: Array<{ pi: number; hole: number; role: AuditEntry["actor_role"] }> = [
    { pi: 0, hole: 7, role: "witness" },
    { pi: 1, hole: 12, role: "admin" },
    { pi: 2, hole: 3, role: "witness" },
    { pi: 3, hole: 15, role: "caddie" },
    { pi: 0, hole: 18, role: "admin" },
  ];
  for (const tw of tweaks) {
    const p = players[tw.pi];
    if (!p) continue;
    const prev = baseScores[p.entryId][tw.hole - 1];
    const next = Math.max(2, prev + (Math.random() < 0.5 ? -1 : 1));
    baseScores[p.entryId][tw.hole - 1] = next;
    entries.push({
      id: `e-${p.entryId}-${tw.hole}-mod`,
      entry_id: p.entryId,
      hole_no: tw.hole,
      action: "update",
      old_strokes: prev,
      new_strokes: next,
      old_picked_up: false,
      new_picked_up: false,
      actor_role: tw.role,
      actor_label: roleLabels[tw.role ?? "player"] ?? "Capturador",
      source: sources[tw.role ?? "player"] ?? null,
      created_at: stamp(),
    });
  }

  // Un picked-up (X)
  {
    const p = players[2];
    if (p) {
      entries.push({
        id: `e-${p.entryId}-9-x`,
        entry_id: p.entryId,
        hole_no: 9,
        action: "update",
        old_strokes: baseScores[p.entryId][8],
        new_strokes: null,
        old_picked_up: false,
        new_picked_up: true,
        actor_role: "player",
        actor_label: p.name,
        source: "telegram_player",
        created_at: stamp(),
      });
    }
  }

  // Hoyos de playoff
  for (let h = 19; h <= 21; h++) {
    players.forEach((p, pi) => {
      entries.push({
        id: `e-${p.entryId}-${h}-po`,
        entry_id: p.entryId,
        hole_no: h,
        action: "create",
        old_strokes: null,
        new_strokes: 3 + Math.floor(Math.random() * 2),
        old_picked_up: null,
        new_picked_up: false,
        actor_role: pi === 0 ? "caddie" : "player",
        actor_label: pi === 0 ? "Carlos Caddie" : p.name,
        source: pi === 0 ? "telegram_caddie" : "telegram_player",
        created_at: stamp(),
      });
    });
  }

  entries.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { players, entries };
}

export default function AuditCaptureModal({
  groupId,
  groupNo,
  onClose,
}: {
  groupId: string;
  groupNo: number | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [selectedHole, setSelectedHole] = useState<{
    entryId: string;
    hole: number;
  } | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [realData, setRealData] = useState<{
    players: PlayerRow[];
    entries: AuditEntry[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/captura/audit?group_id=${encodeURIComponent(groupId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setMissingTable(Boolean(json.missingAuditTable));
        setPlayers(json.players ?? []);
        setEntries(json.entries ?? []);
        setRealData({
          players: json.players ?? [],
          entries: json.entries ?? [],
        });
        return;
      }
      setPlayers(json.players ?? []);
      setEntries(json.entries ?? []);
      setRealData({
        players: json.players ?? [],
        entries: json.entries ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // Aplicar demo si está activo (sin escribir nada al backend)
  useEffect(() => {
    if (!realData) return;
    if (demoMode) {
      const demo = buildDemoData(realData.players);
      setPlayers(demo.players);
      setEntries(demo.entries);
      setSelectedHole(null);
    } else {
      setPlayers(realData.players);
      setEntries(realData.entries);
      setSelectedHole(null);
    }
  }, [demoMode, realData]);

  // Indexar: entries × hole → AuditEntry[]
  const matrix = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of entries) {
      const key = `${e.entry_id}|${e.hole_no}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [entries]);

  // Stats por rol
  const byRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const r = e.actor_role ?? "unknown";
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  const detailEntries = useMemo(() => {
    if (!selectedHole) return [];
    const key = `${selectedHole.entryId}|${selectedHole.hole}`;
    return matrix.get(key) ?? [];
  }, [matrix, selectedHole]);

  // Detectar hoyos de playoff con actividad
  const playoffHoles = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      if (e.hole_no >= 19 && e.hole_no <= 27) set.add(e.hole_no);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Auditoría de captura · Grupo #{groupNo ?? "?"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Quién capturó y modificó cada hoyo. Toca una celda para ver el
              detalle.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDemoMode((v) => !v)}
              title="Muestra cómo se verá la auditoría cuando empiecen a llegar capturas, usando datos de ejemplo. No escribe nada al servidor."
              className={
                demoMode
                  ? "rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                  : "rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              }
            >
              {demoMode ? "🟡 Vista previa activa" : "👁️ Vista previa demo"}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={demoMode}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Refrescar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </header>

        <div className="max-h-[calc(90vh-3.25rem)] overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando bitácora…</p>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">No se pudo cargar la bitácora.</p>
              <p className="mt-1 text-xs">{error}</p>
              {missingTable ? (
                <p className="mt-2 text-xs">
                  Falta aplicar la migración{" "}
                  <code className="rounded bg-white px-1">
                    20260529190000_hole_score_audit.sql
                  </code>{" "}
                  en Supabase.
                </p>
              ) : null}
            </div>
          ) : null}

          {!loading && !error ? (
            <>
              {demoMode ? (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-semibold">
                    Vista previa con datos ficticios.
                  </p>
                  <p className="mt-0.5">
                    Así se verá la auditoría cuando empiecen a llegar capturas
                    reales: capturas iniciales (verde), modificaciones (ámbar),
                    levantadas (X) y hoyos de playoff (P1, P2…). Apaga el
                    botón para volver a los datos reales del grupo.
                  </p>
                </div>
              ) : null}

              {/* Resumen */}
              <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded border border-slate-200 bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Acciones totales
                  </div>
                  <div className="text-xl font-semibold text-slate-900">
                    {entries.length}
                  </div>
                </div>
                {(["player", "caddie", "witness", "admin"] as const).map(
                  (r) => {
                    const b = roleBadge(r);
                    return (
                      <div
                        key={r}
                        className="rounded border border-slate-200 bg-white p-2"
                      >
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">
                          {b.icon} {b.label}
                        </div>
                        <div className="text-xl font-semibold text-slate-900">
                          {byRole.get(r) ?? 0}
                        </div>
                      </div>
                    );
                  }
                )}
              </section>

              {/* Leyenda */}
              <section className="mb-3 flex flex-wrap items-center gap-3 rounded bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                <span className="font-semibold">Leyenda:</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-sky-200"></span>
                  Capturó jugador
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-emerald-200"></span>
                  Capturó caddie
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-amber-200"></span>
                  Capturó testigo
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded bg-purple-200"></span>
                  Backoffice
                </span>
                <span className="flex items-center gap-1">
                  <span className="ml-2 inline-block h-3 w-3 rounded-full bg-amber-500"></span>
                  Modificado
                </span>
              </section>

              {/* Matriz jugador × hoyo */}
              <section className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      <th className="sticky left-0 z-10 border border-slate-300 bg-slate-100 px-2 py-1.5 text-left font-semibold">
                        Jugador
                      </th>
                      {HOLES_ALL.map((h) => (
                        <th
                          key={h}
                          className="border border-slate-300 px-1 py-1.5 text-center font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                      {playoffHoles.map((h) => (
                        <th
                          key={h}
                          className="border border-amber-300 bg-amber-50 px-1 py-1.5 text-center font-semibold text-amber-900"
                          title={`Playoff H${h - 18}`}
                        >
                          P{h - 18}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player) => (
                      <tr key={player.entryId}>
                        <td className="sticky left-0 z-10 border border-slate-300 bg-white px-2 py-1 text-left font-medium text-slate-900">
                          <div className="truncate" title={player.name}>
                            {player.playerNumber
                              ? `#${player.playerNumber} `
                              : ""}
                            {shortName(player.name)}
                          </div>
                        </td>
                        {[...HOLES_ALL, ...playoffHoles].map((h) => {
                          const arr = matrix.get(
                            `${player.entryId}|${h}`
                          );
                          if (!arr || arr.length === 0) {
                            return (
                              <td
                                key={h}
                                className="border border-slate-200 bg-slate-50 px-1 py-1 text-center text-slate-300"
                              >
                                ·
                              </td>
                            );
                          }
                          const last = arr[arr.length - 1];
                          const wasModified = arr.length > 1;
                          const role = last.actor_role;
                          const bg =
                            role === "player"
                              ? "bg-sky-100"
                              : role === "caddie"
                                ? "bg-emerald-100"
                                : role === "witness"
                                  ? "bg-amber-100"
                                  : role === "admin"
                                    ? "bg-purple-100"
                                    : "bg-slate-100";
                          const tooltip = `${actionLabel(last.action).label} por ${last.actor_label ?? "?"} (${roleBadge(role).label}) — ${formatTimestamp(last.created_at)}${wasModified ? ` · ${arr.length} cambios` : ""}`;
                          return (
                            <td
                              key={h}
                              className={`relative cursor-pointer border border-slate-200 px-0 py-0 text-center ${bg} hover:ring-2 hover:ring-slate-900`}
                              title={tooltip}
                              onClick={() =>
                                setSelectedHole({
                                  entryId: player.entryId,
                                  hole: h,
                                })
                              }
                            >
                              <div className="flex h-6 items-center justify-center">
                                <span className="font-mono font-semibold text-slate-900">
                                  {formatScore(
                                    last.new_strokes,
                                    last.new_picked_up
                                  )}
                                </span>
                                {wasModified ? (
                                  <span
                                    className="absolute right-0 top-0 inline-block h-2 w-2 -translate-y-0 translate-x-0 rounded-full bg-amber-500"
                                    aria-label="Modificado"
                                  />
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {entries.length === 0 ? (
                <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Aún no hay capturas registradas en la bitácora para este grupo.
                  Si los scores fueron capturados antes de habilitar la auditoría
                  no aparecerán aquí, pero todas las capturas a partir de ahora sí
                  se registrarán.
                </p>
              ) : null}

              {/* Timeline del hoyo seleccionado */}
              {selectedHole ? (
                <section className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
                  <header className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Detalle —{" "}
                      {(() => {
                        const p = players.find(
                          (pp) => pp.entryId === selectedHole.entryId
                        );
                        return p?.name ?? "Jugador";
                      })()}{" "}
                      ·{" "}
                      {selectedHole.hole > 18
                        ? `Playoff H${selectedHole.hole - 18}`
                        : `Hoyo ${selectedHole.hole}`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedHole(null)}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cerrar detalle
                    </button>
                  </header>
                  <ol className="space-y-2">
                    {detailEntries.map((e, idx) => {
                      const role = roleBadge(e.actor_role);
                      const act = actionLabel(e.action);
                      return (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs"
                        >
                          <span className="font-mono text-[10px] text-slate-400">
                            #{idx + 1}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${role.color}`}
                          >
                            {role.icon} {role.label}
                          </span>
                          <span className={`text-[11px] font-semibold ${act.color}`}>
                            {act.icon} {act.label}
                          </span>
                          <span className="text-slate-700">
                            {e.actor_label || "(sin nombre)"}
                          </span>
                          <span className="ml-auto font-mono text-slate-900">
                            {formatScore(e.old_strokes, e.old_picked_up)} →{" "}
                            <strong>
                              {formatScore(e.new_strokes, e.new_picked_up)}
                            </strong>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatTimestamp(e.created_at)}
                          </span>
                          {e.source ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {e.source}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
