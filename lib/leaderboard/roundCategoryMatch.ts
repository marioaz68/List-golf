function trimId(value: unknown) {
  return String(value ?? "").trim();
}

function normWave(value: unknown) {
  const w = trimId(value).toUpperCase();
  return w === "AM" || w === "PM" ? w : "";
}

/** Misma onda (AM/PM); si falta en uno de los lados, no excluye. */
function sameWaveLoose(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const wa = normWave(a);
  const wb = normWave(b);
  if (!wa || !wb) return true;
  return wa === wb;
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
  wave?: string | null;
};

export type RoundLike = SelectedRoundMeta;

/**
 * Detalle hoyo por hoyo para la ronda activa.
 *
 * Prioridad (orden estricto):
 * 1) `round_scores.round_id` coincide con la ronda seleccionada en UI (`selectedRound.id`).
 * 2) Si hay varios scores (p. ej. duplicado A/B), desambiguar por `category_id` del `rounds` row
 *    alineado con la categoría de la inscripción, luego round_no/date/wave.
 * 3) Sin scores: metadata + categoría, y por último la fila de la ronda seleccionada si aplica.
 */
export function resolveDetailForSelectedRound<
  T extends {
    round_id: string;
    round_no: number;
    round_date: string | null;
    category_id?: string | null;
    wave?: string | null;
    is_dq?: boolean;
    to_par?: number | null;
    holes: Array<{ strokes?: number | null }>;
  },
>(
  details: T[],
  selectedRound: SelectedRoundMeta | null,
  entryCategoryId: string | null | undefined,
  /** `round_scores.round_id` donde este jugador tiene fila (fuente de verdad). */
  scoreRoundIds?: ReadonlySet<string> | null
): T | null {
  if (!selectedRound) return null;

  const selId = selectedRound.id;
  const ec = trimId(entryCategoryId);
  const sameNo = (d: { round_no: number }) => d.round_no === selectedRound.round_no;
  const sameDate = (d: { round_date: string | null }) =>
    String(d.round_date ?? "") === String(selectedRound.round_date ?? "");
  const sameWave = (d: { wave?: string | null }) =>
    sameWaveLoose(selectedRound.wave, d.wave);

  // —— 1) PRIORIDAD ABSOLUTA: score anclado al round_id de la UI (si no contradice la categoría de la inscripción) ——
  if (scoreRoundIds && scoreRoundIds.has(selId)) {
    const exact = details.find((d) => d.round_id === selId) ?? null;
    if (exact) {
      const dCat = trimId(exact.category_id);
      if (!ec || !dCat || dCat === ec) {
        return exact;
      }
    }
  }

  const scoredDetails =
    scoreRoundIds && scoreRoundIds.size > 0
      ? details.filter((d) => scoreRoundIds.has(d.round_id))
      : [];

  // —— 2) Varios `round_scores` (p. ej. duplicados A+B): categoría inscripción + metadata ——
  if (scoredDetails.length > 0) {
    if (scoredDetails.length === 1) return scoredDetails[0]!;

    if (ec) {
      const byCatWaveDate = scoredDetails.find(
        (d) =>
          trimId(d.category_id) === ec &&
          sameNo(d) &&
          sameDate(d) &&
          sameWave(d)
      );
      if (byCatWaveDate) return byCatWaveDate;

      const byCatDate = scoredDetails.find(
        (d) => trimId(d.category_id) === ec && sameNo(d) && sameDate(d)
      );
      if (byCatDate) return byCatDate;

      const byCatNo = scoredDetails.find(
        (d) => trimId(d.category_id) === ec && sameNo(d)
      );
      if (byCatNo) return byCatNo;

      const byCat = scoredDetails.find((d) => trimId(d.category_id) === ec);
      if (byCat) return byCat;
    }

    const byMeta = scoredDetails.find(
      (d) => sameNo(d) && sameDate(d) && sameWave(d)
    );
    if (byMeta) return byMeta;

    const byNoDate = scoredDetails.find((d) => sameNo(d) && sameDate(d));
    if (byNoDate) return byNoDate;

    const byNo = scoredDetails.find((d) => sameNo(d));
    if (byNo) return byNo;

    return [...scoredDetails].sort((a, b) =>
      String(a.round_id).localeCompare(String(b.round_id))
    )[0]!;
  }

  // —— 3) Aún no hay scores: no inventar otro round_id; alinear por categoría + metadata ——
  if (ec) {
    const byCat = details.find(
      (d) =>
        sameNo(d) &&
        sameDate(d) &&
        sameWave(d) &&
        trimId(d.category_id) === ec
    );
    if (byCat) return byCat;

    const byCatLoose = details.find(
      (d) => sameNo(d) && sameDate(d) && trimId(d.category_id) === ec
    );
    if (byCatLoose) return byCatLoose;
  }

  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) {
    return details.find((d) => d.round_id === selId) ?? null;
  }

  return (
    details.find(
      (d) =>
        sameNo(d) &&
        sameDate(d) &&
        sameWave(d) &&
        roundRowAppliesToEntry({ category_id: d.category_id ?? null }, entryCategoryId)
    ) ??
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

/**
 * `rounds.id` efectivo para standings / POS cuando la UI apunta a una ronda concreta.
 * Misma prioridad: primero `round_scores.round_id` === selección, luego desambiguar scores.
 */
export function resolveEffectiveRoundIdForEntry(
  selectedRound: SelectedRoundMeta | null,
  entryCategoryId: string | null | undefined,
  rounds: RoundLike[],
  scoreRoundIds?: ReadonlySet<string> | null
): string | null {
  if (!selectedRound) return null;

  const selId = selectedRound.id;
  const ec = trimId(entryCategoryId);
  const sameNoDate = (r: RoundLike) =>
    r.round_no === selectedRound.round_no &&
    String(r.round_date ?? "") === String(selectedRound.round_date ?? "");
  const sameWave = (r: RoundLike) => sameWaveLoose(selectedRound.wave, r.wave);

  if (scoreRoundIds?.has(selId)) {
    const row = rounds.find((r) => r.id === selId) ?? null;
    if (row) {
      const rCat = trimId(row.category_id);
      if (!ec || !rCat || rCat === ec) {
        return selId;
      }
    }
  }

  const scoredRounds =
    scoreRoundIds && scoreRoundIds.size > 0
      ? rounds.filter((r) => scoreRoundIds.has(r.id))
      : [];

  if (scoredRounds.length > 0) {
    if (scoredRounds.length === 1) return scoredRounds[0]!.id;

    if (ec) {
      const byCatWaveDate = scoredRounds.find(
        (r) =>
          trimId(r.category_id) === ec &&
          sameNoDate(r) &&
          sameWave(r)
      );
      if (byCatWaveDate) return byCatWaveDate.id;

      const byCatDate = scoredRounds.find(
        (r) => trimId(r.category_id) === ec && sameNoDate(r)
      );
      if (byCatDate) return byCatDate.id;

      const byCatNo = scoredRounds.find(
        (r) =>
          trimId(r.category_id) === ec &&
          r.round_no === selectedRound.round_no
      );
      if (byCatNo) return byCatNo.id;

      const byCat = scoredRounds.find((r) => trimId(r.category_id) === ec);
      if (byCat) return byCat.id;
    }

    const byMeta = scoredRounds.find((r) => sameNoDate(r) && sameWave(r));
    if (byMeta) return byMeta.id;

    const byNoDate = scoredRounds.find((r) => sameNoDate(r));
    if (byNoDate) return byNoDate.id;

    const byNo = scoredRounds.find((r) => r.round_no === selectedRound.round_no);
    if (byNo) return byNo.id;

    return [...scoredRounds].sort((a, b) =>
      String(a.id).localeCompare(String(b.id))
    )[0]!.id;
  }

  if (ec) {
    const byCat = rounds.find(
      (r) => sameNoDate(r) && sameWave(r) && trimId(r.category_id) === ec
    );
    if (byCat) return byCat.id;

    const byCatLoose = rounds.find(
      (r) => sameNoDate(r) && trimId(r.category_id) === ec
    );
    if (byCatLoose) return byCatLoose.id;
  }

  if (roundRowAppliesToEntry(selectedRound, entryCategoryId)) return selId;

  const hit =
    rounds.find(
      (r) =>
        sameNoDate(r) &&
        sameWave(r) &&
        roundRowAppliesToEntry(r, entryCategoryId)
    ) ??
    rounds.find(
      (r) =>
        sameNoDate(r) && roundRowAppliesToEntry(r, entryCategoryId)
    ) ??
    rounds.find(
      (r) =>
        r.round_no === selectedRound.round_no &&
        roundRowAppliesToEntry(r, entryCategoryId)
    );

  return hit?.id ?? selId;
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

  if (scoreRoundIds && scoreRoundIds.size > 0) {
    const scoredPrev = rounds.filter(
      (r) => r.round_no === prevNo && scoreRoundIds.has(r.id)
    );
    if (scoredPrev.length === 1) return scoredPrev[0]!;
    if (scoredPrev.length > 1) {
      if (ec) {
        const byCat = scoredPrev.find((r) => trimId(r.category_id) === ec);
        if (byCat) return byCat;
      }
      return [...scoredPrev].sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      )[0]!;
    }
  }

  let list = rounds.filter(
    (r) => r.round_no === prevNo && roundRowAppliesToEntry(r, entryCategoryId)
  );

  if (ec) {
    const byCat = list.find((r) => trimId(r.category_id) === ec);
    if (byCat) return byCat;
  }

  if (list.length === 0) {
    list = rounds.filter((r) => r.round_no === prevNo);
  }

  if (list.length === 0) return null;
  return [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}
