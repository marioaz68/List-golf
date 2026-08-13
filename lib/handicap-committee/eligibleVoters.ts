import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quién cuenta para promedio/trim: rol handicap_committee (torneo, club o
 * global) Y presencia marcada en esta sesión.
 */
export async function loadEligibleCommitteeVoterIds(
  admin: SupabaseClient,
  params: { tournamentId: string; committeeId: string }
): Promise<{
  memberIds: Set<string>;
  eligibleIds: Set<string>;
}> {
  const memberIds = new Set<string>();
  const eligibleIds = new Set<string>();

  const { data: roleRow } = await admin
    .from("roles")
    .select("id")
    .eq("code", "handicap_committee")
    .maybeSingle();
  const roleId = roleRow?.id ? String(roleRow.id) : null;
  if (!roleId) return { memberIds, eligibleIds };

  const { data: tournament } = await admin
    .from("tournaments")
    .select("club_id")
    .eq("id", params.tournamentId)
    .maybeSingle();
  const clubId = tournament?.club_id ? String(tournament.club_id) : null;

  const [{ data: tourRows }, { data: clubRows }, { data: globalRows }, { data: presenceRows }] =
    await Promise.all([
      admin
        .from("user_tournament_roles")
        .select("user_id")
        .eq("tournament_id", params.tournamentId)
        .eq("role_id", roleId)
        .eq("is_active", true),
      clubId
        ? admin
            .from("user_club_roles")
            .select("user_id")
            .eq("club_id", clubId)
            .eq("role_id", roleId)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
      admin
        .from("user_global_roles")
        .select("user_id")
        .eq("role_id", roleId)
        .eq("is_active", true),
      admin
        .from("handicap_committee_member_presence")
        .select("user_id, is_present")
        .eq("committee_id", params.committeeId),
    ]);

  for (const row of [...(tourRows ?? []), ...(clubRows ?? []), ...(globalRows ?? [])]) {
    const uid = row.user_id ? String(row.user_id) : "";
    if (uid) memberIds.add(uid);
  }

  const presentIds = new Set<string>();
  for (const p of presenceRows ?? []) {
    if (p.is_present && p.user_id) presentIds.add(String(p.user_id));
  }

  for (const uid of memberIds) {
    if (presentIds.has(uid)) eligibleIds.add(uid);
  }

  return { memberIds, eligibleIds };
}
