"use client";

import { useState } from "react";
import { resetHandicapCommitteeVotes } from "./actions";

type Props = {
  tournamentId: string;
};

export default function ResetCommitteeVotesPanel({ tournamentId }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm font-semibold text-rose-900"
      >
        {expanded ? "▾" : "▸"} Reiniciar votación (pruebas)
      </button>

      {expanded ? (
        <form
          action={resetHandicapCommitteeVotes}
          className="mt-2 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tournament_id" value={tournamentId} />

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">
              Nombre de esta sesión (opcional)
            </span>
            <input
              type="text"
              name="session_name"
              placeholder="Ej. Primera votación"
              autoComplete="off"
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <label className="flex min-w-[160px] flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">Notas (opcional)</span>
            <input
              type="text"
              name="session_notes"
              placeholder="Motivo del reinicio"
              autoComplete="off"
              className="rounded border border-rose-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-rose-900">
              Escribe REINICIAR para confirmar
            </span>
            <input
              type="text"
              name="confirm"
              required
              placeholder="REINICIAR"
              autoComplete="off"
              className="w-40 rounded border border-rose-400 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Archivar y borrar votos
          </button>

          <p className="basis-full text-[11px] text-rose-900/80">
            Guarda un resumen anónimo de la votación actual en el historial y
            pone en cero los votos de <strong>todos</strong> los miembros del
            comité. Cada miembro deberá volver a calificar a todos los jugadores.
          </p>
        </form>
      ) : null}
    </div>
  );
}
