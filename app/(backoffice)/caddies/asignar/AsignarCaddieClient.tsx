"use client";

/**
 * Buscador focalizado para asignar caddie a un jugador específico.
 * Llega vía /caddies/asignar?entry_id=...&tournament_id=...
 *
 * Render:
 *  - Input de búsqueda (filtra por nombre, apodo, teléfono, telegram).
 *  - Grid de tarjetas de caddies (1 click = asignar).
 *  - Cada tarjeta es un <form> con los hidden inputs + botón "Asignar".
 *  - El caddie actualmente asignado aparece arriba como destacado.
 */

import { useMemo, useState } from "react";
import { assignCaddieAction } from "../actions";
import SubmitButton from "@/components/ui/SubmitButton";

export type CaddieOption = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  level: string | null;
  isActive: boolean;
  alreadyAssignedToOtherEntry: boolean;
};

export type AssignmentContext = {
  tournamentId: string;
  entryId: string;
  roundId: string;
  pairingGroupId: string | null;
  redirectTo: string;
  currentCaddieId: string | null;
};

function displayCaddiePrimary(c: CaddieOption): string {
  if (c.nickname?.trim()) return c.nickname.trim();
  const full = `${c.firstName} ${c.lastName}`.trim();
  return full || "Sin nombre";
}

function displayCaddieSecondary(c: CaddieOption): string {
  if (c.nickname?.trim()) {
    return `${c.firstName} ${c.lastName}`.trim() || "—";
  }
  return c.phone ?? c.whatsapp ?? "Sin teléfono";
}

function renderLevelBadge(level: string | null) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    advanced: { label: "Avanzado", bg: "#dbeafe", fg: "#1d4ed8" },
    intermediate: { label: "Intermedio", bg: "#fee2e2", fg: "#b91c1c" },
    beginner: { label: "Principiante", bg: "#dcfce7", fg: "#15803d" },
  };
  const info = level ? map[level] : null;
  if (!info) {
    return (
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#94a3b8",
          letterSpacing: 0.3,
        }}
      >
        SIN NIVEL
      </span>
    );
  }
  return (
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
      {info.label.toUpperCase()}
    </span>
  );
}

function matchesQuery(c: CaddieOption, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const haystack = [
    c.firstName,
    c.lastName,
    c.nickname,
    c.phone,
    c.whatsapp,
    c.telegram,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export default function AsignarCaddieClient({
  caddies,
  ctx,
}: {
  caddies: CaddieOption[];
  ctx: AssignmentContext;
}) {
  const [query, setQuery] = useState("");

  const ordered = useMemo(() => {
    // Caddie actual primero, luego los disponibles ordenados por nombre,
    // y al final los ya ocupados (deshabilitados).
    return [...caddies].sort((a, b) => {
      if (a.id === ctx.currentCaddieId && b.id !== ctx.currentCaddieId)
        return -1;
      if (b.id === ctx.currentCaddieId && a.id !== ctx.currentCaddieId)
        return 1;
      const aBusy = a.alreadyAssignedToOtherEntry ? 1 : 0;
      const bBusy = b.alreadyAssignedToOtherEntry ? 1 : 0;
      if (aBusy !== bBusy) return aBusy - bBusy;
      return displayCaddiePrimary(a).localeCompare(
        displayCaddiePrimary(b),
        "es",
        { sensitivity: "base" }
      );
    });
  }, [caddies, ctx.currentCaddieId]);

  const filtered = ordered.filter((c) => matchesQuery(c, query));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        autoFocus
        type="search"
        placeholder="Buscar caddie por nombre, apodo o teléfono…"
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
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 8,
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
            No hay caddies que coincidan con "{query}".
          </div>
        ) : (
          filtered.map((c) => {
            const isCurrent = c.id === ctx.currentCaddieId;
            const isBusy = c.alreadyAssignedToOtherEntry && !isCurrent;
            return (
              <form
                key={c.id}
                action={assignCaddieAction}
                style={{
                  border: isCurrent
                    ? "2px solid #15803d"
                    : isBusy
                      ? "1px dashed #cbd5e1"
                      : "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: isCurrent ? "#f0fdf4" : "#ffffff",
                  padding: 10,
                  display: "grid",
                  gap: 6,
                  opacity: isBusy ? 0.55 : 1,
                }}
              >
                <input
                  type="hidden"
                  name="tournament_id"
                  value={ctx.tournamentId}
                />
                <input type="hidden" name="entry_id" value={ctx.entryId} />
                <input type="hidden" name="caddie_id" value={c.id} />
                <input type="hidden" name="round_id" value={ctx.roundId} />
                {ctx.pairingGroupId ? (
                  <input
                    type="hidden"
                    name="pairing_group_id"
                    value={ctx.pairingGroupId}
                  />
                ) : null}
                <input
                  type="hidden"
                  name="redirect_to"
                  value={ctx.redirectTo}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {displayCaddiePrimary(c)}
                  </span>
                  {renderLevelBadge(c.level)}
                </div>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  {displayCaddieSecondary(c)}
                </div>
                {c.phone || c.whatsapp || c.telegram ? (
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
                    {c.whatsapp && c.whatsapp !== c.phone ? (
                      <span>📱 {c.whatsapp}</span>
                    ) : null}
                    {c.telegram ? <span>✈️ {c.telegram}</span> : null}
                  </div>
                ) : null}

                {isCurrent ? (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#15803d",
                      fontWeight: 800,
                      letterSpacing: 0.4,
                    }}
                  >
                    ★ ACTUALMENTE ASIGNADO
                  </div>
                ) : isBusy ? (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#b91c1c",
                      fontWeight: 700,
                    }}
                  >
                    Ya asignado a otro jugador en esta ronda
                  </div>
                ) : null}

                <SubmitButton
                  pendingText="Asignando…"
                  disabled={isBusy}
                  className={
                    isCurrent
                      ? "h-7 px-3 border border-emerald-700 rounded bg-emerald-700 text-white text-[11px] font-bold"
                      : isBusy
                        ? "h-7 px-3 border border-slate-300 rounded bg-slate-100 text-slate-400 text-[11px] font-semibold cursor-not-allowed"
                        : "h-7 px-3 border border-gray-800 rounded bg-gray-900 text-white text-[11px] font-bold hover:bg-gray-800"
                  }
                >
                  {isCurrent ? "Reasignar este caddie" : "Asignar →"}
                </SubmitButton>
              </form>
            );
          })
        )}
      </div>
    </div>
  );
}
