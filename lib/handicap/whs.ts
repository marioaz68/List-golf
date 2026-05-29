/**
 * Cálculo de Course Handicap y Playing Handicap según WHS / USGA / GHIN.
 *
 * Orden oficial:
 *
 *   Course Handicap (CH)  = round( HI × Slope / 113 + (Course Rating − Par) )
 *   Playing Handicap (PH) = round( CH × Allowance% / 100 )
 *
 * El allowance NUNCA se aplica al HI directamente: primero se ajusta por
 * dificultad del campo (slope/rating/par) y luego se aplica el % del formato.
 *
 * Redondeo: estándar matemático (0.5 sube). Coincide con GHIN para los casos
 * típicos. WHS define el redondeo del CH al entero más cercano (Rules of
 * Handicapping, Apéndice E) y luego el PH al entero más cercano.
 */

export type WhsTeeData = {
  slope: number;
  course_rating: number;
  par: number;
};

export type WhsComputeInput = {
  hi: number;
  slope: number;
  course_rating: number;
  par: number;
  /** % entero, ej. 80 para Bola Baja+Alta, 100 para individual. */
  allowance_pct: number;
};

export type WhsComputeResult = {
  course_handicap: number;
  playing_handicap: number;
  /** Snapshot de los valores usados, útil para auditoría. */
  meta: {
    hi: number;
    slope: number;
    course_rating: number;
    par: number;
    allowance_pct: number;
    computed_at: string;
    source?: string;
    tee_code?: string | null;
    category_id?: string | null;
    /** HI capado al máximo a jugar (handicap_max) o al mínimo (handicap_min)
     *  de la regla del torneo, cuando el HI real del jugador rebasa el rango. */
    hi_cap_applied?: number | null;
    hi_cap_source?: "rule_max" | "rule_min" | null;
  };
};

function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5);
}

export function isValidWhsTee(t: Partial<WhsTeeData> | null | undefined): t is WhsTeeData {
  if (!t) return false;
  const { slope, course_rating, par } = t;
  return (
    typeof slope === "number" &&
    Number.isFinite(slope) &&
    slope >= 55 &&
    slope <= 155 &&
    typeof course_rating === "number" &&
    Number.isFinite(course_rating) &&
    course_rating >= 50 &&
    course_rating <= 90 &&
    typeof par === "number" &&
    Number.isFinite(par) &&
    par >= 60 &&
    par <= 80
  );
}

export function computeCourseHandicap(
  hi: number,
  slope: number,
  course_rating: number,
  par: number
): number {
  if (!Number.isFinite(hi)) return 0;
  const raw = hi * (slope / 113) + (course_rating - par);
  return roundHalfUp(raw);
}

export function computePlayingHandicapFromCh(
  course_handicap: number,
  allowance_pct: number
): number {
  if (!Number.isFinite(course_handicap)) return 0;
  if (!Number.isFinite(allowance_pct) || allowance_pct <= 0) return 0;
  return roundHalfUp((course_handicap * allowance_pct) / 100);
}

export function computeWhsHandicap(input: WhsComputeInput): WhsComputeResult {
  const ch = computeCourseHandicap(
    input.hi,
    input.slope,
    input.course_rating,
    input.par
  );
  const ph = computePlayingHandicapFromCh(ch, input.allowance_pct);
  return {
    course_handicap: ch,
    playing_handicap: ph,
    meta: {
      hi: input.hi,
      slope: input.slope,
      course_rating: input.course_rating,
      par: input.par,
      allowance_pct: input.allowance_pct,
      computed_at: new Date().toISOString(),
    },
  };
}

export function pickTeeForGender(params: {
  gender: "M" | "F" | "X" | null | undefined;
  men: Partial<WhsTeeData> | null;
  women: Partial<WhsTeeData> | null;
}): WhsTeeData | null {
  const g = (params.gender ?? "X").toUpperCase();
  if (g === "F" && isValidWhsTee(params.women)) return params.women;
  if (g === "M" && isValidWhsTee(params.men)) return params.men;
  if (isValidWhsTee(params.men)) return params.men;
  if (isValidWhsTee(params.women)) return params.women;
  return null;
}
