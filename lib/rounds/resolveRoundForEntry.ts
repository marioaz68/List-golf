import {
  normalizeStartTypeForSession,
  normalizeTime,
  roundsInSameSession,
  toYyyyMmDd,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";

export type RoundForEntryResolve = SessionRoundFields & {
  round_no: number;
};

/**
 * Ronda de captura / scorecard alineada con la categoría de la inscripción.
 *
 * El selector de score-entry suele usar la «sesión» (día + onda AM/PM + salida);
 * cada categoría tiene su propia fila en `rounds`. Si la onda de la UI no coincide
 * con la del inscrito (p. ej. operador en R1 PM y jugadora DB en R1 AM), hay que
 * resolver por categoría + round_no, no exigir la misma onda.
 */
export function resolveRoundIdForEntry(
  rounds: RoundForEntryResolve[],
  sessionRoundId: string,
  entryCategoryId: string | null
): string {
  const selected =
    rounds.find((r) => r.id === sessionRoundId) ??
    rounds.find((r) => String(r.id) === sessionRoundId);

  if (!selected) return sessionRoundId;

  const cat = String(entryCategoryId ?? "").trim();
  const sess = roundsInSameSession(rounds, selected.id);

  if (!cat) {
    return sess[0]?.id ?? selected.id;
  }

  const inSess = sess.find((r) => String(r.category_id ?? "").trim() === cat);
  if (inSess) return inSess.id;

  const ymd = toYyyyMmDd(selected.round_date);
  const rn = selected.round_no;

  const sameCategoryRounds = rounds.filter((r) => {
    if (r.round_no !== rn) return false;
    if (String(r.category_id ?? "").trim() !== cat) return false;
    if (ymd != null && toYyyyMmDd(r.round_date) !== ymd) return false;
    return true;
  });

  if (sameCategoryRounds.length > 0) {
    const wave = String(selected.wave ?? "").trim().toUpperCase();
    const st = normalizeStartTypeForSession(selected.start_type);
    const t0 = normalizeTime(selected.start_time);

    const exactMeta =
      sameCategoryRounds.find(
        (r) =>
          String(r.wave ?? "").trim().toUpperCase() === wave &&
          normalizeStartTypeForSession(r.start_type) === st &&
          normalizeTime(r.start_time) === t0
      ) ??
      sameCategoryRounds.find(
        (r) => String(r.wave ?? "").trim().toUpperCase() === wave
      ) ??
      [...sameCategoryRounds].sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      )[0];

    if (exactMeta) return exactMeta.id;
  }

  return selected.id;
}
