import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Match "derivado" a partir de pairing_groups + matchplay_pair_teams.
 * Se usa cuando todavía no hay un bracket oficial publicado en
 * `matchplay_brackets` pero el comité ya armó las salidas: así la página
 * pública "Matches en vivo" puede mostrar los partidos del día con
 * score 0-0 mientras todavía no inicia el live scoring.
 */
export type DerivedMatchRow = {
  /** id sintético — no apunta a `matchplay_matches`. */
  id: string;
  bracket_id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: "scheduled" | "bye";
  result_text: string | null;
};

export type DerivedMatchesResult = {
  matches: DerivedMatchRow[];
  /** Cantidad de "rondas" lógicas (1 por cada ronda con pairings). */
  roundCount: number;
  /** Capacidad equivalente para `roundLabel` (mín 2). */
  bracketSize: number;
};

/**
 * Recorre los `pairing_groups` del torneo y arma "matches" implícitos:
 *  - 1 match = 1 group con 2 teams distintos asignados
 *  - position_no = group_no (orden de la salida)
 *  - round_no = orden secuencial de la ronda con pairings (R1, R2, …)
 */
export async function derivePairingGroupMatches(
  admin: SupabaseClient,
  tournamentId: string
): Promise<DerivedMatchesResult> {
  const empty: DerivedMatchesResult = {
    matches: [],
    roundCount: 0,
    bracketSize: 0,
  };
  if (!tournamentId) return empty;

  // Rondas del torneo (con pairings).
  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });

  const rounds = (roundsRaw ?? []) as Array<{
    id: string;
    round_no: number;
  }>;
  if (rounds.length === 0) return empty;

  // Pairings y miembros.
  const roundIds = rounds.map((r) => r.id);
  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .in("round_id", roundIds);

  const groups = (groupsRaw ?? []) as Array<{
    id: string;
    round_id: string;
    group_no: number | null;
  }>;
  if (groups.length === 0) return empty;

  const groupIds = groups.map((g) => g.id);

  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select("group_id, entry_id")
    .in("group_id", groupIds);

  const members = (membersRaw ?? []) as Array<{
    group_id: string;
    entry_id: string;
  }>;
  if (members.length === 0) return empty;

  // Teams del torneo (todos los entries pertenecen al mismo torneo).
  const { data: teamsRaw } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, is_active")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  const entryToTeam = new Map<string, string>();
  for (const t of (teamsRaw ?? []) as Array<{
    id: string;
    player_a_entry_id: string | null;
    player_b_entry_id: string | null;
  }>) {
    if (t.player_a_entry_id) entryToTeam.set(t.player_a_entry_id, t.id);
    if (t.player_b_entry_id) entryToTeam.set(t.player_b_entry_id, t.id);
  }
  if (entryToTeam.size === 0) return empty;

  // Por grupo: lista de team_ids únicos.
  const teamsByGroup = new Map<string, string[]>();
  for (const m of members) {
    const team = entryToTeam.get(m.entry_id);
    if (!team) continue;
    const cur = teamsByGroup.get(m.group_id) ?? [];
    if (!cur.includes(team)) cur.push(team);
    teamsByGroup.set(m.group_id, cur);
  }

  // Rondas que efectivamente tienen pairings con teams (orden ascendente).
  const roundsWithGroups = rounds
    .filter((r) => groups.some((g) => g.round_id === r.id))
    .sort((a, b) => a.round_no - b.round_no);

  const matches: DerivedMatchRow[] = [];
  let assignedRoundNo = 0;

  for (const round of roundsWithGroups) {
    const groupsOfRound = groups
      .filter((g) => g.round_id === round.id)
      .sort((a, b) => (a.group_no ?? 0) - (b.group_no ?? 0));

    const matchesInRound: Array<{ top: string | null; bottom: string | null; pos: number }> = [];
    let pos = 0;
    for (const g of groupsOfRound) {
      const teamsIds = teamsByGroup.get(g.id) ?? [];
      if (teamsIds.length === 0) continue;
      pos++;
      matchesInRound.push({
        top: teamsIds[0] ?? null,
        bottom: teamsIds[1] ?? null,
        pos: g.group_no ?? pos,
      });
    }

    if (matchesInRound.length === 0) continue;
    assignedRoundNo++;

    for (const m of matchesInRound) {
      const isBye = !m.top || !m.bottom;
      matches.push({
        id: `derived-${round.id}-g${m.pos}`,
        bracket_id: `derived-${tournamentId}`,
        round_no: assignedRoundNo,
        position_no: m.pos,
        top_pair_id: m.top,
        bottom_pair_id: m.bottom,
        winner_pair_id: isBye ? m.top ?? m.bottom : null,
        status: isBye ? "bye" : "scheduled",
        result_text: isBye ? "BYE" : null,
      });
    }
  }

  if (matches.length === 0) return empty;

  // Capacidad equivalente: la siguiente potencia de 2 ≥ matches*2 de la
  // ronda más grande (mín 2). Sólo se usa para etiquetar la ronda.
  const maxPerRound = Math.max(
    ...Array.from({ length: assignedRoundNo }, (_, i) =>
      matches.filter((m) => m.round_no === i + 1).length
    )
  );
  let bracketSize = 2;
  while (bracketSize < maxPerRound * 2) bracketSize *= 2;

  return {
    matches,
    roundCount: assignedRoundNo,
    bracketSize,
  };
}
