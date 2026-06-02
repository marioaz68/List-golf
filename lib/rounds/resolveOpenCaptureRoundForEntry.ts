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
      /**
       * Reservado: el cierre oficial del torneo ya NO es prerrequisito para capturar
       * R+1 de un jugador individual. Se mantiene la variante para compatibilidad,
       * pero `resolveOpenCaptureRoundForEntry` no la devuelve nunca.
       */
      reason: "prior_not_officially_closed";
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
 *
 * Reglas:
 * - Solo exige que la ronda anterior de ESTE inscrito esté cerrada (tarjeta lockeada).
 *   No depende de que el comité haya cerrado oficialmente la ronda a nivel torneo, ni
 *   de que otros inscritos/categorías hayan terminado: en cuanto un jugador o pareja
 *   cierra su R1, puede capturarse su R2 (las salidas siguientes ya las genera el
 *   sistema en cuanto la pareja y su rival cierran).
 * - El parámetro `_tournamentSettings` queda solo por compatibilidad de firma.
 */
export function resolveOpenCaptureRoundForEntry(
  entryId: string,
  entryCategoryId: string | null,
  rounds: RoundForGate[],
  lookups: LockedScorecardLookups,
  _tournamentSettings?: unknown
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
      const priorRoundNo = roundNo - 1;
      const priorRound = getRoundForCategory(rounds, priorRoundNo, cat || null);
      if (
        priorRound?.id &&
        !isEntryRoundClosed(entryId, priorRound, lookups)
      ) {
        return {
          ok: false,
          reason: "prior_not_closed",
          targetRoundNo: roundNo,
          priorRoundNo,
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
