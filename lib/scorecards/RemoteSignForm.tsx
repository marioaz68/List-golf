"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signScorecardByTokenAction } from "@/app/(backoffice)/scorecards/actions";

type RemoteSignFormProps = {
  token: string;
  scorecard_id: string;
  current_status: string;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  default_name?: string;
  default_phone?: string;
  role: "player" | "marker" | "witness";
  holes_played?: number;
};

export default function RemoteSignForm({
  token,
  scorecard_id,
  current_status,
  player_signed_at = null,
  marker_signed_at = null,
  witness_signed_at = null,
  locked_at = null,
  default_name = "",
  default_phone = "",
  role,
  holes_played = 0,
}: RemoteSignFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(default_name);
  const [phone, setPhone] = useState(default_phone);
  const [done, setDone] = useState(false);

  const isComplete = holes_played === 18;
  const alreadySigned =
    (role === "player" && !!player_signed_at) ||
    (role === "marker" && !!marker_signed_at) ||
    (role === "witness" && !!witness_signed_at);

  const disabled =
    isPending || !!locked_at || alreadySigned || !isComplete || !name.trim();

  let helperText = "Revisa la tarjeta y firma.";
  if (!isComplete) {
    helperText = `No se puede firmar: faltan hoyos (${holes_played}/18).`;
  } else if (locked_at) {
    helperText = "La tarjeta ya está cerrada.";
  } else if (alreadySigned) {
    helperText = "Esta firma ya fue registrada.";
  } else if (role === "player" && marker_signed_at) {
    helperText = "Al firmar se cerrará la tarjeta.";
  }

  const buttonLabel = isPending ? "Firmando..." : "Firmar tarjeta";

  return (
    <>
      <section className="rounded-lg bg-white p-3 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Confirmación de firma</h2>

        <p className="mt-1 text-[11px] text-slate-600">{helperText}</p>

        {done ? (
          <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[11px] text-green-800">
            Firma registrada correctamente.
          </div>
        ) : null}

        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-[11px] font-medium text-slate-800">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm text-black outline-none"
              placeholder="Tu nombre"
              disabled={isPending || alreadySigned || !!locked_at}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] font-medium text-slate-800">Teléfono</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 rounded-lg border border-slate-300 px-3 text-sm text-black outline-none"
              placeholder="Tu teléfono"
              disabled={isPending || alreadySigned || !!locked_at}
              inputMode="tel"
            />
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
            Scorecard ID: <span className="font-mono">{scorecard_id}</span>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[430px] flex-col gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!isComplete) {
                alert(
                  `No se puede firmar porque solo hay ${holes_played}/18 hoyos capturados.`
                );
                return;
              }

              if (!name.trim()) {
                alert("Debes escribir tu nombre.");
                return;
              }

              startTransition(async () => {
                try {
                  await signScorecardByTokenAction({
                    token,
                    current_status,
                    player_signed_at,
                    marker_signed_at,
                    witness_signed_at,
                    locked_at,
                    signer_name: name.trim(),
                    signer_phone: phone.trim() || null,
                  });

                  setDone(true);
                  router.refresh();
                } catch (error) {
                  console.error(error);
                  alert(
                    error instanceof Error
                      ? error.message
                      : "No se pudo registrar la firma remota."
                  );
                }
              });
            }}
            className="h-12 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buttonLabel}
          </button>

          <div className="text-center text-[10px] text-slate-500">
            Revisa la tarjeta completa antes de confirmar.
          </div>
        </div>
      </div>
    </>
  );
}