import { createClient } from "@/utils/supabase/server";

type MarkSignatureRequestUsedInput = {
  token: string;
};

type SignatureRequestRow = {
  id: string;
  scorecard_id: string;
  role: "player" | "marker" | "witness";
  token: string;
  requested_phone: string | null;
  requested_name: string | null;
  status: "pending" | "used" | "expired" | "cancelled";
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
};

export async function markSignatureRequestUsed(
  input: MarkSignatureRequestUsedInput
): Promise<SignatureRequestRow> {
  if (!input.token?.trim()) {
    throw new Error("token es requerido.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scorecard_signature_requests")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
    })
    .eq("token", input.token.trim())
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error marcando solicitud como usada: ${error.message}`);
  }

  return data as SignatureRequestRow;
}