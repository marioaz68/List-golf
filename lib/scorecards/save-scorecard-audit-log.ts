import { createClient } from "@/utils/supabase/server";
import type { ScorecardAuditLogRow } from "./types";

type SavedScorecardAuditLogRow = {
  id: string;
  scorecard_id: string;
  action:
    | "score_created"
    | "score_updated"
    | "signature_added"
    | "signature_removed"
    | "status_changed"
    | "locked"
    | "unlocked"
    | "disputed"
    | "resolved";
  actor_type: "player" | "marker" | "witness" | "staff" | "system";
  actor_id: string | null;
  actor_name: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export async function saveScorecardAuditLog(
  input: ScorecardAuditLogRow
): Promise<SavedScorecardAuditLogRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scorecard_audit_log")
    .insert({
      scorecard_id: input.scorecard_id,
      action: input.action,
      actor_type: input.actor_type,
      actor_id: input.actor_id ?? null,
      actor_name: input.actor_name ?? null,
      old_value: input.old_value ?? null,
      new_value: input.new_value ?? null,
      created_at: input.created_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Error guardando auditoría de scorecard: ${error.message}`);
  }

  return data as SavedScorecardAuditLogRow;
}