"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { signScorecardAction } from "@/app/(backoffice)/scorecards/actions";

type WitnessSignFormProps = {
  scorecard_id: string;
  current_status: string;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  signer_name?: string;
  holes_played?: number;
};

export default function WitnessSignForm({
  scorecard_id,
  current_status,
  player_signed_at = null,
  marker_signed_at = null,
  witness_signed_at = null,
  locked_at = null,
  signer_name = "Testigo",
  holes_played = 0,
}: WitnessSignFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isComplete = holes_played === 18;

  const disabled =
    isPending ||
    !!locked_at ||
    !!witness_signed_at ||
    !player_signed_at || // 🔥 testigo firma al final
    !isComplete;

  let helper = "El testigo valida la tarjeta final.";

  if (!isComplete) {
    helper = `No se puede firmar: faltan hoyos (${holes_played}/18).`;
  } else if (!player_signed_at) {
    helper = "Primero debe firmar el jugador.";
  } else if (locked_at) {
    helper = "La tarjeta ya está cerrada.";
  } else if (witness_signed_at) {
    helper = "El testigo ya firmó.";
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">Firma testigo</h2>
      <p className="text-xs text-slate-600 mt-1">{helper}</p>

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!isComplete) {
            alert("No puedes firmar hasta completar los 18 hoyos.");
            return;
          }

          if (!player_signed_at) {
            alert("El jugador debe firmar primero.");
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
                role: "witness",
                signer_name,
              });

              router.refresh();
            } catch (error) {
              console.error(error);
              alert("Error firmando como testigo");
            }
          });
        }}
        className="mt-3 rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Firmando..." : "Firmar como testigo"}
      </button>
    </section>
  );
}