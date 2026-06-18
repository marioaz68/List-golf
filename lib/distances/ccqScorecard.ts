/** Par oficial por hoyo — Club Campestre de Querétaro (tarjeta azul, par 72). */
export const CCQ_COURSE_PARS = [
  4, 4, 3, 5, 4, 4, 4, 3, 5, // OUT (1-9)
  4, 5, 3, 4, 5, 4, 4, 3, 4, // IN (10-18)
] as const;

export function ccqParForHole(hole: number): number {
  const idx = hole - 1;
  if (idx < 0 || idx >= CCQ_COURSE_PARS.length) return 4;
  return CCQ_COURSE_PARS[idx];
}

export const CCQ_PAR3_HOLES = [3, 8, 12, 17] as const;
export const CCQ_PAR5_HOLES = [4, 9, 11, 14] as const;
export const CCQ_PAR4_HOLES = [1, 2, 5, 6, 7, 10, 13, 15, 16, 18] as const;
