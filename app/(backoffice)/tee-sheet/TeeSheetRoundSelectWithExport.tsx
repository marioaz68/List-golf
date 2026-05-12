"use client";

import { useState } from "react";

export type TeeSheetRoundOption = { id: string; label: string };

type Props = {
  tournamentId: string;
  rounds: TeeSheetRoundOption[];
  defaultRoundId: string;
  selectClassName: string;
  linkClassName: string;
};

export default function TeeSheetRoundSelectWithExport({
  tournamentId,
  rounds,
  defaultRoundId,
  selectClassName,
  linkClassName,
}: Props) {
  const [roundId, setRoundId] = useState(defaultRoundId);

  const exportHref = `/api/tee-sheet/export?tournament_id=${encodeURIComponent(tournamentId)}&round_id=${encodeURIComponent(roundId)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        name="round_id"
        value={roundId}
        onChange={(e) => setRoundId(e.target.value)}
        className={selectClassName}
      >
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <a href={exportHref} className={linkClassName}>
        Exportar Excel
      </a>
    </div>
  );
}
