"use client";

import { useMemo } from "react";
import type { SwingKind } from "@/lib/distances/clubCatalog";
import type { ClubSuggestion } from "@/lib/distances/suggestClub";

interface ClubSuggestionStripProps {
  suggestion: ClubSuggestion | null;
  targetYards: number;
  swing: SwingKind;
  onSwingChange: (s: SwingKind) => void;
  onPrevClub?: () => void;
  onNextClub?: () => void;
  canPrevClub?: boolean;
  canNextClub?: boolean;
  onConfirmShot?: () => void;
  onClear?: () => void;
}

/** Bastón sugerido al green + cambio rápido ‹ › y full/3·4. */
export function ClubSuggestionStrip({
  suggestion,
  targetYards,
  swing,
  onSwingChange,
  onPrevClub,
  onNextClub,
  canPrevClub = false,
  canNextClub = false,
  onConfirmShot,
  onClear,
}: ClubSuggestionStripProps) {
  const gapHint = useMemo(() => {
    if (!suggestion) return null;
    if (suggestion.catalogId === "putter") return "putt";
    const g = suggestion.gapYards;
    if (Math.abs(g) <= 5) return "justo";
    if (g > 0) return `+${g}`;
    return `${g}`;
  }, [suggestion]);

  const isPutter = suggestion?.catalogId === "putter";

  return (
    <div className="pointer-events-auto mx-2 mb-1 rounded-lg border border-white/15 bg-black/80 px-2 py-1 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 shrink items-center gap-1">
          {onPrevClub ? (
            <button
              type="button"
              onClick={onPrevClub}
              disabled={!canPrevClub}
              aria-label="Bastón anterior"
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm font-bold text-white disabled:opacity-30 active:scale-95"
            >
              ‹
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] font-bold text-emerald-300">
                {targetYards}→
              </span>
              <span className="truncate text-sm font-black leading-none text-white">
                {suggestion?.shortLabel ?? "—"}
              </span>
            </div>
            {suggestion ? (
              <span className="truncate text-[9px] font-semibold text-slate-400">
                {isPutter
                  ? `${suggestion.carryYards} yds putt`
                  : `${suggestion.carryYards} yds en bolsa`}
                {gapHint && !isPutter ? (
                  <span className="text-amber-400/90"> · {gapHint}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-[9px] text-amber-200">Activa bastones en Bolsa</span>
            )}
          </div>
          {onNextClub ? (
            <button
              type="button"
              onClick={onNextClub}
              disabled={!canNextClub}
              aria-label="Siguiente bastón"
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm font-bold text-white disabled:opacity-30 active:scale-95"
            >
              ›
            </button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isPutter ? (
            <>
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
            </>
          ) : null}
          {onConfirmShot && suggestion ? (
            <button
              type="button"
              onClick={onConfirmShot}
              aria-label="Confirmar golpe"
              className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white active:scale-95"
            >
              Golpe ✓
            </button>
          ) : null}
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Quitar punto"
              className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              ✕
            </button>
          ) : null}
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
