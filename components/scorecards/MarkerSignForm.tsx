"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signScorecardAction } from "@/app/(backoffice)/scorecards/actions";

type MarkerSignFormProps = {
  scorecard_id: string;
  current_status: string;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  signer_name?: string;
  holes_played?: number;
};

export default function MarkerSignForm({
  scorecard_id,
  current_status,
  player_signed_at = null,
  marker_signed_at = null,
  witness_signed_at = null,
  locked_at = null,
  signer_name = "Marcador",
  holes_played = 0,
}: MarkerSignFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isComplete = holes_played === 18;

  const disabled =
    !!marker_signed_at || !!locked_at || isPending || !isComplete;

  let helperText = "Pendiente de firma.";

  if (!isComplete) {
    helperText = `No se puede firmar: faltan hoyos por capturar (${holes_played}/18).`;
  } else if (marker_signed_at) {
    helperText = `Ya firmó: ${marker_signed_at}`;
  } else if (locked_at) {
    helperText = "La tarjeta ya está cerrada.";
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-900">
        Firma del marcador
      </div>

      <div className="mb-3 text-xs text-slate-600">{helperText}</div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!isComplete) {
            alert(
              `No se puede firmar la tarjeta porque solo hay ${holes_played} de 18 hoyos capturados.`
            );
            return;
          }

          startTransition(async () => {
            try {
              await signScorecardAction({
                scorecard_id,
                current_status,
                player_signed_at,
                marker_signed_at,
                witness_signed_at,
                locked_at,
                role: "marker",
                signer_name,
              });

              router.refresh();
            } catch (error) {
              console.error(error);
              alert(
                error instanceof Error
                  ? error.message
                  : "No se pudo firmar la tarjeta."
              );
            }
          });
        }}
        className="rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Firmando..." : "Firmar como marcador"}
      </button>
    </div>
  );
}