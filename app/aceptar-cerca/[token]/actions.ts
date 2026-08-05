"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadPlayerAcceptByToken } from "@/lib/cercanos/loadPlayerAccept";

export type AcceptDistanceState = {
  ok: boolean;
  message: string;
};

const MAX_SIGNATURE_CHARS = 600_000;

export async function acceptClosestDistanceAsPlayer(
  _prev: AcceptDistanceState,
  formData: FormData
): Promise<AcceptDistanceState> {
  const token = String(formData.get("token") ?? "").trim();
  const signerName = String(formData.get("signer_name") ?? "")
    .trim()
    .slice(0, 120);
  const rawSig = String(formData.get("signature_payload") ?? "").trim();

  if (!token) return { ok: false, message: "Link inválido." };

  let signature: string | null = null;
  if (rawSig) {
    if (!rawSig.startsWith("data:image/png;base64,")) {
      return { ok: false, message: "Firma inválida. Vuelve a firmar." };
    }
    if (rawSig.length > MAX_SIGNATURE_CHARS) {
      return { ok: false, message: "La firma es demasiado grande." };
    }
    signature = rawSig;
  }

  const admin = createAdminClient();
  const view = await loadPlayerAcceptByToken(admin, token);
  if (!view) {
    return { ok: false, message: "Este enlace no existe o ya no es válido." };
  }
  if (view.expired && !view.playerAccepted) {
    return {
      ok: false,
      message: "El enlace expiró. Pide al capturista uno nuevo.",
    };
  }
  if (view.playerAccepted) {
    return { ok: true, message: "Ya habías aceptado esta distancia. ¡Listo!" };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("closest_to_pin_entries")
    .update({
      player_accepted_at: now,
      player_signature_payload: signature,
      player_signer_name: signerName || view.playerName,
      updated_at: now,
    })
    .eq("id", view.entryRowId)
    .eq("accept_token", token)
    .is("player_accepted_at", null);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/aceptar-cerca/${token}`);
  revalidatePath(`/torneos/${view.tournamentId}/cercanos`);
  revalidatePath("/cercanos");

  return {
    ok: true,
    message: "Distancia aceptada. Gracias — huella registrada.",
  };
}
