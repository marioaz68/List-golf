import { createClient } from "@/utils/supabase/server";
import type { ScorecardSignature } from "./types";

type SavedScorecardSignatureRow = {
  id: string;
  scorecard_id: string;
  role: "player" | "marker" | "witness" | "staff";
  signature_type: "tap" | "typed_name" | "drawn" | "otp";
  signer_name: string;
  signer_player_id: string | null;
  signer_phone: string | null;
  signed_text: string | null;
  signature_payload: string | null;
  signed_at: string;
  created_at: string;
};

export async function saveScorecardSignature(
  input: ScorecardSignature
): Promise<SavedScorecardSignatureRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scorecard_signatures")
    .insert({
      scorecard_id: input.scorecard_id,
      role: input.role,
      signature_type: input.signature_type,
      signer_name: input.signer_name,
      signer_player_id: input.signer_player_id ?? null,
      signer_phone: input.signer_phone ?? null,
      signed_text: input.signed_text ?? null,
      signature_payload: input.signature_payload ?? null,
      signed_at: input.signed_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error guardando firma de scorecard: ${error.message}`);
  }

  return data as SavedScorecardSignatureRow;
}