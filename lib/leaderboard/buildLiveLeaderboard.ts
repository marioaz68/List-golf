// /lib/leaderboard/buildLiveLeaderboard.ts

import type {
  LeaderboardRow,
} from "@/app/torneos/[id]/page"; // ajustamos luego si quieres

export function buildLiveLeaderboard({
  filteredEntries,
  rounds,
  roundScores,
  holeScores,
  parByHole,
  lockedScorecardMap,
}: any): LeaderboardRow[] {

  function isDQScore(value: number | null | undefined) {
    return value != null && Number(value) >= 400;
  }

  function isDQStatus(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase() === "dq";
  }

  function subtotal(holes: any[], start: number, end: number, field: "par" | "strokes") {
    const segment = holes.slice(start, end);
    const hasAny = segment.some((hole) => hole[field] != null);
    if (!hasAny) return null;
    return segment.reduce((acc, hole) => acc + Number(hole[field] ?? 0), 0);
  }

  // 🔥 BASE (COPIA EXACTA)
  const leaderboardBase: LeaderboardRow[] = filteredEntries.map((entry: any, index: number) => {
    const playerRoundScores = roundScores.filter(
      (score: any) => score.player_id === entry.player_id
    );

    const details = rounds.map((round: any) => {
      const isLockedRound = lockedScorecardMap.has(`${entry.id}_${round.id}`);

      const score = isLockedRound
        ? playerRoundScores.find((row: any) => row.round_id === round.id) ?? null
        : null;

      const holes = Array.from({ length: 18 }, (_, i) => {
        const holeNumber = i + 1;
        return {
          hole_number: holeNumber,
          par: parByHole.get(holeNumber) ?? null,
          strokes: null,
        };
      });

      return {
        round_id: round.id,
        round_no: round.round_no,
        round_date: round.round_date,
        gross_score: score?.gross_score ?? null,
        to_par: null,
        out_score: null,
        in_score: null,
        total_score: null,
        holes,
        is_dq: false,
      };
    });

    return {
      entry_id: entry.id,
      player_id: entry.player_id,
      player_name: "TEMP",
      player_code: "TEMP",
      club_label: null,
      category_id: entry.category_id,
      category_code: null,
      entry_status: entry.status ?? null,
      is_disqualified: false,
      total_to_par: null,
      selected_round_to_par: null,
      total_gross: null,
      selected_round_position: null,
      previous_round_position: null,
      move_vs_previous: null,
      selected_round_position_category: null,
      previous_round_position_category: null,
      move_vs_previous_category: null,
      rounds: [],
      details,
      standing_by_round: [],
      standing_by_round_category: [],
      hasScores: true,
    };
  });

  // ⚠️ por ahora regresamos directo
  return leaderboardBase;
}