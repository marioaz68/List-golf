"use client";

import { useActionState, useState } from "react";
import DrawnSignaturePad from "@/components/ui/DrawnSignaturePad";
import {
  acceptClosestDistanceAsPlayer,
  type AcceptDistanceState,
} from "./actions";
import type { PlayerAcceptView } from "@/lib/cercanos/loadPlayerAccept";

const initial: AcceptDistanceState = { ok: false, message: "" };

export default function AcceptNearClient({
  view,
}: {
  view: PlayerAcceptView;
}) {
  const [state, formAction, pending] = useActionState(
    acceptClosestDistanceAsPlayer,
    initial
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(view.playerName);

  if (view.playerAccepted || state.ok) {
    return (
      <div className="space-y-3 rounded-2xl border border-emerald-400/40 bg-emerald-950/30 p-5 text-center">
        <div className="text-3xl" aria-hidden>
          ✓
        </div>
        <h1 className="text-xl font-black text-emerald-200">
          Distancia aceptada
        </h1>
        <p className="text-sm text-slate-300">
          {view.playerName} · hoyo {view.holeNumber} · {view.distanceLabel}
        </p>
        <p className="text-xs text-slate-500">
          Huella del jugador registrada
          {view.playerSignerName || signerName
            ? ` · ${view.playerSignerName || signerName}`
            : ""}
          .
        </p>
        {state.message && !view.playerAccepted ? (
          <p className="text-sm text-emerald-300">{state.message}</p>
        ) : null}
      </div>
    );
  }

  if (view.expired) {
    return (
      <div className="space-y-2 rounded-2xl border border-rose-400/30 bg-rose-950/30 p-5 text-center">
        <h1 className="text-xl font-black text-rose-200">Enlace expirado</h1>
        <p className="text-sm text-slate-300">
          Pide al capturista un enlace o QR nuevo para este hoyo.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={view.token} />
      <input type="hidden" name="signature_payload" value={signature ?? ""} />

      <header className="space-y-1 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
          Más cerca de la bandera
        </div>
        <h1 className="text-2xl font-black text-white">¿Aceptas la distancia?</h1>
        <p className="text-sm text-slate-300">{view.tournamentName}</p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div className="text-xs text-slate-400">
          {view.playerName}
          {view.categoryCode ? ` · ${view.categoryCode}` : ""}
        </div>
        <div className="mt-2 text-sm text-slate-300">Hoyo {view.holeNumber}</div>
        <div className="mt-1 text-4xl font-black tabular-nums text-amber-300">
          {view.distanceLabel}
        </div>
        {view.capturistSigned ? (
          <div className="mt-2 text-[11px] text-emerald-300/90">
            ✓ Medida firmada por capturista
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-slate-500">
            Capturada por el capturista del torneo
          </div>
        )}
      </div>

      <label className="block text-xs font-semibold text-slate-300">
        Tu nombre
        <input
          name="signer_name"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/20 bg-white px-3 py-2.5 text-sm text-slate-900"
          maxLength={120}
          required
        />
      </label>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-300">
          Firma (opcional, con el dedo)
        </div>
        <DrawnSignaturePad value={signature} onChange={setSignature} heightPx={140} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-400 bg-gradient-to-b from-emerald-400 to-emerald-600 text-base font-black text-[#08111f] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Acepto esta distancia"}
      </button>

      {state.message ? (
        <p
          className={`text-center text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-center text-[11px] text-slate-500">
        Al aceptar confirmas que viste y estás de acuerdo con la medida
        registrada en este par 3.
      </p>
    </form>
  );
}
