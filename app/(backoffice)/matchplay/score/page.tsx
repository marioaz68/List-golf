import Link from "next/link";
import { redirect } from "next/navigation";
import { loadMatchForScoring } from "@/lib/matchplay/loadMatchForScoring";
import MatchPlayLowHighScorePanel from "../MatchPlayLowHighScorePanel";

export const dynamic = "force-dynamic";

type SP = {
  tournament_id?: string;
  match_id?: string;
  score_status?: string;
  score_message?: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  textDecoration: "none",
};

export default async function MatchPlayScorePage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";
  const matchId = typeof sp.match_id === "string" ? sp.match_id.trim() : "";

  if (!tournamentId || !matchId) {
    redirect("/matchplay");
  }

  const match = await loadMatchForScoring(matchId);

  if (!match) {
    return (
      <div className="space-y-3 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Captura match play</h1>
        <p className="text-sm text-amber-200">
          Partido no encontrado o el torneo no usa formato Bola Baja + Bola Alta.
        </p>
        <Link
          href={`/matchplay?tournament_id=${tournamentId}`}
          style={buttonStyle}
        >
          Volver al cuadro
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-white">
            Bola Baja + Bola Alta
          </h1>
          <p className="text-[12px] text-slate-400">
            Ronda {match.round_no} · Partido {match.position_no} ·{" "}
            {match.top_label} vs {match.bottom_label}
          </p>
        </div>
        <Link
          href={`/matchplay?tournament_id=${tournamentId}`}
          style={buttonStyle}
        >
          ← Cuadro
        </Link>
      </div>

      <MatchPlayLowHighScorePanel
        match={match}
        flashStatus={sp.score_status}
        flashMessage={sp.score_message}
      />
    </div>
  );
}
