import { randomUUID } from "crypto";
import { createClient } from "@/utils/supabase/server";

type CreateSignatureRequestInput = {
  scorecard_id: string;
  role: "player" | "marker" | "witness";
  requested_phone?: string | null;
  requested_name?: string | null;
  expires_in_hours?: number;
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

function buildExpiresAt(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

export async function createSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<SignatureRequestRow> {
  if (!input.scorecard_id?.trim()) {
    throw new Error("scorecard_id es requerido.");
  }

  const supabase = await createClient();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = buildExpiresAt(input.expires_in_hours ?? 24);

  const { data, error } = await supabase
    .from("scorecard_signature_requests")
    .insert({
      scorecard_id: input.scorecard_id,
      role: input.role,
      token,
      requested_phone: input.requested_phone ?? null,
      requested_name: input.requested_name ?? null,
      expires_at: expiresAt,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error creando solicitud de firma: ${error.message}`);
  }

  return data as SignatureRequestRow;
}