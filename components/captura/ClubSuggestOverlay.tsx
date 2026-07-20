"use client";

import { CLUB_BY_ID } from "@/lib/distances/clubCatalog";

interface Suggestion {
  club: string;
  shots: number;
  avg_yards: number;
  consistency: number; // yd de variación (menor = más parejo)
}

interface ClubSuggestOverlayProps {
  chosenCatalogId: string;
  plannedYards: number;
  suggestion: Suggestion;
  onUseMine: () => void;
  onUseSuggested: () => void;
  onBack: () => void;
}

/** Pantalla A: sugerencia de bastón más constante a la distancia elegida. */
export function ClubSuggestOverlay({
  chosenCatalogId,
  plannedYards,
  suggestion,
  onUseMine,
  onUseSuggested,
  onBack,
}: ClubSuggestOverlayProps) {
  const mine = CLUB_BY_ID[chosenCatalogId]?.shortLabel ?? chosenCatalogId;
  const sug = CLUB_BY_ID[suggestion.club]?.shortLabel ?? suggestion.club;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[1090] flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-xs rounded-3xl border border-emerald-400/30 bg-slate-950 p-5 text-center shadow-2xl">
        <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">
          Sugerencia a {plannedYards} yd
        </div>
        <p className="mt-2 text-xs text-slate-300">
          A esta distancia, tu bastón más constante en el historial es otro:
        </p>

        <div className="mt-4 flex items-stretch justify-center gap-3">
          <div className="flex-1 rounded-2xl bg-white/5 py-3">
            <div className="text-[10px] font-bold uppercase text-slate-400">Elegiste</div>
            <div className="text-3xl font-black text-white">{mine}</div>
          </div>
          <div className="flex-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 py-3">
            <div className="text-[10px] font-bold uppercase text-emerald-300">Sugerido</div>
            <div className="text-3xl font-black text-emerald-200">{sug}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-300">
          <b className="text-emerald-200">{sug}</b>: promedio {suggestion.avg_yards} yd ·
          variación ±{suggestion.consistency} yd · {suggestion.shots} tiros
        </div>

        <button
          type="button"
          onClick={onUseSuggested}
          className="mt-5 w-full rounded-2xl bg-emerald-600 py-3 text-base font-black text-white active:scale-95"
        >
          Usar el sugerido ({sug})
        </button>
        <button
          type="button"
          onClick={onUseMine}
          className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white active:scale-95"
        >
          Usar el mío ({mine})
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 w-full py-2 text-xs font-semibold text-slate-400 active:scale-95"
        >
          Volver
        </button>
      </div>
    </div>
  );
}
