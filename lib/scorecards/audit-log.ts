import type {
  ScorecardAuditAction,
  ScorecardAuditLogRow,
  ScorecardSignatureRole,
} from "./types";

type CreateAuditLogInput = {
  scorecard_id: string;
  action: ScorecardAuditAction;
  actor_type: ScorecardSignatureRole | "system";
  actor_id?: string | null;
  actor_name?: string | null;
  old_value?: unknown;
  new_value?: unknown;
};

export function createScorecardAuditLog(
  input: CreateAuditLogInput
): ScorecardAuditLogRow {
  if (!input.scorecard_id?.trim()) {
    throw new Error("scorecard_id es requerido.");
  }

  return {
    scorecard_id: input.scorecard_id,
    action: input.action,
    actor_type: input.actor_type,
    actor_id: input.actor_id ?? null,
    actor_name: input.actor_name ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
    created_at: new Date().toISOString(),
  };
}