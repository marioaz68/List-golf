import {
  resolveDetailForSelectedRound,
  roundRowAppliesToEntry,
  type SelectedRoundMeta,
} from "./roundCategoryMatch";

/** Misma convención que captura pública / `captura/tarjeta`: hoyo en `hole_number` o `hole_no`. */
function holeIndexFromScoreRow(row: {
  hole_number?: unknown;
  hole_no?: unknown;
}): number | null {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 1 || n > 18) return null;
  return n;
}

function countHolesWithStrokes(
  roundScoreId: string,
  holeScoresByRoundScoreId: Map<string, any[]>
): number {
  const rows = holeScoresByRoundScoreId.get(roundScoreId) ?? [];
  let n = 0;
  for (const r of rows) {
    if (holeIndexFromScoreRow(r) == null) continue;
    if (r.strokes == null) continue;
    if (Number.isNaN(Number(r.strokes))) continue;
    n++;
  }
  return n;
}

function pickBestRoundScoreRow(
  cands: any[],
  holeScoresByRoundScoreId: Map<string, any[]>
): any | null {
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  return [...cands].sort((a, b) => {
    const ca = countHolesWithStrokes(a.id, holeScoresByRoundScoreId);
    const cb = countHolesWithStrokes(b.id, holeScoresByRoundScoreId);
    if (cb !== ca) return cb - ca;
    const ha = a.gross_score != null ? 1 : 0;
    const hb = b.gross_score != null ? 1 : 0;
    if (hb !== ha) return hb - ha;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

/**
 * Si hay más de un `round_scores` para la misma ronda, usar el que tenga más hoyos.
 * Si la captura está en otra fila `rounds` con el mismo `round_no` (por categoría), también la encuentra.
 */
function filterScoresForLogicalRound(
  scores: any[],
  targetRoundNo: number,
  roundNoById: Map<string, number>
): any[] {
  return scores.filter((s) => {
    const rid = String(s.round_id ?? "").trim();
    if (!rid) return false;
    const no = roundNoById.get(rid);
    return no === targetRoundNo;
  });
}

function pickRoundScoreRowForRound(
  playerRoundScores: any[],
  round: { id: string; round_no: number; category_id?: string | null },
  entryCategoryId: string | null | undefined,
  holeScoresByRoundScoreId: Map<string, any[]>,
  allRounds: Array<{ id: string; round_no: number; category_id?: string | null }>
): any | null {
  const roundNoById = new Map(
    allRounds.map((r) => [String(r.id), Number(r.round_no)])
  );
  const targetRoundNo = Number(round.round_no);

  const direct = pickBestRoundScoreRow(
    filterScoresForLogicalRound(
      playerRoundScores.filter((s) => s.round_id === round.id),
      targetRoundNo,
      roundNoById
    ),
    holeScoresByRoundScoreId
  );
  if (direct) return direct;

  const cat = String(entryCategoryId ?? "").trim();
  const altRoundIds = allRounds
    .filter((r) => r.round_no === targetRoundNo && r.id !== round.id)
    .filter((r) => {
      const rc = String(r.category_id ?? "").trim();
      if (!cat) return true;
      if (!rc) return true;
      return rc === cat;
    })
    .map((r) => r.id);

  const altCands = filterScoresForLogicalRound(
    playerRoundScores.filter((s) => altRoundIds.includes(String(s.round_id))),
    targetRoundNo,
    roundNoById
  );

  const fromCategoryAlt = pickBestRoundScoreRow(
    altCands,
    holeScoresByRoundScoreId
  );
  return fromCategoryAlt;
}

type RoundDetailLike = {
  round_id: string;
  round_no: number;
  category_id?: string | null;
  gross_score?: number | null;
  to_par?: number | null;
  is_dq?: boolean;
};

/** Acumulado por `round_no` en la categoría del inscrito (sin duplicar otras categorías). */
function sumCumulativeTotals(
  details: RoundDetailLike[],
  entryCategoryId: string | null | undefined,
  maxRoundNo: number | null
): { totalGross: number | null; totalToPar: number | null } {
  const byRoundNo = new Map<number, RoundDetailLike>();

  for (const detail of details) {
    if (detail.is_dq) continue;
    if (!roundRowAppliesToEntry({ category_id: detail.category_id }, entryCategoryId)) {
      continue;
    }
    if (maxRoundNo != null && detail.round_no > maxRoundNo) continue;

    const existing = byRoundNo.get(detail.round_no);
    if (!existing) {
      byRoundNo.set(detail.round_no, detail);
      continue;
    }

    const ec = String(entryCategoryId ?? "").trim();
    const dCat = String(detail.category_id ?? "").trim();
    const exCat = String(existing.category_id ?? "").trim();
    if (ec && dCat === ec && exCat !== ec) {
      byRoundNo.set(detail.round_no, detail);
    }
  }

  let totalGross = 0;
  let totalToPar = 0;
  let hasGross = false;
  let hasToPar = false;

  for (const detail of byRoundNo.values()) {
    if (detail.gross_score != null && !Number.isNaN(Number(detail.gross_score))) {
      totalGross += Number(detail.gross_score);
      hasGross = true;
    }
    if (detail.to_par != null && !Number.isNaN(Number(detail.to_par))) {
      totalToPar += Number(detail.to_par);
      hasToPar = true;
    }
  }

  return {
    totalGross: hasGross ? totalGross : null,
    totalToPar: hasToPar ? totalToPar : null,
  };
}

export function buildLiveLeaderboard({
  filteredEntries,
  rounds,
  roundScores,
  holeScoresByRoundScoreId,
  parByHole,
  selectedRound,
  normalizeClubLabel,
  isDQScore,
  isDQStatus,
  subtotal,
  getPlayerCode,
}: any) {
  return filteredEntries.map((entry: any, index: number) => {
    const playerName = [
      entry.player.first_name ?? "",
      entry.player.last_name ?? "",
    ]
      .join(" ")
      .trim();

    const fallbackClub = (entry.player.club ?? "").trim() || null;
    const clubLabel = normalizeClubLabel(entry.player.clubs) ?? fallbackClub;
    const clubIdRaw = entry.player?.club_id;
    const club_id =
      typeof clubIdRaw === "string" && clubIdRaw.trim()
        ? clubIdRaw.trim()
        : null;

    const playerRoundScores = roundScores.filter(
      (score: any) => score.player_id === entry.player_id
    );

    const entryRounds = rounds.filter((round: any) =>
      roundRowAppliesToEntry(round, entry.category_id)
    );

    const maxRoundNo =
      selectedRound != null && Number.isFinite(Number(selectedRound.round_no))
        ? Number(selectedRound.round_no)
        : null;

    const roundsSummary = entryRounds.map((round: any) => {
      const found = pickRoundScoreRowForRound(
        playerRoundScores,
        round,
        entry.category_id,
        holeScoresByRoundScoreId,
        rounds
      );

      const roundIsDQ =
        isDQScore(found?.gross_score ?? null) || isDQStatus(entry.status);

      return {
        round_id: round.id,
        round_no: round.round_no,
        gross_score: roundIsDQ ? null : found?.gross_score ?? null,
        is_dq: roundIsDQ,
      };
    });

    const details = entryRounds.map((round: any) => {
      const score = pickRoundScoreRowForRound(
        playerRoundScores,
        round,
        entry.category_id,
        holeScoresByRoundScoreId,
        rounds
      );

      const roundHoleRows = score
        ? [...(holeScoresByRoundScoreId.get(score.id) ?? [])].sort(
            (a: any, b: any) =>
              (holeIndexFromScoreRow(a) ?? 99) - (holeIndexFromScoreRow(b) ?? 99)
          )
        : [];

      const holes = Array.from({ length: 18 }, (_, i) => {
        const holeNumber = i + 1;
        const found = roundHoleRows.find(
          (row: any) => holeIndexFromScoreRow(row) === holeNumber
        );

        return {
          hole_number: holeNumber,
          par: parByHole.get(holeNumber) ?? null,
          strokes: found && found.strokes != null ? Number(found.strokes) : null,
        };
      });

      const front = subtotal(holes, 0, 9, "strokes");
      const back = subtotal(holes, 9, 18, "strokes");
      const total = subtotal(holes, 0, 18, "strokes");

      const playedHoles = holes.filter((h: any) => h.strokes != null);

      const parPlayed =
        playedHoles.length > 0
          ? playedHoles.reduce(
              (acc: number, h: any) => acc + Number(h.par ?? 0),
              0
            )
          : null;

      const grossPlayed =
        playedHoles.length > 0
          ? playedHoles.reduce(
              (acc: number, h: any) => acc + Number(h.strokes ?? 0),
              0
            )
          : null;

      const roundIsDQ =
        isDQScore(score?.gross_score ?? null) || isDQStatus(entry.status);

      const gross = roundIsDQ ? null : score?.gross_score ?? grossPlayed ?? null;

      const toPar =
        roundIsDQ
          ? null
          : grossPlayed != null && parPlayed != null
            ? grossPlayed - parPlayed
            : null;

      return {
        round_id: round.id,
        round_no: round.round_no,
        round_date: round.round_date,
        category_id: round.category_id ?? null,
        wave: round.wave ?? null,
        gross_score: gross,
        to_par: toPar,
        out_score: front,
        in_score: back,
        total_score: total,
        holes,
        is_dq: roundIsDQ,
      };
    });

    const rowIsDQ =
      isDQStatus(entry.status) || details.some((detail: any) => detail.is_dq);

    const nonDqDetails = details.filter((detail: any) => !detail.is_dq);

    const { totalGross: totalGrossOrNull, totalToPar: totalToParOrNull } = rowIsDQ
      ? { totalGross: null, totalToPar: null }
      : sumCumulativeTotals(nonDqDetails, entry.category_id, maxRoundNo);

    const selectedMeta: SelectedRoundMeta | null = selectedRound
      ? {
          id: selectedRound.id,
          round_no: selectedRound.round_no,
          round_date: selectedRound.round_date ?? null,
          category_id: selectedRound.category_id ?? null,
          wave: selectedRound.wave ?? null,
        }
      : null;

    const scoreRoundIds = new Set<string>(
      playerRoundScores
        .map((x: any) => String(x.round_id ?? "").trim())
        .filter(Boolean)
    );

    const selectedRoundDetail = resolveDetailForSelectedRound(
      details,
      selectedMeta,
      entry.category_id,
      scoreRoundIds
    );

    return {
      entry_id: entry.id,
      player_id: entry.player_id,
      player_name: playerName || "Jugador sin nombre",
      player_code: getPlayerCode(index),
      club_id,
      club_label: clubLabel,
      category_id: entry.category_id,
      category_code: entry.category?.code ?? null,
      entry_status: entry.status ?? null,
      is_disqualified: rowIsDQ,
      total_to_par: totalToParOrNull,
      selected_round_to_par: selectedRoundDetail?.is_dq
        ? null
        : selectedRoundDetail?.to_par ?? null,
      total_gross: totalGrossOrNull,
      selected_round_position: null,
      previous_round_position: null,
      move_vs_previous: null,
      selected_round_position_category: null,
      previous_round_position_category: null,
      move_vs_previous_category: null,
      rounds: roundsSummary,
      details,
      standing_by_round: [],
      standing_by_round_category: [],
      hasScores:
        details.some(
          (detail: any) =>
            detail.gross_score != null ||
            detail.holes.some((h: any) => h.strokes != null)
        ) || rowIsDQ,
    };
  });
}