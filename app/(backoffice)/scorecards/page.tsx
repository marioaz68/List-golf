import { createClient } from "@/utils/supabase/server";
import {
  buildScorecardSummaryAction,
  createSignatureRequestAction,
  getOrCreateScorecardAction,
} from "./actions";

import ScorecardPreview from "@/components/scorecards/ScorecardPreview";
import MarkerSignForm from "@/components/scorecards/MarkerSignForm";
import PlayerSignForm from "@/components/scorecards/PlayerSignForm";
import WitnessSignForm from "@/components/scorecards/WitnessSignForm"; // 👈 NUEVO

export const dynamic = "force-dynamic";

const REAL_TOURNAMENT_ID = "eb492f19-b690-41f2-9adb-e31eb1a37a05";
const REAL_ROUND_ID = "49b1548d-6085-4fea-8fee-ebbeccc50ed3";
const REAL_ENTRY_ID = "456d6e4f-0f83-429c-8533-b376f93001f1";

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

type SignatureRow = {
  id: string;
  scorecard_id: string;
  role: "player" | "marker" | "witness" | "staff";
  signature_type: "tap" | "typed_name" | "drawn" | "otp";
  signer_name: string;
  signer_player_id: string | null;
  signer_phone: string | null;
  signed_text: string | null;
  signature_payload: string | null;
  signed_at: string;
  created_at: string;
};

type PlayerRow = {
  first_name: string | null;
  last_name: string | null;
};

function fullName(player: PlayerRow | null) {
  if (!player) return "Jugador";
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "Jugador";
}

export default async function ScorecardsTestPage() {
  const supabase = await createClient();

  const scorecard = await getOrCreateScorecardAction({
    tournament_id: REAL_TOURNAMENT_ID,
    round_id: REAL_ROUND_ID,
    entry_id: REAL_ENTRY_ID,
  });

  const [
    { data: holeScoresData, error: holeScoresError },
    { data: playerData, error: playerError },
    { data: signaturesData, error: signaturesError },
  ] = await Promise.all([
    supabase
      .from("hole_scores")
      .select(
        "id, round_score_id, entry_id, round_id, hole_no, hole_number, strokes, created_at"
      )
      .eq("entry_id", REAL_ENTRY_ID)
      .eq("round_id", REAL_ROUND_ID)
      .order("hole_number", { ascending: true }),

    supabase
      .from("tournament_entries")
      .select("player:players(first_name, last_name)")
      .eq("id", REAL_ENTRY_ID)
      .single(),

    supabase
      .from("scorecard_signatures")
      .select("*")
      .eq("scorecard_id", scorecard.id)
      .order("created_at", { ascending: false }),
  ]);

  if (holeScoresError) {
    throw new Error(`Error consultando hole_scores: ${holeScoresError.message}`);
  }

  if (playerError) {
    throw new Error(`Error consultando jugador: ${playerError.message}`);
  }

  if (signaturesError) {
    throw new Error(`Error consultando firmas: ${signaturesError.message}`);
  }

  const player =
    Array.isArray((playerData as any)?.player)
      ? ((playerData as any).player[0] ?? null)
      : ((playerData as any)?.player ?? null);

  const holeScores = (holeScoresData ?? []) as HoleScoreRow[];
  const signatures = (signaturesData ?? []) as SignatureRow[];

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

  let remotePlayerRequest: Awaited<
    ReturnType<typeof createSignatureRequestAction>
  > | null = null;

  if (!scorecard.player_signed_at && !scorecard.locked_at) {
    remotePlayerRequest = await createSignatureRequestAction({
      scorecard_id: scorecard.id,
      role: "player",
      requested_name: fullName(player),
      expires_in_hours: 24,
    });
  }

  const remotePath = remotePlayerRequest
    ? `/sign/scorecard/${remotePlayerRequest.token}`
    : null;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const remoteFullUrl = remotePath ? `${baseUrl}${remotePath}` : null;

  return (
    <main className="space-y-6 p-6 text-sm">
      {/* HEADER */}
      <section className="rounded-lg border p-4">
        <h1 className="mb-2 text-lg font-bold">
          Scorecard real conectado a Supabase
        </h1>
        <p className="text-slate-600">
          Firma digital completa: marcador + jugador + testigo.
        </p>
      </section>

      {/* TARJETA */}
      <ScorecardPreview
        title={`Tarjeta electrónica · ${fullName(player)}`}
        status={summary.status}
        holes={summary.holes}
        totals={summary.totals}
        player_signed_at={summary.player_signed_at}
        marker_signed_at={summary.marker_signed_at}
        witness_signed_at={summary.witness_signed_at}
        locked_at={summary.locked_at}
      />

      {/* FIRMA MARCADOR */}
      <MarkerSignForm
        scorecard_id={scorecard.id}
        current_status={scorecard.status}
        player_signed_at={scorecard.player_signed_at}
        marker_signed_at={scorecard.marker_signed_at}
        witness_signed_at={scorecard.witness_signed_at}
        locked_at={scorecard.locked_at}
        signer_name="Marcador Demo"
        holes_played={summary.totals.holesPlayed}
      />

      {/* FIRMA JUGADOR */}
      <PlayerSignForm
        scorecard_id={scorecard.id}
        current_status={scorecard.status}
        player_signed_at={scorecard.player_signed_at}
        marker_signed_at={scorecard.marker_signed_at}
        witness_signed_at={scorecard.witness_signed_at}
        locked_at={scorecard.locked_at}
        signer_name="Jugador Demo"
        holes_played={summary.totals.holesPlayed}
      />

      {/* 🔥 FIRMA TESTIGO (NUEVO) */}
      <WitnessSignForm
        scorecard_id={scorecard.id}
        current_status={scorecard.status}
        player_signed_at={scorecard.player_signed_at}
        marker_signed_at={scorecard.marker_signed_at}
        witness_signed_at={scorecard.witness_signed_at}
        locked_at={scorecard.locked_at}
        signer_name="Testigo Demo"
        holes_played={summary.totals.holesPlayed}
      />

      {/* LINK REMOTO */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">Firma remota</h2>

        {remoteFullUrl ? (
          <div className="space-y-3">
            <div className="rounded bg-slate-100 p-3 font-mono text-[12px] break-all text-slate-900">
              {remoteFullUrl}
            </div>
          </div>
        ) : (
          <p className="text-slate-600">
            No se generó link remoto porque ya firmaron o está cerrada.
          </p>
        )}
      </section>
    </main>
  );
}