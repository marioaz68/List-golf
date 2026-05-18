import {
  publicLeaderboardScoreColumnHeader,
  publicLeaderboardScoreColumnNos,
  roundDetailForPublicColumn,
  scoreCellClass,
  scoreColClass,
} from "../lib/publicLeaderboardColumns";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import type { LeaderboardRow } from "../lib/types";
import type { SelectedRoundMeta } from "../lib/utils";

type Props = {
  selectedRound: SelectedRoundMeta | null | undefined;
  rulesMap: Map<string, CategoryCompetitionRule>;
  handicapByPlayerId: Map<string, number | null>;
  strokeIndexByHole?: StrokeIndexByHole;
};

export function PublicLeaderboardRoundScoreHeaders({
  selectedRound,
}: Pick<Props, "selectedRound">) {
  const columnNos = publicLeaderboardScoreColumnNos(selectedRound);
  const selectedNo = selectedRound?.round_no ?? 1;

  return (
    <>
      {columnNos.map((roundNo) => (
        <th
          key={roundNo}
          className={scoreColClass}
          title={
            roundNo === selectedNo
              ? `Ronda ${roundNo} (seleccionada)`
              : `Ronda ${roundNo}`
          }
        >
          {publicLeaderboardScoreColumnHeader(roundNo, selectedNo)}
        </th>
      ))}
    </>
  );
}

export function PublicLeaderboardRoundScoreCells({
  row,
  selectedRound,
  rulesMap,
  handicapByPlayerId,
  strokeIndexByHole,
}: Props & { row: LeaderboardRow }) {
  const columnNos = publicLeaderboardScoreColumnNos(selectedRound);

  return (
    <>
      {columnNos.map((roundNo) => (
        <td key={roundNo} className={scoreCellClass}>
          {roundDetailForPublicColumn(
            row,
            roundNo,
            rulesMap,
            handicapByPlayerId,
            strokeIndexByHole
          )}
        </td>
      ))}
    </>
  );
}
