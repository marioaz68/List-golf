function trimId(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Rondas con `category_id` nulo aplican a todas las categorías.
 * Si la ronda tiene categoría, solo aplica a jugadoras de esa categoría.
 */
export function roundRowAppliesToEntry(
  round: { category_id?: string | null },
  entryCategoryId: string | null | undefined
): boolean {
  const rc = trimId(round.category_id);
  if (!rc) return true;
  const ec = trimId(entryCategoryId);
  if (!ec) return true;
  return rc === ec;
}

/** Rondas donde esta fila de leaderboard ya tiene captura (hoyos o gross o DQ). */
export function collectRoundIdsWithScoreCapture(details: Array<{
  round_id: string;
  is_dq?: boolean;
  gross_score?: number | null;
  holes?: Array<{ strokes?: unknown }>;
}>): Set<string> {
  const s = new Set<string>();
  for (const d of details) {
    if (d.is_dq) {
      s.add(d.round_id);
      continue;
    }
    if (d.gross_score != null) {
      s.add(d.round_id);
      continue;
    }
    const holes = d.holes ?? [];
    for (const h of holes) {
      if (h.strokes != null && !Number.isNaN(Number(h.strokes))) {
        s.add(d.round_id);
        break;
      }
    }
  }
  return s;
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
>(
  details: T[],
  selectedRound: SelectedRoundMeta | null,
  entryCategoryId: string | null | undefined,
  /** `round_scores.round_id` del jugador; desambigúa varias R1 cuando `rounds.category_id` viene vacío en BD. */
  scoreRoundIds?: ReadonlySet<string> | null
): T | null {
  if (!selectedRound) return null;

  const ec = trimId(entryCategoryId);
  const sameNo = (d: { round_no: number }) => d.round_no === selectedRound.round_no;
  const sameDate = (d: { round_date: string | null }) =>
    String(d.round_date ?? "") === String(selectedRound.round_date ?? "");

  // 1) Misma R# + fecha + fila de ronda explícita para la categoría de la jugadora
  if (ec) {
    const byCat = details.find(
      (d) => sameNo(d) && sameDate(d) && trimId(d.category_id) === ec
    );
    if (byCat) return byCat;
  }

  // 2) Misma R# + fecha + ronda donde este jugador ya tiene round_score (típ. varias R1 sin category_id en rounds)
  if (scoreRoundIds && scoreRoundIds.size > 0) {
    const byScoreDate = details.find(
      (d) => sameNo(d) && sameDate(d) && scoreRoundIds.has(d.round_id)
    );
    if (byScoreDate) return byScoreDate;
    const byScore = details.find((d) => sameNo(d) && scoreRoundIds.has(d.round_id));
    if (byScore) return byScore;
  }

  // 3) Desde detalles renderizados: cualquier ronda con captura visible (p. ej. sin pasar scoreRoundIds)
  const fromDetails = collectRoundIdsWithScoreCapture(details);
  if (fromDetails.size > 0) {
    const byCap = details.find(
      (d) => sameNo(d) && sameDate(d) && fromDetails.has(d.round_id)
    );
    if (byCap) return byCap;
    const byCapLoose = details.find((d) => sameNo(d) && fromDetails.has(d.round_id));
    if (byCapLoose) return byCapLoose;
  }

  // 4) La fila `rounds` seleccionada en URL aplica a esta jugadora → mismo round_id
  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) {
    const exact = details.find((d) => d.round_id === selectedRound.id) ?? null;
    if (exact) return exact;
  }

  return (
    details.find(
      (d) =>
        sameNo(d) &&
        sameDate(d) &&
        roundRowAppliesToEntry({ category_id: d.category_id ?? null }, entryCategoryId)
    ) ??
    details.find(
      (d) =>
        sameNo(d) &&
        roundRowAppliesToEntry({ category_id: d.category_id ?? null }, entryCategoryId)
    ) ??
    null
  );
}

/** `rounds.id` efectivo para standings / to par cuando `selectedRound` es de otra categoría o es ambigua. */
export function resolveEffectiveRoundIdForEntry(
  selectedRound: SelectedRoundMeta | null,
  entryCategoryId: string | null | undefined,
  rounds: RoundLike[],
  scoreRoundIds?: ReadonlySet<string> | null
): string | null {
  if (!selectedRound) return null;

  const ec = trimId(entryCategoryId);
  const sameNoDate = (r: RoundLike) =>
    r.round_no === selectedRound.round_no &&
    String(r.round_date ?? "") === String(selectedRound.round_date ?? "");

  if (ec) {
    const byCat = rounds.find(
      (r) => sameNoDate(r) && trimId(r.category_id) === ec
    );
    if (byCat) return byCat.id;
  }

  if (scoreRoundIds && scoreRoundIds.size > 0) {
    const byScoreDate = rounds.find(
      (r) => sameNoDate(r) && scoreRoundIds.has(r.id)
    );
    if (byScoreDate) return byScoreDate.id;
    const byScore = rounds.find(
      (r) => r.round_no === selectedRound.round_no && scoreRoundIds.has(r.id)
    );
    if (byScore) return byScore.id;
  }

  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) return selectedRound.id;

  const hit =
    rounds.find(
      (r) =>
        sameNoDate(r) && roundRowAppliesToEntry(r, entryCategoryId)
    ) ??
    rounds.find(
      (r) =>
        r.round_no === selectedRound.round_no &&
        roundRowAppliesToEntry(r, entryCategoryId)
    );

  return hit?.id ?? selectedRound.id;
}

export function resolvePreviousRoundRowForEntry(
  effectiveRound: RoundLike | null,
  entryCategoryId: string | null | undefined,
  rounds: RoundLike[],
  scoreRoundIds?: ReadonlySet<string> | null
): RoundLike | null {
  if (!effectiveRound || effectiveRound.round_no <= 1) return null;
  const prevNo = effectiveRound.round_no - 1;
  const ec = trimId(entryCategoryId);

  let list = rounds.filter(
    (r) => r.round_no === prevNo && roundRowAppliesToEntry(r, entryCategoryId)
  );

  if (ec) {
    const byCat = list.find((r) => trimId(r.category_id) === ec);
    if (byCat) return byCat;
  }

  if (scoreRoundIds && scoreRoundIds.size > 0) {
    const byScore = list.find((r) => scoreRoundIds.has(r.id));
    if (byScore) return byScore;
  }

  if (list.length === 0) {
    list = rounds.filter((r) => r.round_no === prevNo);
  }

  if (list.length === 0) return null;
  return [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
