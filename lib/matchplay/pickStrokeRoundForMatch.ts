/**
 * Selección de ronda de captura (hole_scores) para un match del cuadro.
 *
 * Regresión (a17bb6c): el fallback de “rematch” tomaba CUALQUIER salida
 * donde aparecieran ≥2 jugadores del match. En cuartos (R4) sin jugar,
 * Correa/Urquiza estaban juntos en un foursome de R3 y Cárdenas/Ochoa en
 * otro → se reutilizaba R3 y se armaba una tarjeta frankenstein con los
 * 4 scores de partidos distintos.
 *
 * Reglas:
 * 1. Preferir la ronda asignada del match si ya tiene golpes.
 * 2. Rematch solo en round_no >= round del cuadro (nunca una ronda anterior).
 * 3. El grupo de salida debe incluir a TODOS los jugadores del match
 *    (2 en singles, 4 en low-high), no solo un pair.
 */

export type StrokeRoundGroupCandidate = {
  roundId: string;
  /** `rounds.round_no` de la salida (calendario), no inventado. */
  roundNo: number;
  /** Cuántos jugadores del match están en ese pairing_group. */
  memberCount: number;
};

/**
 * Candidatos de rematch ordenados (ronda más reciente primero).
 * Vacío ⇒ no hay salida válida; el detalle debe quedar en blanco.
 */
export function rematchStrokeRoundCandidates(args: {
  matchRoundNo: number;
  requiredMembers: number;
  groups: StrokeRoundGroupCandidate[];
}): Array<{ roundId: string; roundNo: number }> {
  const matchRoundNo = Number(args.matchRoundNo) || 0;
  const need = Number(args.requiredMembers) || 0;
  if (need <= 0) return [];

  const seen = new Set<string>();
  const out: Array<{ roundId: string; roundNo: number }> = [];
  for (const g of args.groups) {
    const rid = String(g.roundId ?? "").trim();
    const roundNo = Number(g.roundNo) || 0;
    if (!rid) continue;
    if (g.memberCount < need) continue;
    if (roundNo < matchRoundNo) continue;
    if (seen.has(rid)) continue;
    seen.add(rid);
    out.push({ roundId: rid, roundNo });
  }
  out.sort((a, b) => b.roundNo - a.roundNo);
  return out;
}

/**
 * Elige la ronda de hole_scores para pintar el match.
 * `hasScores(roundId)` debe ser true solo si hay golpes de esos jugadores
 * en esa ronda.
 */
export function pickStrokeRoundForMatch(args: {
  matchRoundNo: number;
  requiredMembers: number;
  assignedRoundId: string | null;
  assignedHasScores: boolean;
  groups: StrokeRoundGroupCandidate[];
  hasScores: (roundId: string) => boolean;
}): string | null {
  const assigned = args.assignedRoundId?.trim() || null;
  if (assigned && args.assignedHasScores) return assigned;

  for (const c of rematchStrokeRoundCandidates({
    matchRoundNo: args.matchRoundNo,
    requiredMembers: args.requiredMembers,
    groups: args.groups,
  })) {
    if (args.hasScores(c.roundId)) return c.roundId;
  }
  return null;
}

/**
 * Para el live del cuadro: solo misma ronda o rematch posterior con el
 * mismo cruce de parejas. Nunca una salida de ronda anterior.
 */
export function pickDerivedMatchByRound<
  T extends { round_no: number },
>(args: {
  matchRoundNo: number;
  sameRound: T | undefined;
  laterOrSame: T[];
}): T | undefined {
  if (args.sameRound) return args.sameRound;
  const later = args.laterOrSame
    .filter((x) => Number(x.round_no) >= Number(args.matchRoundNo))
    .sort((a, b) => Number(b.round_no) - Number(a.round_no));
  return later[0];
}
