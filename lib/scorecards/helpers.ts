import type {
  BuildScorecardInput,
  ScorecardHole,
  ScorecardTotals,
  ScorecardStatus,
} from "./types";

/**
 * Normaliza hole_no / hole_number
 */
function getHoleNumber(row: any): number | null {
  if (typeof row.hole_number === "number") return row.hole_number;
  if (typeof row.hole_no === "number") return row.hole_no;
  return null;
}

/**
 * Construye arreglo de hoyos 1–18
 */
export function buildHoles(input: BuildScorecardInput): ScorecardHole[] {
  const holes: ScorecardHole[] = [];

  for (let i = 1; i <= 18; i++) {
    holes.push({ hole: i, strokes: null });
  }

  for (const row of input.holeScores) {
    const hole = getHoleNumber(row);
    if (!hole || hole < 1 || hole > 18) continue;

    holes[hole - 1].strokes =
      typeof row.strokes === "number" ? row.strokes : null;
  }

  return holes;
}

/**
 * Calcula totales (OUT / IN / GROSS)
 */
export function calculateTotals(holes: ScorecardHole[]): ScorecardTotals {
  let out = 0;
  let back = 0;
  let gross = 0;
  let holesPlayed = 0;

  holes.forEach((h) => {
    if (typeof h.strokes === "number") {
      gross += h.strokes;
      holesPlayed++;

      if (h.hole <= 9) out += h.strokes;
      else back += h.strokes;
    }
  });

  return {
    out,
    in: back,
    gross,
    holesPlayed,
  };
}

/**
 * Detecta si la ronda ya terminó (18 hoyos)
 */
export function isRoundComplete(holes: ScorecardHole[]): boolean {
  return holes.every((h) => typeof h.strokes === "number");
}

/**
 * Determina si la tarjeta puede entrar en revisión
 */
export function shouldMoveToReview(holes: ScorecardHole[]): boolean {
  return isRoundComplete(holes);
}

/**
 * Determina si puede bloquearse
 */
export function canLockScorecard(
  status: ScorecardStatus,
  hasPlayer: boolean,
  hasMarker: boolean,
  hasWitness: boolean,
  hasStaff: boolean
): boolean {
  if (status === "locked") return false;

  if (hasStaff) return true;

  return hasPlayer && hasMarker && hasWitness;
}

/**
 * Determina siguiente estado después de firma
 */
export function getNextStatusAfterSignature(
  current: ScorecardStatus,
  role: "player" | "marker" | "witness" | "staff",
  hasPlayer: boolean,
  hasMarker: boolean,
  hasWitness: boolean
): ScorecardStatus {
  if (current === "locked") return current;

  if (role === "staff") {
    return "signed_complete";
  }

  if (role === "marker") {
    if (hasPlayer && hasWitness) return "signed_complete";
    return "signed_marker";
  }

  if (role === "player") {
    if (hasMarker && hasWitness) return "signed_complete";
    return "signed_player";
  }

  if (role === "witness") {
    if (hasPlayer && hasMarker) return "signed_complete";
    return "in_review";
  }

  return current;
}