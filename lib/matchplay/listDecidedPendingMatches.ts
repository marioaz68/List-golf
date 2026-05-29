import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";

export type DecidedPendingMatch = {
  /** group_id del pairing — se usa como input al endpoint /api/captura/close-match. */
  groupId: string;
  groupNo: number | null;
  roundId: string;
  roundNo: number;
  /** ID real del match en `matchplay_matches`. */
  matchplayMatchId: string;
  /** Texto descriptivo de cuál pareja ganó ("AS 6 UP", "Decidido en H16", etc.). */
  resultText: string;
  decidedAtHole: number;
  viaPlayoff: boolean;
  playoffHole: number | null;
  topPair: {
    pairId: string;
    label: string;
    playerNames: string[];
  };
  bottomPair: {
    pairId: string;
    label: string;
    playerNames: string[];
  };
  /** Lado ganador relativo al derived match. */
  winnerSide: "top" | "bottom";
  /** Total top/bottom al cierre. */
  topTotal: number;
  bottomTotal: number;
};

/**
 * Devuelve los matches del torneo que están matemáticamente decididos
 * (según los scores stroke play capturados) pero cuyo registro en
 * `matchplay_matches` todavía no se marcó como `completed`. Estos son
 * los matches que el comité puede "cerrar" desde captura.
 */
export async function listDecidedPendingMatches(
  admin: SupabaseClient,
  tournamentId: string
): Promise<DecidedPendingMatch[]> {
  if (!tournamentId) return [];

  // 1) Reglas — solo aplicamos a Bola Baja + Alta
  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (rulesRow?.pair_format !== "low_high") return [];

  // 2) Bracket publicado
  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id, status")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bracket?.id) return [];

  // 3) Derivar matches por pairing_groups + decisiones
  const derived = await derivePairingGroupMatches(admin, tournamentId);
  if (derived.matches.length === 0) return [];

  const { decisions } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    derived.matches
  );

  // 4) Cargar matches reales del bracket
  const { data: realMatchesRaw } = await admin
    .from("matchplay_matches")
    .select(
      "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status"
    )
    .eq("bracket_id", bracket.id);
  type RealMatch = {
    id: string;
    bracket_id: string;
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string | null;
  };
  const realMatches = (realMatchesRaw ?? []) as RealMatch[];

  // 5) Mapear group_id → derivedMatchId (para output)
  //    El derived id ya tiene formato `derived-${roundId}-g${groupNo}`.
  //    Cargar group rows para poder devolver group_id + tee_time.
  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .in(
      "round_id",
      Array.from(new Set(derived.matches.map((m) => m.round_id)))
    );
  const groupByDerivedId = new Map<
    string,
    { groupId: string; groupNo: number | null }
  >();
  for (const g of (groupsRaw ?? []) as Array<{
    id: string;
    round_id: string;
    group_no: number | null;
  }>) {
    const groupNo = g.group_no ?? null;
    if (groupNo == null) continue;
    groupByDerivedId.set(`derived-${g.round_id}-g${groupNo}`, {
      groupId: g.id,
      groupNo,
    });
  }

  // 6) Cargar nombres de jugadores para los entries que aparecen
  const entryIds = new Set<string>();
  for (const m of derived.matches) {
    if (m.top_a_entry_id) entryIds.add(m.top_a_entry_id);
    if (m.top_b_entry_id) entryIds.add(m.top_b_entry_id);
    if (m.bottom_a_entry_id) entryIds.add(m.bottom_a_entry_id);
    if (m.bottom_b_entry_id) entryIds.add(m.bottom_b_entry_id);
  }
  const nameByEntry = new Map<string, string>();
  if (entryIds.size > 0) {
    const { data: entriesRaw } = await admin
      .from("tournament_entries")
      .select(
        `id, players ( first_name, last_name )`
      )
      .in("id", Array.from(entryIds));
    type EntryRaw = {
      id: string;
      players:
        | { first_name: string | null; last_name: string | null }
        | { first_name: string | null; last_name: string | null }[]
        | null;
    };
    for (const e of (entriesRaw ?? []) as EntryRaw[]) {
      const p = Array.isArray(e.players) ? e.players[0] : e.players;
      const name =
        [p?.first_name, p?.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || "(sin nombre)";
      nameByEntry.set(String(e.id), name);
    }
  }

  // 7) Cargar rounds para round_no
  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId);
  const roundNoById = new Map<string, number>();
  for (const r of (roundsRaw ?? []) as Array<{
    id: string;
    round_no: number;
  }>) {
    roundNoById.set(String(r.id), Number(r.round_no ?? 0));
  }

  // 8) Construir resultado
  const pending: DecidedPendingMatch[] = [];
  for (const derivedMatch of derived.matches) {
    const decision = decisions.get(derivedMatch.id);
    if (!decision) continue;

    const topPairId = derivedMatch.top_pair_id;
    const bottomPairId = derivedMatch.bottom_pair_id;
    if (!topPairId || !bottomPairId) continue;

    const groupRef = groupByDerivedId.get(derivedMatch.id);
    if (!groupRef) continue;

    // Buscar match real correspondiente.
    const realMatch = realMatches.find(
      (m) =>
        (m.top_pair_id === topPairId && m.bottom_pair_id === bottomPairId) ||
        (m.top_pair_id === bottomPairId && m.bottom_pair_id === topPairId)
    );
    if (!realMatch) continue;
    if (realMatch.status === "completed") continue;

    const topNames = [
      derivedMatch.top_a_entry_id
        ? nameByEntry.get(derivedMatch.top_a_entry_id) ?? ""
        : "",
      derivedMatch.top_b_entry_id
        ? nameByEntry.get(derivedMatch.top_b_entry_id) ?? ""
        : "",
    ].filter(Boolean);
    const bottomNames = [
      derivedMatch.bottom_a_entry_id
        ? nameByEntry.get(derivedMatch.bottom_a_entry_id) ?? ""
        : "",
      derivedMatch.bottom_b_entry_id
        ? nameByEntry.get(derivedMatch.bottom_b_entry_id) ?? ""
        : "",
    ].filter(Boolean);

    // Texto del resultado
    const diff = Math.abs(decision.top_total - decision.bottom_total);
    const holesRemaining = decision.via_playoff
      ? 0
      : 18 - decision.decided_at_hole;
    let resultText: string;
    if (decision.via_playoff) {
      resultText = `Decidido en playoff H${decision.playoff_hole ?? "?"} (${
        decision.top_total
      }-${decision.bottom_total})`;
    } else if (holesRemaining === 0) {
      resultText = `Decidido en H18 (${decision.top_total}-${decision.bottom_total})`;
    } else {
      resultText = `${diff}/${holesRemaining} en H${decision.decided_at_hole}`;
    }

    pending.push({
      groupId: groupRef.groupId,
      groupNo: groupRef.groupNo,
      roundId: derivedMatch.round_id,
      roundNo: roundNoById.get(derivedMatch.round_id) ?? derivedMatch.round_no,
      matchplayMatchId: String(realMatch.id),
      resultText,
      decidedAtHole: decision.decided_at_hole,
      viaPlayoff: Boolean(decision.via_playoff),
      playoffHole: decision.playoff_hole ?? null,
      topPair: {
        pairId: topPairId,
        label: topNames.join(" + ") || "Pareja A",
        playerNames: topNames,
      },
      bottomPair: {
        pairId: bottomPairId,
        label: bottomNames.join(" + ") || "Pareja B",
        playerNames: bottomNames,
      },
      winnerSide: decision.winner,
      topTotal: decision.top_total,
      bottomTotal: decision.bottom_total,
    });
  }

  // Ordenar por ronda y grupo asc
  pending.sort((a, b) => {
    if (a.roundNo !== b.roundNo) return a.roundNo - b.roundNo;
    return (a.groupNo ?? 0) - (b.groupNo ?? 0);
  });

  return pending;
}
