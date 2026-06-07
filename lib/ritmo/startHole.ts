/**
 * Hoyo de salida efectivo para ritmo de campo.
 * Muchos grupos (p. ej. stroke agregado) se crean con starting_hole null;
 * sin esto el ritmo asume salida en el 1 y marca atraso falso en salidas del 10.
 */

/** Cuenta hoyos completados en orden desde el tee (con wrap 1..18). */
export function countSequentialHolesFromStart(
  captured: ReadonlySet<number>,
  startHole: number
): number {
  let count = 0;
  for (let i = 0; i < 18; i++) {
    const hole = ((startHole - 1 + i) % 18) + 1;
    if (!captured.has(hole)) break;
    count++;
  }
  return count;
}

/** Hoyos jugados a partir del hoyo actual detectado (GPS o marcador). */
export function holesPlayedFromCurrentHole(
  currentHole: number,
  startHole: number
): number {
  let n = (currentHole - startHole + 18) % 18;
  if (n === 0 && currentHole !== startHole) n = 18;
  return n;
}

function inferStartHoleFromCaptured(captured: Iterable<number>): number | null {
  const holes = [...captured];
  if (holes.length === 0) return null;
  const min = Math.min(...holes);
  if (min >= 10) return 10;
  if (min <= 9 && holes.every((h) => h <= 9)) return 1;
  return null;
}

function inferStartHoleFromNotes(notes: string | null | undefined): number | null {
  const n = String(notes ?? "").trim();
  if (!n) return null;
  if (n.includes("STROKE AGREGADO")) return 10;
  const m = n.match(/\bH(?:OYO)?\s*(\d{1,2})\b/i);
  if (m) {
    const hole = Number(m[1]);
    if (hole >= 1 && hole <= 18) return hole;
  }
  return null;
}

/** Hoyo de salida efectivo: BD → notas del grupo → hoyos capturados → 1. */
export function resolveGroupStartHole(
  starting_hole: number | null | undefined,
  notes?: string | null,
  capturedHoles?: Iterable<number>
): number {
  if (
    typeof starting_hole === "number" &&
    Number.isFinite(starting_hole) &&
    starting_hole >= 1 &&
    starting_hole <= 18
  ) {
    return starting_hole;
  }
  const fromNotes = inferStartHoleFromNotes(notes);
  if (fromNotes != null) return fromNotes;
  if (capturedHoles) {
    const fromScores = inferStartHoleFromCaptured(capturedHoles);
    if (fromScores != null) return fromScores;
  }
  return 1;
}
