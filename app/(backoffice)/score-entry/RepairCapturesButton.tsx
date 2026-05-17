"use client";

import { useActionState } from "react";
import {
  repairTournamentCapturesAction,
  type RepairCapturesState,
} from "./actions";

const initial: RepairCapturesState = { ok: false, message: "" };

export default function RepairCapturesButton({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    repairTournamentCapturesAction,
    initial
  );

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-3 text-sm text-amber-950">
      <p className="font-medium">Reparar capturas mal categorizadas</p>
      <p className="mt-1 text-amber-900/90">
        Mueve scores guardados en la categoría equivocada a la del inscrito (sin
        cambiar números). Úselo una vez tras actualizar el sistema.
      </p>
      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (
              !window.confirm(
                "¿Reparar todas las capturas de este torneo? Puede tardar un minuto."
              )
            ) {
              e.preventDefault();
            }
          }}
          className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
        >
          {pending ? "Reparando…" : "Ejecutar reparación"}
        </button>
      </form>
      {state.message ? (
        <p
          className={`mt-2 ${state.ok ? "text-green-800" : "text-red-800"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
