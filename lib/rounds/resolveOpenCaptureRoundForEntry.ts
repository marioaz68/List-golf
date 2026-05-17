import { getRoundForCategory, type RoundForGate } from "@/lib/rounds/categoryRoundGate";
import {
  isEntryRoundClosed,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";

export type OpenCaptureRoundResult =
  | {
      ok: true;
      roundId: string;
      roundNo: number;
      /** true = todas las rondas lógicas cerradas; mostrar esta (la última) con «ABRIR». */
      roundClosed?: boolean;
    }
  | {
      ok: false;
      reason: "prior_not_closed";
      targetRoundNo: number;
      priorRoundNo: number;
    }
  | {
      ok: false;
      reason: "all_closed";
      lastRoundNo: number;
    }
  | {
      ok: false;
      reason: "no_round";
    };

/**
 * Qué ronda debe capturarse para este inscrito:
 * la primera no cerrada en su categoría (R1, luego R2…).
 * No depende del turno AM/PM del selector de mesa.
 */
export function resolveOpenCaptureRoundForEntry(
  entryId: string,
  entryCategoryId: string | null,
  rounds: RoundForGate[],
  lookups: LockedScorecardLookups
): OpenCaptureRoundResult {
  const cat = String(entryCategoryId ?? "").trim();
  const roundNos = [...new Set(rounds.map((r) => r.round_no))]
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  if (roundNos.length === 0) {
    return { ok: false, reason: "no_round" };
  }

  let lastClosed: { roundId: string; roundNo: number } | null = null;

  for (const roundNo of roundNos) {
    const round = getRoundForCategory(rounds, roundNo, cat || null);
    if (!round?.id) continue;

    if (roundNo > 1) {
      const priorRound = getRoundForCategory(rounds, roundNo - 1, cat || null);
      if (
        priorRound?.id &&
        !isEntryRoundClosed(entryId, priorRound, lookups)
      ) {
        return {
          ok: false,
          reason: "prior_not_closed",
          targetRoundNo: roundNo,
          priorRoundNo: roundNo - 1,
        };
      }
    }

    const closed = isEntryRoundClosed(entryId, round, lookups);
    if (closed) {
      lastClosed = { roundId: round.id, roundNo };
      continue;
    }
    return { ok: true, roundId: round.id, roundNo, roundClosed: false };
  }

  if (lastClosed) {
    return {
      ok: true,
      roundId: lastClosed.roundId,
      roundNo: lastClosed.roundNo,
      roundClosed: true,
    };
  }

  const last = roundNos[roundNos.length - 1] ?? 1;
  return { ok: false, reason: "all_closed", lastRoundNo: last };
}
