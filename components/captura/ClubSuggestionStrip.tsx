"use client";

import { useMemo } from "react";
import type { SwingKind } from "@/lib/distances/clubCatalog";
import type { ClubSuggestion } from "@/lib/distances/suggestClub";

interface ClubSuggestionStripProps {
  suggestion: ClubSuggestion | null;
  swing: SwingKind;
  onSwingChange: (s: SwingKind) => void;
  onClear: () => void;
}

/** Fila compacta: bastón sugerido + full/3·4 (yardas al green van arriba). */
export function ClubSuggestionStrip({
  suggestion,
  swing,
  onSwingChange,
  onClear,
}: ClubSuggestionStripProps) {
  const gapHint = useMemo(() => {
    if (!suggestion) return null;
    const g = suggestion.gapYards;
    if (Math.abs(g) <= 5) return "justo";
    if (g > 0) return `+${g}`;
    return `${g}`;
  }, [suggestion]);

  return (
    <div className="pointer-events-auto mx-2 mb-1 rounded-lg border border-white/15 bg-black/80 px-2 py-1 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-black leading-none text-white">
            {suggestion?.shortLabel ?? "—"}
          </span>
          {suggestion ? (
            <span className="truncate text-[10px] font-semibold text-slate-400">
              {suggestion.carryYards} yds
              {gapHint ? (
                <span className="text-amber-400/90"> · {gapHint}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-[10px] text-amber-200">Bolsa</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SwingChip
            active={swing === "full"}
            label="Full"
            onClick={() => onSwingChange("full")}
          />
          <SwingChip
            active={swing === "three_quarter"}
            label="3/4"
            onClick={() => onSwingChange("three_quarter")}
          />
          <button
            type="button"
            onClick={onClear}
            aria-label="Quitar punto"
            className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function SwingChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
        active
          ? "bg-amber-500 text-black"
          : "bg-white/10 text-slate-300",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
