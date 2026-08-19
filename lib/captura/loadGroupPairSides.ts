import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCompletePairSides,
  type PairSides,
} from "./pairWitness";

/**
 * Identifica las dos parejas de un grupo (match play / Calcuta / Ryder).
 * Devuelve null en individual o si no hay 2×2 jugadores.
 */
export async function loadGroupPairSides(
  admin: SupabaseClient,
  groupId: string
): Promise<PairSides | null> {
  const gid = groupId.trim();
  if (!gid) return null;

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("round_id")
    .eq("id", gid)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim();
  if (!roundId) return null;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const tournamentId = String(roundRow?.tournament_id ?? "").trim();
  if (!tournamentId) return null;

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("match_type")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const matchType = String(rules?.match_type ?? "").trim();
  if (matchType === "individual") return null;

  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select("entry_id, position")
    .eq("group_id", gid)
    .order("position", { ascending: true });

  const members = ((membersRaw ?? []) as Array<{
    entry_id: string | null;
    position: number | null;
  }>)
    .map((m) => ({
      entryId: String(m.entry_id ?? "").trim(),
      position: typeof m.position === "number" ? m.position : 0,
    }))
    .filter((m) => m.entryId);
  const entryIds = members.map((m) => m.entryId);
  if (entryIds.length < 4) return null;

  const { data: teamsRaw } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, is_active")
    .eq("tournament_id", tournamentId);

  const entryToTeam = new Map<string, string>();
  const teamPlayers = new Map<string, string[]>();
  for (const t of (teamsRaw ?? []) as Array<{
    id: string;
    player_a_entry_id: string | null;
    player_b_entry_id: string | null;
    is_active?: boolean | null;
  }>) {
    if (t.is_active === false) continue;
    const ids = [
      String(t.player_a_entry_id ?? "").trim(),
      String(t.player_b_entry_id ?? "").trim(),
    ].filter(Boolean);
    if (ids.length === 0) continue;
    for (const eid of ids) entryToTeam.set(eid, t.id);
    teamPlayers.set(t.id, ids);
  }

  const teamIdsInGroup: string[] = [];
  for (const eid of entryIds) {
    const teamId = entryToTeam.get(eid);
    if (!teamId) continue;
    if (!teamIdsInGroup.includes(teamId)) teamIdsInGroup.push(teamId);
  }

  if (teamIdsInGroup.length === 2) {
    const a = (teamPlayers.get(teamIdsInGroup[0]!) ?? []).filter((id) =>
      entryIds.includes(id)
    );
    const b = (teamPlayers.get(teamIdsInGroup[1]!) ?? []).filter((id) =>
      entryIds.includes(id)
    );
    const sides: PairSides = { a, b };
    if (isCompletePairSides(sides)) return sides;
  }

  // Match play de parejas (o Ryder): 1-2 vs 3-4 en el orden de la tarjeta.
  if (matchType === "pairs" && entryIds.length >= 4) {
    const sides: PairSides = {
      a: [entryIds[0]!, entryIds[1]!],
      b: [entryIds[2]!, entryIds[3]!],
    };
    if (isCompletePairSides(sides)) return sides;
  }

  return null;
}
