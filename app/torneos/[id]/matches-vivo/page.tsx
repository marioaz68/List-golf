import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import type { TournamentSettings } from "@/types/tournament";
import MatchesLiveGrid from "./MatchesLiveGrid";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

export default async function PublicMatchesLivePage(props: {
  params: Promise<RouteParams> | RouteParams;
}) {
  const params = await Promise.resolve(props.params);
  const tournamentId = params.id;
  if (!tournamentId) notFound();

  const supabase = createAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, settings, is_public")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) notFound();
  if (tournament.is_public === false) notFound();

  const settings = (tournament.settings ?? {}) as TournamentSettings;
  if (!isMatchPlayFormat(settings)) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4 text-white">
        <h1 className="text-xl font-bold">Matches en vivo</h1>
        <p className="text-sm text-amber-200">
          Este torneo no es match play.
        </p>
        <Link
          href={`/torneos/${tournamentId}`}
          className="inline-flex items-center rounded border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
        >
          ← Volver
        </Link>
      </main>
    );
  }

  const teamsData = await loadMatchPlayTeamsData(tournamentId);

  const { data: rulesRow } = await supabase
    .from("tournament_matchplay_rules")
    .select("holes_per_match")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const holesPerMatch = rulesRow?.holes_per_match === 9 ? 9 : 18;

  const { data: bracket } = await supabase
    .from("matchplay_brackets")
    .select("id, config_json")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let bracketSize =
    (bracket?.config_json as { bracket_size?: number } | null)?.bracket_size ?? 0;
  let roundCount =
    bracketSize >= 2 ? roundCountForBracketSize(bracketSize) : 0;

  let initialMatches: Array<{
    id: string;
    bracket_id: string;
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string | null;
    result_text: string | null;
  }> = [];
  let initialHoles: Array<{
    match_id: string;
    hole_no: number;
    top_points: number | null;
    bottom_points: number | null;
    match_status_after: string | null;
  }> = [];
  let bracketIdForGrid: string | null = bracket?.id ?? null;
  let derivedFromPairings = false;

  if (bracket?.id) {
    const { data: matchesRaw } = await supabase
      .from("matchplay_matches")
      .select(
        "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
      )
      .eq("bracket_id", bracket.id);
    initialMatches = matchesRaw ?? [];

    const matchIds = initialMatches.map((m) => m.id);
    if (matchIds.length > 0) {
      const { data: holeRows } = await supabase
        .from("matchplay_hole_results")
        .select(
          "match_id, hole_no, top_points, bottom_points, match_status_after"
        )
        .in("match_id", matchIds);
      initialHoles = holeRows ?? [];
    }
  }

  // Fallback: si aún no hay bracket oficial pero ya hay salidas (pairings)
  // armadas con equipos asignados, mostramos los matches del día a 0-0
  // para que la página pública refleje los partidos en curso/próximos.
  if (initialMatches.length === 0) {
    const derived = await derivePairingGroupMatches(supabase, tournamentId);
    if (derived.matches.length > 0) {
      initialMatches = derived.matches.map((m) => ({ ...m }));
      bracketSize = derived.bracketSize;
      roundCount = derived.roundCount;
      bracketIdForGrid = `derived-${tournamentId}`;
      derivedFromPairings = true;
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <MatchesLiveGrid
        tournamentId={tournamentId}
        tournamentName={tournament.name ?? "Torneo"}
        teams={teamsData.teams}
        initialMatches={initialMatches}
        initialHoles={initialHoles}
        bracketId={bracketIdForGrid}
        bracketSize={bracketSize}
        roundCount={roundCount}
        holesPerMatch={holesPerMatch}
        derivedFromPairings={derivedFromPairings}
      />
    </main>
  );
}
