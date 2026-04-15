import type { ScorecardStatus } from "./types";

type DisputeScorecardInput = {
  currentStatus: ScorecardStatus;
  locked_at?: string | null;
  reason: string;
};

type DisputeScorecardResult = {
  nextStatus: ScorecardStatus;
  dispute_reason: string;
  disputed_at: string;
};

export function disputeScorecard(
  input: DisputeScorecardInput
): DisputeScorecardResult {
  if (!input.reason?.trim()) {
    throw new Error("Debes indicar el motivo de la disputa.");
  }

  if (input.locked_at) {
    throw new Error("La tarjeta ya está cerrada y no puede marcarse en disputa.");
  }

  return {
    nextStatus: "disputed",
    dispute_reason: input.reason.trim(),
    disputed_at: new Date().toISOString(),
  };
}