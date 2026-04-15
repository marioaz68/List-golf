import { canLockScorecard } from "./helpers";
import type { ScorecardStatus } from "./types";

type LockScorecardInput = {
  status: ScorecardStatus;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
};

type LockScorecardResult = {
  shouldLock: boolean;
  nextStatus: ScorecardStatus;
  locked_at: string | null;
};

export function lockScorecard(
  input: LockScorecardInput
): LockScorecardResult {
  const hasPlayer = !!input.player_signed_at;
  const hasMarker = !!input.marker_signed_at;

  if (input.locked_at) {
    return {
      shouldLock: false,
      nextStatus: "locked",
      locked_at: input.locked_at,
    };
  }

  const allowed = canLockScorecard(input.status, hasPlayer, hasMarker);

  if (!allowed) {
    return {
      shouldLock: false,
      nextStatus: input.status,
      locked_at: null,
    };
  }

  const lockedAt = new Date().toISOString();

  return {
    shouldLock: true,
    nextStatus: "locked",
    locked_at: lockedAt,
  };
}