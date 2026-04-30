export function applyStandings({
  leaderboardBase,
  rounds,
  selectedRound,
  holesPlayedCount,
}: any) {
  const standingsByRound = new Map();
  const standingsByRoundCategory = new Map();

  for (let i = 0; i < rounds.length; i += 1) {
    const roundsUpToCurrent = rounds.slice(0, i + 1);
    const roundIdsUpToCurrent = roundsUpToCurrent.map((r: any) => r.id);
    const round = rounds[i];

    const currentRows = leaderboardBase.map((row: any) => {
      let gross = 0;
      let par = 0;
      let holesPlayed = 0;
      let playedRounds = 0;
      let dqFound = false;

      for (const detail of row.details) {
        if (!roundIdsUpToCurrent.includes(detail.round_id)) continue;

        const roundHasAnyHole = detail.holes.some(
          (hole: any) => hole.strokes != null
        );

        const roundHasAnyData =
          roundHasAnyHole || detail.is_dq || detail.gross_score != null;

        if (roundHasAnyData) {
          playedRounds += 1;
        }

        if (detail.is_dq) {
          dqFound = true;
          continue;
        }

        for (const hole of detail.holes) {
          if (hole.strokes != null) {
            gross += Number(hole.strokes);
            par += Number(hole.par ?? 0);
            holesPlayed += 1;
          }
        }
      }

      const rowIsDQ = row.is_disqualified || dqFound;
      const toPar = rowIsDQ ? null : holesPlayed > 0 ? gross - par : null;
      const grossValue = rowIsDQ ? null : holesPlayed > 0 ? gross : null;

      return {
        player_id: row.player_id,
        category_id: row.category_id,
        is_dq: rowIsDQ,
        gross: grossValue,
        to_par: toPar,
        played_rounds: playedRounds,
        holes_played: rowIsDQ ? 0 : holesPlayed,
      };
    });

    const sortStandingRows = (rows: any[]) =>
      [...rows].sort((a, b) => {
        if (a.is_dq && !b.is_dq) return 1;
        if (!a.is_dq && b.is_dq) return -1;

        if (a.to_par != null && b.to_par != null) {
          if (a.to_par !== b.to_par) return a.to_par - b.to_par;
        } else if (a.to_par != null) {
          return -1;
        } else if (b.to_par != null) {
          return 1;
        }

        if (a.holes_played !== b.holes_played) {
          return b.holes_played - a.holes_played;
        }

        if (a.gross != null && b.gross != null) {
          if (a.gross !== b.gross) return a.gross - b.gross;
        } else if (a.gross != null) {
          return -1;
        } else if (b.gross != null) {
          return 1;
        }

        return 0;
      });

    const rankedGeneral = sortStandingRows(currentRows);

    const generalMap = new Map();
    let currentPosGeneral = 0;
    let prevKeyGeneral = "";

    rankedGeneral.forEach((item: any, idx: number) => {
      if (item.is_dq) {
        generalMap.set(item.player_id, {
          round_id: round.id,
          round_no: round.round_no,
          pos: null,
          to_par: null,
          gross: null,
          played_rounds: item.played_rounds,
        });
        return;
      }

      const key = `${item.to_par ?? "x"}|${item.holes_played}|${
        item.gross ?? "x"
      }|${item.played_rounds}`;

      if (idx === 0 || key !== prevKeyGeneral) {
        currentPosGeneral = idx + 1;
        prevKeyGeneral = key;
      }

      generalMap.set(item.player_id, {
        round_id: round.id,
        round_no: round.round_no,
        pos: item.to_par != null ? currentPosGeneral : null,
        to_par: item.to_par,
        gross: item.gross,
        played_rounds: item.played_rounds,
      });
    });

    standingsByRound.set(round.id, generalMap);

    const categoryMap = new Map();
    const groupedByCategory = new Map();

    for (const item of currentRows) {
      const key = item.category_id ?? "__no_category__";
      const bucket = groupedByCategory.get(key) ?? [];
      bucket.push(item);
      groupedByCategory.set(key, bucket);
    }

    for (const [categoryKey, rowsInCategory] of groupedByCategory.entries()) {
      const rankedCategory = sortStandingRows(rowsInCategory);
      const categoryStandingMap = new Map();

      let currentPosCategory = 0;
      let prevKeyCategory = "";

      rankedCategory.forEach((item: any, idx: number) => {
        if (item.is_dq) {
          categoryStandingMap.set(item.player_id, {
            round_id: round.id,
            round_no: round.round_no,
            pos: null,
            to_par: null,
            gross: null,
            played_rounds: item.played_rounds,
          });
          return;
        }

        const key = `${item.to_par ?? "x"}|${item.holes_played}|${
          item.gross ?? "x"
        }|${item.played_rounds}`;

        if (idx === 0 || key !== prevKeyCategory) {
          currentPosCategory = idx + 1;
          prevKeyCategory = key;
        }

        categoryStandingMap.set(item.player_id, {
          round_id: round.id,
          round_no: round.round_no,
          pos: item.to_par != null ? currentPosCategory : null,
          to_par: item.to_par,
          gross: item.gross,
          played_rounds: item.played_rounds,
        });
      });

      categoryMap.set(categoryKey, categoryStandingMap);
    }

    standingsByRoundCategory.set(round.id, categoryMap);
  }

  const leaderboardWithStandings = leaderboardBase.map((row: any) => {
    const standingByRound = rounds.map((round: any) => {
      const snap = standingsByRound.get(round.id)?.get(row.player_id);

      return (
        snap ?? {
          round_id: round.id,
          round_no: round.round_no,
          pos: null,
          to_par: null,
          gross: null,
          played_rounds: 0,
        }
      );
    });

    const standingByRoundCategory = rounds.map((round: any) => {
      const categoryKey = row.category_id ?? "__no_category__";

      const snap = standingsByRoundCategory
        .get(round.id)
        ?.get(categoryKey)
        ?.get(row.player_id);

      return (
        snap ?? {
          round_id: round.id,
          round_no: round.round_no,
          pos: null,
          to_par: null,
          gross: null,
          played_rounds: 0,
        }
      );
    });

    const selectedStanding =
      standingByRound.find((s: any) => s.round_id === selectedRound?.id) ?? null;

    const previousStanding =
      selectedRound != null
        ? standingByRound.find(
            (s: any) => s.round_no === selectedRound.round_no - 1
          ) ?? null
        : null;

    const moveVsPrevious =
      selectedStanding?.pos != null && previousStanding?.pos != null
        ? previousStanding.pos - selectedStanding.pos
        : null;

    const selectedStandingCategory =
      standingByRoundCategory.find(
        (s: any) => s.round_id === selectedRound?.id
      ) ?? null;

    const previousStandingCategory =
      selectedRound != null
        ? standingByRoundCategory.find(
            (s: any) => s.round_no === selectedRound.round_no - 1
          ) ?? null
        : null;

    const moveVsPreviousCategory =
      selectedStandingCategory?.pos != null &&
      previousStandingCategory?.pos != null
        ? previousStandingCategory.pos - selectedStandingCategory.pos
        : null;

    return {
      ...row,
      standing_by_round: standingByRound,
      standing_by_round_category: standingByRoundCategory,
      selected_round_position: row.is_disqualified
        ? null
        : selectedStanding?.pos ?? null,
      previous_round_position: row.is_disqualified
        ? null
        : previousStanding?.pos ?? null,
      move_vs_previous: row.is_disqualified ? null : moveVsPrevious,
      selected_round_position_category: row.is_disqualified
        ? null
        : selectedStandingCategory?.pos ?? null,
      previous_round_position_category: row.is_disqualified
        ? null
        : previousStandingCategory?.pos ?? null,
      move_vs_previous_category: row.is_disqualified
        ? null
        : moveVsPreviousCategory,
    };
  });

  return [...leaderboardWithStandings].sort((a: any, b: any) => {
    if (a.is_disqualified && !b.is_disqualified) return 1;
    if (!a.is_disqualified && b.is_disqualified) return -1;

    if (a.total_to_par != null && b.total_to_par != null) {
      if (a.total_to_par !== b.total_to_par) {
        return a.total_to_par - b.total_to_par;
      }
    } else if (a.total_to_par != null) {
      return -1;
    } else if (b.total_to_par != null) {
      return 1;
    }

    const aHoles = a.is_disqualified ? 0 : holesPlayedCount(a.details);
    const bHoles = b.is_disqualified ? 0 : holesPlayedCount(b.details);

    if (aHoles !== bHoles) {
      return bHoles - aHoles;
    }

    if (a.total_gross != null && b.total_gross != null) {
      if (a.total_gross !== b.total_gross) {
        return a.total_gross - b.total_gross;
      }
    } else if (a.total_gross != null) {
      return -1;
    } else if (b.total_gross != null) {
      return 1;
    }

    return String(a.player_name ?? "").localeCompare(
      String(b.player_name ?? ""),
      "es"
    );
  });
}