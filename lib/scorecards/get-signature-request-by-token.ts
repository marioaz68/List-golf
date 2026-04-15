import { createClient } from "@/utils/supabase/server";

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

export async function getSignatureRequestByToken(
  token: string
): Promise<SignatureRequestRow> {
  if (!token?.trim()) {
    throw new Error("token es requerido.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scorecard_signature_requests")
    .select("*")
    .eq("token", token.trim())
    .single();

  if (error) {
    throw new Error(`Error consultando solicitud de firma: ${error.message}`);
  }

  const row = data as SignatureRequestRow;

  if (row.status !== "pending") {
    throw new Error("La solicitud de firma ya no está disponible.");
  }

  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    const now = Date.now();

    if (Number.isFinite(expiresAt) && now > expiresAt) {
      throw new Error("La solicitud de firma ya expiró.");
    }
  }

  return row;
}