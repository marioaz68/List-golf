import type { LeaderboardRow } from "../lib/types";
import { publicLeaderboardCompactPlayerName } from "../lib/utils";

/**
 * Móvil: nombre abreviado. Tablet/desktop (md+): nombre completo del inscrito.
 */
export default function PublicLeaderboardPlayerName({
  row,
  peerRows,
}: {
  row: LeaderboardRow;
  peerRows: LeaderboardRow[];
}) {
  const fullName = row.player_name?.trim() || "—";
  const compactName = publicLeaderboardCompactPlayerName(row, peerRows);

  return (
    <>
      <div
        className="truncate text-[10px] font-semibold leading-tight text-white sm:text-[11px] md:hidden"
        title={fullName}
      >
        {compactName}
      </div>
      <div
        className="hidden break-words text-[10px] font-semibold leading-snug text-white sm:text-[11px] md:block"
        title={fullName}
      >
        {fullName}
      </div>
    </>
  );
}
