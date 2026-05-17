"use client";

import { useActionState } from "react";
import {
  confirmTournamentRoundClosed,
  type ConfirmRoundCloseState,
} from "./actions";
import type { TournamentRoundCloseStatus } from "@/lib/rounds/tournamentRoundClosure";

const initial: ConfirmRoundCloseState = { ok: false, message: "" };

export default function ScoreEntryRoundCloseBanner({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: TournamentRoundCloseStatus;
}) {
  const [state, action, pending] = useActionState(
    confirmTournamentRoundClosed,
    initial
  );

  if (status.officiallyClosed) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
        <p className="font-semibold">
          Ronda {status.roundNo} cerrada oficialmente
        </p>
        <p className="mt-0.5 text-xs text-emerald-800">
          El torneo ya puede usar la ronda {status.roundNo + 1} en captura y
          listados públicos.
          {status.closedAt
            ? ` · ${new Date(status.closedAt).toLocaleString("es-MX")}`
            : null}
        </p>
      </div>
    );
  }

  if (!status.readyToConfirm) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-sky-300 bg-sky-50 px-3 py-3 text-sm text-sky-950">
      <p className="font-semibold">
        Todas las categorías tienen la R{status.roundNo} capturada y cerrada
      </p>
      <p className="mt-1 text-xs text-sky-900">
        Confirma el cierre oficial del comité para habilitar la captura de la
        ronda {status.roundNo + 1} y el salto automático en listados públicos.
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <input type="hidden" name="round_no" value={String(status.roundNo)} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-60"
        >
          {pending
            ? "Cerrando…"
            : `Cerrar Ronda ${status.roundNo} definitivamente`}
        </button>
      </form>
      {state.message ? (
        <p
          className={`mt-2 text-xs ${state.ok ? "text-emerald-800" : "text-red-700"}`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
