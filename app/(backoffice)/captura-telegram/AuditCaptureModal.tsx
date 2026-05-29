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
        return;
      }
      setPlayers(json.players ?? []);
      setEntries(json.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
