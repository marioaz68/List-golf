export type PairTeamPlayableFields = {
  is_active?: boolean | null;
  player_a_entry_id?: string | null;
  player_b_entry_id?: string | null;
  player_a?: unknown;
  player_b?: unknown;
};

/** Pareja que puede jugar: activa y con al menos un inscrito. */
export function isPlayablePairTeam(
  team: PairTeamPlayableFields | null | undefined
): boolean {
  if (!team) return false;
  if (team.is_active === false) return false;
  if (team.player_a_entry_id || team.player_b_entry_id) return true;
  if (team.player_a || team.player_b) return true;
  return false;
}
