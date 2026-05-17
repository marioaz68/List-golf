import {
  publicLeaderboardScoreColumnHeader,
  publicLeaderboardScoreColumnNos,
  roundDetailForPublicColumn,
  scoreCellClass,
  scoreColClass,
} from "../lib/publicLeaderboardColumns";
import type { LeaderboardRow } from "../lib/types";
import type { SelectedRoundMeta } from "../lib/utils";

type Props = {
  selectedRound: SelectedRoundMeta | null | undefined;
};

export function PublicLeaderboardRoundScoreHeaders({ selectedRound }: Props) {
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
}: Props & { row: LeaderboardRow }) {
  const columnNos = publicLeaderboardScoreColumnNos(selectedRound);

  return (
    <>
      {columnNos.map((roundNo) => (
        <td key={roundNo} className={scoreCellClass}>
          {roundDetailForPublicColumn(row, roundNo)}
        </td>
      ))}
    </>
  );
}
