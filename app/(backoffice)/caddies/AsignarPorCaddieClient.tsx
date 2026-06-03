"use client";

/**
 * Asignación centrada en el CADDIE (flujo inverso al de la tabla por jugador).
 *
 * Permite buscar un caddie por nombre/apodo/teléfono/telegram y, una vez
 * encontrado, asignarle un jugador del torneo (en la ronda seleccionada).
 * Cada tarjeta de caddie muestra:
 *  - Nombre + nivel + contacto.
 *  - El jugador que ya tiene asignado en esta ronda (si lo hay).
 *  - Un selector de jugador + botón "Asignar".
 */

import { useMemo, useState } from "react";
import { assignCaddieAction } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";

export type CaddiePickOption = {
  id: string;
  primary: string;
  secondary: string;
  phone: string | null;
  telegram: string | null;
  level: string | null;
};

export type PlayerPickOption = {
  entryId: string;
  name: string;
  playerNumber: number | null;
  category: string;
  groupId: string;
  groupLabel: string;
  currentCaddieId: string | null;
};

export type AsignarPorCaddieCtx = {
  tournamentId: string;
  roundId: string;
};

const levelBadge: Record<
  string,
  { label: string; bg: string; fg: string }
> = {
  advanced: { label: "AVANZADO", bg: "#dbeafe", fg: "#1d4ed8" },
  intermediate: { label: "INTERMEDIO", bg: "#fee2e2", fg: "#b91c1c" },
  beginner: { label: "PRINCIPIANTE", bg: "#dcfce7", fg: "#15803d" },
};

function matchesCaddie(c: CaddiePickOption, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const haystack = [c.primary, c.secondary, c.phone, c.telegram]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export default function AsignarPorCaddieClient({
  caddies,
  players,
  ctx,
  initialQuery = "",
}: {
  caddies: CaddiePickOption[];
  players: PlayerPickOption[];
  ctx: AsignarPorCaddieCtx;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedEntryByCaddie, setSelectedEntryByCaddie] = useState<
    Record<string, string>
  >({});

  // entryId -> player (para resolver group y el jugador actual del caddie).
  const playersByEntry = useMemo(() => {
    const map = new Map<string, PlayerPickOption>();
    for (const p of players) map.set(p.entryId, p);
    return map;
  }, [players]);

  // caddieId -> jugador asignado actualmente en esta ronda.
  const playerByCaddie = useMemo(() => {
    const map = new Map<string, PlayerPickOption>();
    for (const p of players) {
      if (p.currentCaddieId) map.set(p.currentCaddieId, p);
    }
    return map;
  }, [players]);

  const filtered = useMemo(() => {
    const list = caddies.filter((c) => matchesCaddie(c, query));
    // Caddies con jugador asignado primero, luego por nombre.
    return list.sort((a, b) => {
      const aAssigned = playerByCaddie.has(a.id) ? 0 : 1;
      const bAssigned = playerByCaddie.has(b.id) ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      return a.primary.localeCompare(b.primary, "es", { sensitivity: "base" });
    });
  }, [caddies, query, playerByCaddie]);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <input
        type="search"
        placeholder="Buscar caddie por nombre, apodo, teléfono o telegram…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          height: 38,
          padding: "0 12px",
          fontSize: 14,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          outline: "none",
          background: "#fff",
          color: "#0f172a",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: 16,
              border: "1px dashed #cbd5e1",
              borderRadius: 8,
              textAlign: "center",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            No hay caddies que coincidan con “{query}”.
          </div>
        ) : (
          filtered.map((c) => {
            const current = playerByCaddie.get(c.id) ?? null;
            const selectedEntry =
              selectedEntryByCaddie[c.id] ?? current?.entryId ?? "";
            const selectedPlayer = selectedEntry
              ? playersByEntry.get(selectedEntry) ?? null
              : null;
            const info = c.level ? levelBadge[c.level] : null;

            return (
              <div
                key={c.id}
                style={{
                  border: current
                    ? "2px solid #15803d"
                    : "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: current ? "#f0fdf4" : "#fff",
                  padding: 10,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}
                  >
                    {c.primary}
                  </span>
                  {info ? (
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: info.bg,
                        color: info.fg,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                      }}
                    >
                      {info.label}
                    </span>
                  ) : null}
                </div>

                <div style={{ fontSize: 11, color: "#475569" }}>
                  {c.secondary}
                </div>

                {c.phone || c.telegram ? (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#64748b",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {c.phone ? <span>📞 {c.phone}</span> : null}
                    {c.telegram ? <span>✈️ {c.telegram}</span> : null}
                  </div>
                ) : null}

                {current ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#15803d",
                      fontWeight: 700,
                    }}
                  >
                    ★ Asignado a {current.name}
                    {current.playerNumber != null
                      ? ` · #${current.playerNumber}`
                      : ""}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    Sin jugador asignado en esta ronda
                  </div>
                )}

                <form
                  action={assignCaddieAction}
                  style={{ display: "grid", gap: 6 }}
                >
                  <input
                    type="hidden"
                    name="tournament_id"
                    value={ctx.tournamentId}
                  />
                  <input type="hidden" name="caddie_id" value={c.id} />
                  <input type="hidden" name="round_id" value={ctx.roundId} />
                  <input
                    type="hidden"
                    name="entry_id"
                    value={selectedEntry}
                  />
                  <input
                    type="hidden"
                    name="pairing_group_id"
                    value={selectedPlayer?.groupId ?? ""}
                  />

                  <select
                    value={selectedEntry}
                    onChange={(e) =>
                      setSelectedEntryByCaddie((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 8px",
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      fontSize: 12,
                      background: "#fff",
                      color: "#0f172a",
                    }}
                  >
                    <option value="">Selecciona jugador…</option>
                    {players.map((p) => {
                      const takenByOther =
                        p.currentCaddieId != null &&
                        p.currentCaddieId !== c.id;
                      return (
                        <option key={p.entryId} value={p.entryId}>
                          {p.playerNumber != null ? `#${p.playerNumber} · ` : ""}
                          {p.name}
                          {p.category && p.category !== "—"
                            ? ` · ${p.category}`
                            : ""}
                          {` · ${p.groupLabel}`}
                          {takenByOther ? " · (tiene caddie)" : ""}
                        </option>
                      );
                    })}
                  </select>

                  <SubmitButton
                    pendingText="Asignando…"
                    disabled={!selectedEntry}
                    className={
                      selectedEntry
                        ? "h-8 px-3 border border-gray-800 rounded bg-gray-900 text-white text-[12px] font-bold hover:bg-gray-800"
                        : "h-8 px-3 border border-slate-300 rounded bg-slate-100 text-slate-400 text-[12px] font-semibold cursor-not-allowed"
                    }
                  >
                    {current ? "Reasignar jugador →" : "Asignar jugador →"}
                  </SubmitButton>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
