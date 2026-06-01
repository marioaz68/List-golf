"use client";

import { useState, useTransition } from "react";
import { updateEntryTeeSetOverrideAction } from "./actions";

export type TeeSetOption = {
  id: string;
  code: string | null;
  name: string | null;
  color: string | null;
};

function teeChipStyles(color: string | null | undefined): {
  background: string;
  text: string;
  border: string;
} {
  const c = String(color ?? "").trim().toLowerCase();
  const map: Record<string, { background: string; text: string; border: string }> = {
    blanca: { background: "#ffffff", text: "#111827", border: "#cbd5e1" },
    white: { background: "#ffffff", text: "#111827", border: "#cbd5e1" },
    blanco: { background: "#ffffff", text: "#111827", border: "#cbd5e1" },
    azul: { background: "#1e40af", text: "#ffffff", border: "#1e3a8a" },
    blue: { background: "#1e40af", text: "#ffffff", border: "#1e3a8a" },
    roja: { background: "#dc2626", text: "#ffffff", border: "#991b1b" },
    rojo: { background: "#dc2626", text: "#ffffff", border: "#991b1b" },
    red: { background: "#dc2626", text: "#ffffff", border: "#991b1b" },
    amarilla: { background: "#fde047", text: "#111827", border: "#ca8a04" },
    amarillo: { background: "#fde047", text: "#111827", border: "#ca8a04" },
    yellow: { background: "#fde047", text: "#111827", border: "#ca8a04" },
    dorada: { background: "#eab308", text: "#111827", border: "#a16207" },
    dorado: { background: "#eab308", text: "#111827", border: "#a16207" },
    gold: { background: "#eab308", text: "#111827", border: "#a16207" },
    verde: { background: "#16a34a", text: "#ffffff", border: "#166534" },
    green: { background: "#16a34a", text: "#ffffff", border: "#166534" },
    negra: { background: "#111827", text: "#ffffff", border: "#000000" },
    negro: { background: "#111827", text: "#ffffff", border: "#000000" },
    black: { background: "#111827", text: "#ffffff", border: "#000000" },
    naranja: { background: "#ea580c", text: "#ffffff", border: "#9a3412" },
    orange: { background: "#ea580c", text: "#ffffff", border: "#9a3412" },
    rosa: { background: "#ec4899", text: "#ffffff", border: "#9d174d" },
    pink: { background: "#ec4899", text: "#ffffff", border: "#9d174d" },
    plata: { background: "#94a3b8", text: "#111827", border: "#64748b" },
    silver: { background: "#94a3b8", text: "#111827", border: "#64748b" },
  };
  return map[c] ?? { background: "#f1f5f9", text: "#111827", border: "#94a3b8" };
}

export default function EditableTeeSetCell({
  entryId,
  tournamentId,
  teeSets,
  assignedTeeSetId,
  overrideTeeSetId,
}: {
  entryId: string;
  tournamentId: string;
  teeSets: TeeSetOption[];
  assignedTeeSetId: string | null;
  overrideTeeSetId: string | null;
}) {
  const [override, setOverride] = useState<string | null>(overrideTeeSetId);
  const [pending, startTx] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  const effectiveId = override ?? assignedTeeSetId;
  const effectiveTee = teeSets.find((t) => t.id === effectiveId) ?? null;
  const chip = teeChipStyles(effectiveTee?.color ?? effectiveTee?.name ?? null);
  const isOverridden = override != null && override !== "";

  function handleChange(newValue: string) {
    const cleaned = newValue.trim();
    const next = cleaned === "" ? null : cleaned;

    // ¿igual al actual?
    if ((next ?? "") === (override ?? "")) return;

    setOverride(next);
    setFeedback(null);
    startTx(async () => {
      try {
        const fd = new FormData();
        fd.set("entry_id", entryId);
        fd.set("tournament_id", tournamentId);
        if (next) fd.set("tee_set_id", next);
        await updateEntryTeeSetOverrideAction(fd);
        setFeedback({ kind: "ok", text: next ? "Salida actualizada" : "Override quitado" });
        setTimeout(() => setFeedback(null), 1500);
      } catch (err) {
        setOverride(overrideTeeSetId); // rollback
        setFeedback({
          kind: "error",
          text: err instanceof Error ? err.message : "Error",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span
          className="inline-flex h-6 min-w-[40px] items-center justify-center rounded border px-2 text-[10px] font-bold uppercase"
          style={{
            background: chip.background,
            color: chip.text,
            borderColor: chip.border,
          }}
          title={
            effectiveTee
              ? `Salida: ${effectiveTee.name ?? effectiveTee.code ?? "?"}${
                  isOverridden ? " (override manual)" : " (asignada por regla)"
                }`
              : "Sin salida asignada"
          }
        >
          {effectiveTee?.code ||
            effectiveTee?.name?.slice(0, 4) ||
            "—"}
          {isOverridden ? <span className="ml-0.5">*</span> : null}
        </span>
        <select
          value={override ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={pending}
          className={`h-6 max-w-[110px] rounded border bg-white px-1 text-[10px] ${
            pending ? "opacity-50" : ""
          }`}
          title="Cambiar la salida (color) que se muestra al jugador. No afecta HC ni PH."
        >
          <option value="">— Auto —</option>
          {teeSets.map((tee) => (
            <option key={tee.id} value={tee.id}>
              {tee.code || tee.name || tee.id.slice(0, 4)}
            </option>
          ))}
        </select>
      </div>
      {feedback ? (
        <span
          className={`text-[10px] ${
            feedback.kind === "ok" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {feedback.text}
        </span>
      ) : null}
    </div>
  );
}
