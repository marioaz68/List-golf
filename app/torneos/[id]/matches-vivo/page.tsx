import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import AutoRefresh from "@/components/public/AutoRefresh";
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
  // Además, si ya se están capturando hole_scores brutos (stroke play),
  // derivamos los puntos low/high del match en tiempo real desde ahí
  // para que matches-vivo se mueva aunque no exista bracket oficial.
  if (initialMatches.length === 0) {
    const derived = await derivePairingGroupMatches(supabase, tournamentId);
    if (derived.matches.length > 0) {
      initialMatches = derived.matches.map((m) => ({ ...m }));
      bracketSize = derived.bracketSize;
      roundCount = derived.roundCount;
      bracketIdForGrid = `derived-${tournamentId}`;
      derivedFromPairings = true;

      const derivedResult = await deriveMatchHolesFromStrokes(
        supabase,
        tournamentId,
        derived.matches
      );
      if (derivedResult.holes.length > 0) {
        initialHoles = derivedResult.holes.map((h) => ({
          match_id: h.match_id,
          hole_no: h.hole_no,
          top_points: h.top_points,
          bottom_points: h.bottom_points,
          match_status_after: h.match_status_after,
        }));
      }

      // Match decidido por marcador: promovemos el estado a "completed"
      // y poblamos winner_pair_id + result_text para que la grilla y el
      // modal lo reflejen sin esperar al cierre formal del comité.
      if (derivedResult.decisions.size > 0) {
        initialMatches = initialMatches.map((m) => {
          const dec = derivedResult.decisions.get(m.id);
          if (!dec) return m;
          const winnerPairId =
            dec.winner === "top" ? m.top_pair_id : m.bottom_pair_id;
          const fmt = (n: number) =>
            Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
          let resultText: string;
          if (dec.via_playoff && dec.playoff_hole != null) {
            // Decidido en muerte súbita (hoyos 19-27 = 1-9 físicos).
            const hi = Math.max(dec.top_total, dec.bottom_total);
            const lo = Math.min(dec.top_total, dec.bottom_total);
            resultText = `${fmt(hi)}–${fmt(lo)} · Desempate H${dec.playoff_hole}`;
          } else {
            // En Bola Baja + Bola Alta cada hoyo otorga máx. 2 puntos, por lo
            // que los "puntos por jugar" al cierre = hoyos restantes × 2.
            const holesRemaining = Math.max(
              0,
              holesPerMatch - dec.decided_at_hole
            );
            const pointsRemaining = holesRemaining * 2;
            const hi = Math.max(dec.top_total, dec.bottom_total);
            const lo = Math.min(dec.top_total, dec.bottom_total);
            const tail =
              pointsRemaining === 0
                ? ""
                : ` · ${pointsRemaining} ${pointsRemaining === 1 ? "punto" : "puntos"} por jugar`;
            resultText = `${fmt(hi)}–${fmt(lo)} en H${dec.decided_at_hole}${tail}`;
          }
          return {
            ...m,
            status: "completed",
            winner_pair_id: winnerPairId,
            result_text: resultText,
          };
        });
      }
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <AutoRefresh intervalMs={10000} />
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
