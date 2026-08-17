"use client";

import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import LiveBracketView from "@/app/torneos/[id]/cuadro-vivo/LiveBracketView";

type ExistingMatch = {
  id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string | null;
  result_text: string | null;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
  existingMatches: ExistingMatch[];
  bracketMainPairs: number | null;
  currency: string;
  potPercent: number | null;
};

export default function AuctionBracketTvClient({
  tournamentId,
  tournamentName,
  teams,
  existingMatches,
  bracketMainPairs,
  currency,
  potPercent,
}: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#07090d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(34,211,238,0.08),_transparent_58%)]" />

      <header className="relative z-10 flex shrink-0 items-end justify-between gap-4 px-5 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.35em] text-cyan-300">
            Cuadro TV · subasta
          </div>
          <div className="mt-1 max-w-5xl truncate text-xl font-bold text-white md:text-2xl">
            {tournamentName}
          </div>
        </div>
        <a
          href={`/matchplay/auction/show?tournament_id=${tournamentId}`}
          className="rounded-xl border-2 border-white/40 bg-white/10 px-5 py-2.5 text-lg font-black text-white hover:bg-white/20"
        >
          ← Volver a subasta
        </a>
      </header>

      <main className="relative z-10 min-h-0 flex-1">
        <LiveBracketView
          tournamentId={tournamentId}
          tournamentName={tournamentName}
          teams={teams}
          existingMatches={existingMatches}
          bracketMainPairs={bracketMainPairs}
          currency={currency}
          potPercent={potPercent}
          prizeShares={[]}
          variant="auction-tv"
        />
      </main>
    </div>
  );
}
