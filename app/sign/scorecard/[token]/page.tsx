import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import {
  buildScorecardSummaryAction,
  getSignatureRequestByTokenAction,
} from "@/app/(backoffice)/scorecards/actions";
import ScorecardPreview from "@/components/scorecards/ScorecardPreview";
import RemoteSignForm from "@/components/scorecards/RemoteSignForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

type HoleScoreRow = {
  id: string;
  round_score_id: string | null;
  entry_id: string | null;
  round_id: string | null;
  hole_no: number | null;
  hole_number: number | null;
  strokes: number | null;
  created_at: string | null;
};

type PlayerRow = {
  first_name: string | null;
  last_name: string | null;
};

function fullName(player: PlayerRow | null) {
  if (!player) return "Jugador";
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Jugador";
}

export default async function RemoteScorecardSignPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  let request;
  try {
    request = await getSignatureRequestByTokenAction({ token });
  } catch {
    notFound();
  }

  const { data: scorecard } = await supabase
    .from("scorecards")
    .select("*")
    .eq("id", request.scorecard_id)
    .single();

  const [{ data: holeScoresData }, { data: playerData }] =
    await Promise.all([
      supabase
        .from("hole_scores")
        .select(
          "id, round_score_id, entry_id, round_id, hole_no, hole_number, strokes, created_at"
        )
        .eq("entry_id", scorecard.entry_id)
        .eq("round_id", scorecard.round_id)
        .order("hole_number", { ascending: true }),

      supabase
        .from("tournament_entries")
        .select("player:players(first_name, last_name)")
        .eq("id", scorecard.entry_id)
        .single(),
    ]);

  const player =
    Array.isArray((playerData as any)?.player)
      ? ((playerData as any).player[0] ?? null)
      : ((playerData as any)?.player ?? null);

  const holeScores = (holeScoresData ?? []) as HoleScoreRow[];

  const summary = await buildScorecardSummaryAction({
    scorecard_id: scorecard.id,
    entry_id: scorecard.entry_id,
    round_id: scorecard.round_id,
    tournament_id: scorecard.tournament_id,
    status: scorecard.status,
    holeScores,
    is_disqualified: scorecard.is_disqualified,
    is_withdrawn: scorecard.is_withdrawn,
    marker_signed_at: scorecard.marker_signed_at,
    player_signed_at: scorecard.player_signed_at,
    witness_signed_at: scorecard.witness_signed_at,
    locked_at: scorecard.locked_at,
  });

  const roleLabel =
    request.role === "player"
      ? "Jugador"
      : request.role === "marker"
      ? "Marcador"
      : "Testigo";

  return (
    <main className="mx-auto max-w-xl space-y-4 p-3">

      {/* HEADER COMPACTO */}
      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">
          {fullName(player)}
        </div>

        <div className="text-xs text-slate-500">
          Rol: {roleLabel}
        </div>
      </section>

      {/* TARJETA */}
      <ScorecardPreview
        title={`Tarjeta · ${fullName(player)}`}
        status={summary.status}
        holes={summary.holes}
        totals={summary.totals}
        player_signed_at={summary.player_signed_at}
        marker_signed_at={summary.marker_signed_at}
        witness_signed_at={summary.witness_signed_at}
        locked_at={summary.locked_at}
      />

      {/* FIRMA */}
      <RemoteSignForm
        token={token}
        scorecard_id={scorecard.id}
        current_status={scorecard.status}
        player_signed_at={scorecard.player_signed_at}
        marker_signed_at={scorecard.marker_signed_at}
        witness_signed_at={scorecard.witness_signed_at}
        locked_at={scorecard.locked_at}
        default_name={request.requested_name ?? ""}
        default_phone={request.requested_phone ?? ""}
        role={request.role}
        holes_played={summary.totals.holesPlayed}
      />
    </main>
  );
}