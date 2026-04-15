import { createClient } from "@/utils/supabase/server";

type GetOrCreateScorecardInput = {
  tournament_id: string;
  round_id: string;
  entry_id: string;
};

type ScorecardRow = {
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

export async function getOrCreateScorecard(
  input: GetOrCreateScorecardInput
): Promise<ScorecardRow> {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("scorecards")
    .select("*")
    .eq("entry_id", input.entry_id)
    .eq("round_id", input.round_id)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Error consultando scorecard existente: ${existingError.message}`
    );
  }

  if (existing) {
    return existing as ScorecardRow;
  }

  const { data: created, error: createError } = await supabase
    .from("scorecards")
    .insert({
      tournament_id: input.tournament_id,
      round_id: input.round_id,
      entry_id: input.entry_id,
      status: "draft",
    })
    .select("*")
    .single();

  if (createError) {
    throw new Error(`Error creando scorecard: ${createError.message}`);
  }

  return created as ScorecardRow;
}