export function buildLiveLeaderboard({
  filteredEntries,
  rounds,
  roundScores,
  holeScoresByRoundScoreId,
  parByHole,
  lockedScorecardMap,
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

    const playerRoundScores = roundScores.filter(
      (score: any) => score.player_id === entry.player_id
    );

    const roundsSummary = rounds.map((round: any) => {
      const found =
        playerRoundScores.find((score: any) => score.round_id === round.id) ??
        null;

      const roundIsDQ =
        isDQScore(found?.gross_score ?? null) || isDQStatus(entry.status);

      return {
        round_id: round.id,
        round_no: round.round_no,
        gross_score: roundIsDQ ? null : found?.gross_score ?? null,
        is_dq: roundIsDQ,
      };
    });

    const details = rounds.map((round: any) => {
      const isLockedRound = lockedScorecardMap.has(`${entry.id}_${round.id}`);

      const score = isLockedRound
        ? playerRoundScores.find((row: any) => row.round_id === round.id) ?? null
        : null;

      const roundHoleRows = score
        ? [...(holeScoresByRoundScoreId.get(score.id) ?? [])].sort(
            (a: any, b: any) => Number(a.hole_number) - Number(b.hole_number)
          )
        : [];

      const holes = Array.from({ length: 18 }, (_, i) => {
        const holeNumber = i + 1;
        const found = roundHoleRows.find(
          (row: any) => Number(row.hole_number) === holeNumber
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

    const totalGross = nonDqDetails.reduce((acc: number, detail: any) => {
      return acc + Number(detail.gross_score ?? 0);
    }, 0);

    const totalGrossOrNull = rowIsDQ
      ? null
      : nonDqDetails.some((detail: any) => detail.gross_score != null)
        ? totalGross
        : null;

    const totalToPar = nonDqDetails.reduce((acc: number, detail: any) => {
      return acc + Number(detail.to_par ?? 0);
    }, 0);

    const totalToParOrNull = rowIsDQ
      ? null
      : nonDqDetails.some((detail: any) => detail.to_par != null)
        ? totalToPar
        : null;

    const selectedRoundDetail =
      details.find((detail: any) => detail.round_id === selectedRound?.id) ??
      null;

    return {
      entry_id: entry.id,
      player_id: entry.player_id,
      player_name: playerName || "Jugador sin nombre",
      player_code: getPlayerCode(index),
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