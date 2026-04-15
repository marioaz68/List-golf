import { createClient } from "@/utils/supabase/server";

type UpdateScorecardStateInput = {
  scorecard_id: string;
  status?: string;
  is_disqualified?: boolean;
  is_withdrawn?: boolean;
  marker_signed_at?: string | null;
  player_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  dispute_reason?: string | null;
  disputed_at?: string | null;
};

type UpdatedScorecardRow = {
  id: string;
  tournament_id: string;
  round_id: string;
  entry_id: string;
  status: string;
  is_disqualified: boolean;
  is_withdrawn: boolean;
  marker_signed_at: string | null;
  player_signed_at: string | null;
  witness_signed_at: string | null;
  locked_at: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function updateScorecardState(
  input: UpdateScorecardStateInput
): Promise<UpdatedScorecardRow> {
  if (!input.scorecard_id?.trim()) {
    throw new Error("scorecard_id es requerido.");
  }

  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof input.status !== "undefined") payload.status = input.status;
  if (typeof input.is_disqualified !== "undefined") {
    payload.is_disqualified = input.is_disqualified;
  }
  if (typeof input.is_withdrawn !== "undefined") {
    payload.is_withdrawn = input.is_withdrawn;
  }
  if (typeof input.marker_signed_at !== "undefined") {
    payload.marker_signed_at = input.marker_signed_at;
  }
  if (typeof input.player_signed_at !== "undefined") {
    payload.player_signed_at = input.player_signed_at;
  }
  if (typeof input.witness_signed_at !== "undefined") {
    payload.witness_signed_at = input.witness_signed_at;
  }
  if (typeof input.locked_at !== "undefined") {
    payload.locked_at = input.locked_at;
  }
  if (typeof input.dispute_reason !== "undefined") {
    payload.dispute_reason = input.dispute_reason;
  }
  if (typeof input.disputed_at !== "undefined") {
    payload.disputed_at = input.disputed_at;
  }

  const { data, error } = await supabase
    .from("scorecards")
    .update(payload)
    .eq("id", input.scorecard_id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error actualizando scorecard: ${error.message}`);
  }

  return data as UpdatedScorecardRow;
}