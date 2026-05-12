/**
 * Rondas con `category_id` nulo aplican a todas las categorías.
 * Si la ronda tiene categoría, solo aplica a jugadoras de esa categoría.
 */
export function roundRowAppliesToEntry(
  round: { category_id?: string | null },
  entryCategoryId: string | null | undefined
): boolean {
  const rc = String(round.category_id ?? "").trim();
  if (!rc) return true;
  const ec = String(entryCategoryId ?? "").trim();
  if (!ec) return true;
  return rc === ec;
}

export type SelectedRoundMeta = {
  id: string;
  round_no: number;
  round_date: string | null;
  category_id?: string | null;
};

export type RoundLike = SelectedRoundMeta;

/** Detalle hoyo por hoyo que corresponde a la ronda vista para la categoría de la jugadora. */
export function resolveDetailForSelectedRound<
  T extends {
    round_id: string;
    round_no: number;
    round_date: string | null;
    category_id?: string | null;
    is_dq?: boolean;
    to_par?: number | null;
    holes: Array<{ strokes?: number | null }>;
  },
>(details: T[], selectedRound: SelectedRoundMeta | null, entryCategoryId: string | null | undefined): T | null {
  if (!selectedRound) return null;

  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) {
    const exact = details.find((d) => d.round_id === selectedRound.id) ?? null;
    if (exact) return exact;
  }

  return (
    details.find(
      (d) =>
        d.round_no === selectedRound.round_no &&
        String(d.round_date ?? "") === String(selectedRound.round_date ?? "") &&
        roundRowAppliesToEntry({ category_id: d.category_id ?? null }, entryCategoryId)
    ) ??
    details.find(
      (d) =>
        d.round_no === selectedRound.round_no &&
        roundRowAppliesToEntry({ category_id: d.category_id ?? null }, entryCategoryId)
    ) ??
    null
  );
}

/** `rounds.id` efectivo para standings / to par cuando `selectedRound` es de otra categoría. */
export function resolveEffectiveRoundIdForEntry(
  selectedRound: SelectedRoundMeta | null,
  entryCategoryId: string | null | undefined,
  rounds: RoundLike[]
): string | null {
  if (!selectedRound) return null;
  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) return selectedRound.id;

  const hit =
    rounds.find(
      (r) =>
        r.round_no === selectedRound.round_no &&
        String(r.round_date ?? "") === String(selectedRound.round_date ?? "") &&
        roundRowAppliesToEntry(r, entryCategoryId)
    ) ??
    rounds.find(
      (r) =>
        r.round_no === selectedRound.round_no && roundRowAppliesToEntry(r, entryCategoryId)
    );

  return hit?.id ?? selectedRound.id;
}

export function resolvePreviousRoundRowForEntry(
  effectiveRound: RoundLike | null,
  entryCategoryId: string | null | undefined,
  rounds: RoundLike[]
): RoundLike | null {
  if (!effectiveRound || effectiveRound.round_no <= 1) return null;
  const prevNo = effectiveRound.round_no - 1;
  const list = rounds.filter(
    (r) => r.round_no === prevNo && roundRowAppliesToEntry(r, entryCategoryId)
  );
  if (list.length === 0) return null;
  return [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
