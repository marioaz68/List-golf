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

    // Si `matchplay_hole_results` está vacío (la captura se hace en stroke
    // play y no se persiste por hoyo aquí), derivamos los puntos a partir
    // de `hole_scores` para que la página pública refleje el live scoring.
    if (initialHoles.length === 0 && initialMatches.length > 0) {
      const derivedAll = await derivePairingGroupMatches(supabase, tournamentId);
      const derivedByPairKey = new Map<
        string,
        (typeof derivedAll.matches)[number]
      >();
      for (const d of derivedAll.matches) {
        if (!d.top_pair_id || !d.bottom_pair_id) continue;
        const k = [d.top_pair_id, d.bottom_pair_id].sort().join("|");
        derivedByPairKey.set(`${d.round_no}:${k}`, d);
      }
      // Match cada match oficial con su versión derivada (mismas 2 parejas
      // y misma ronda) para reutilizar la cadena de derivación de puntos.
      type MatchInput = (typeof derivedAll.matches)[number];
      const inputs: MatchInput[] = [];
      const idMap = new Map<string, string>(); // derived.id → official.id
      for (const m of initialMatches) {
        if (!m.top_pair_id || !m.bottom_pair_id) continue;
        const k = [m.top_pair_id, m.bottom_pair_id].sort().join("|");
        const d = derivedByPairKey.get(`${m.round_no}:${k}`);
        if (!d) continue;
        inputs.push({ ...d, status: "scheduled" });
        idMap.set(d.id, m.id);
      }
      if (inputs.length > 0) {
        const derivedHoles = await deriveMatchHolesFromStrokes(
          supabase,
          tournamentId,
          inputs
        );
        initialHoles = derivedHoles.holes.map((h) => ({
          match_id: idMap.get(h.match_id) ?? h.match_id,
          hole_no: h.hole_no,
          top_points: h.top_points,
          bottom_points: h.bottom_points,
          match_status_after: h.match_status_after,
        }));
      }
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

      // Formato de result_text para cada match. Funciona tanto para
      // matches decididos como para los que están en juego, mostrando
      // siempre: "H{hoyo} · {lead} arriba · {puntos por jugar}".
      // Reglas (Bola Baja + Bola Alta):
      //  · cada hoyo entrega máx. 2 puntos (1 bola baja + 1 bola alta).
      //  · hoyo halved = 0 puntos para ambas parejas.
      const fmtN = (n: number) =>
        Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");

      function buildResultText(matchId: string): string | null {
        const dec = derivedResult.decisions.get(matchId);
        const summary = derivedResult.summaries.get(matchId);
        if (!summary) return null;

        // Decidido en muerte súbita (desempate 1-9 físicos).
        if (dec?.via_playoff && dec.playoff_hole != null) {
          const lead = Math.abs(dec.top_total - dec.bottom_total);
          return `Desempate H${dec.playoff_hole} · ${fmtN(lead)} arriba`;
        }

        // Decidido por marcador antes (o exactamente al) 18.
        if (dec) {
          const lead = Math.abs(dec.top_total - dec.bottom_total);
          const holesRemaining = Math.max(0, holesPerMatch - dec.decided_at_hole);
          const pointsRemaining = holesRemaining * 2;
          const tail =
            pointsRemaining === 0 ? "" : ` · ${pointsRemaining} por jugar`;
          if (lead === 0) {
            return `H${dec.decided_at_hole} · AS${tail}`;
          }
          return `H${dec.decided_at_hole} · ${fmtN(lead)} arriba${tail}`;
        }

        // AS al 18 pendiente de desempate.
        if (summary.needs_playoff) {
          if (summary.playoff_pending_hole != null) {
            return `Desempate P${summary.playoff_pending_hole} · faltan scores`;
          }
          return `H18 · AS · desempate pendiente`;
        }

        // En juego: necesitamos el último hoyo capturado.
        const matchHoles = derivedResult.holes.filter(
          (h) => h.match_id === matchId
        );
        const played = matchHoles.filter(
          (h) =>
            (h.top_points != null || h.bottom_points != null) && h.hole_no <= 18
        );
        if (played.length === 0) return null;
        const lastHole = played.reduce(
          (max, h) => Math.max(max, h.hole_no),
          0
        );
        const lead = Math.abs(summary.top_total - summary.bottom_total);
        const pointsRemaining = Math.max(0, 18 - lastHole) * 2;
        const tail = pointsRemaining === 0 ? "" : ` · ${pointsRemaining} por jugar`;
        if (lead === 0) return `H${lastHole} · AS${tail}`;
        return `H${lastHole} · ${fmtN(lead)} arriba${tail}`;
      }

      initialMatches = initialMatches.map((m) => {
        const dec = derivedResult.decisions.get(m.id);
        const resultText = buildResultText(m.id);
        if (dec) {
          const winnerPairId =
            dec.winner === "top" ? m.top_pair_id : m.bottom_pair_id;
          return {
            ...m,
            status: "completed",
            winner_pair_id: winnerPairId,
            result_text: resultText,
          };
        }
        if (resultText != null) {
          return { ...m, result_text: resultText };
        }
        return m;
      });
    }
  }

  // Salidas (pairing_groups) → tee_time / group_no por cruce de parejas.
  // Permite mostrar cada match con su hora de salida y detectar grupos
  // retrasados en captura.
  const matchSchedule: Record<
    string,
    { groupNo: number | null; teeTime: string | null; groupId: string }
  > = {};
  try {
    const { data: roundsList } = await supabase
      .from("rounds")
      .select("id, round_no")
      .eq("tournament_id", tournamentId);
    const roundIds = (roundsList ?? []).map((r) => String(r.id));
    if (roundIds.length > 0) {
      const { data: pgs } = await supabase
        .from("pairing_groups")
        .select("id, round_id, group_no, tee_time")
        .in("round_id", roundIds);
      const pgIds = (pgs ?? []).map((p) => String(p.id));
      if (pgIds.length > 0) {
        const { data: members } = await supabase
          .from("pairing_group_members")
          .select("group_id, entry_id")
          .in("group_id", pgIds);
        const { data: pairTeams } = await supabase
          .from("matchplay_pair_teams")
          .select("id, player_a_entry_id, player_b_entry_id")
          .eq("tournament_id", tournamentId)
          .eq("is_active", true);
        const entryToTeam = new Map<string, string>();
        for (const t of pairTeams ?? []) {
          if (t.player_a_entry_id)
            entryToTeam.set(t.player_a_entry_id, String(t.id));
          if (t.player_b_entry_id)
            entryToTeam.set(t.player_b_entry_id, String(t.id));
        }
        const teamsByGroup = new Map<string, string[]>();
        for (const m of members ?? []) {
          const team = entryToTeam.get(m.entry_id);
          if (!team) continue;
          const cur = teamsByGroup.get(m.group_id) ?? [];
          if (!cur.includes(team)) cur.push(team);
          teamsByGroup.set(m.group_id, cur);
        }
        // Mapa: "sortedPairIds" → datos de la salida.
        const scheduleByKey = new Map<
          string,
          { groupNo: number | null; teeTime: string | null; groupId: string }
        >();
        for (const p of pgs ?? []) {
          const ids = (teamsByGroup.get(String(p.id)) ?? [])
            .slice()
            .sort()
            .join("|");
          if (!ids) continue;
          const teeTime = p.tee_time
            ? String(p.tee_time).slice(0, 5)
            : null;
          scheduleByKey.set(ids, {
            groupNo: typeof p.group_no === "number" ? p.group_no : null,
            teeTime,
            groupId: String(p.id),
          });
        }
        for (const m of initialMatches) {
          const ids = [m.top_pair_id, m.bottom_pair_id]
            .filter((x): x is string => !!x)
            .sort()
            .join("|");
          if (!ids) continue;
          const sched = scheduleByKey.get(ids);
          if (sched) matchSchedule[m.id] = sched;
        }
      }
    }
  } catch {
    // Si falla la carga de salidas, simplemente seguimos sin tee times.
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
        matchSchedule={matchSchedule}
      />
    </main>
  );
}
