import type { SupabaseClient } from "@supabase/supabase-js";

export type HandicapCommitteeAccess = {
  userId: string;
  isAdmin: boolean;
  isMember: boolean;
};

function hasRoleCode(rows: unknown[], code: string) {
  for (const row of rows as Array<{ roles?: { code?: string } | { code?: string }[] }>) {
    const r = row.roles;
    const role = Array.isArray(r) ? r[0] : r;
    if (role?.code === code) return true;
  }
  return false;
}

export async function loadHandicapCommitteeAccess(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: string
): Promise<HandicapCommitteeAccess> {
  const [{ data: globalRows }, { data: clubRows }, { data: tourRows }] =
    await Promise.all([
      supabase
        .from("user_global_roles")
        .select("roles:role_id(code)")
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase
        .from("user_club_roles")
        .select("club_id, roles:role_id(code)")
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase
        .from("user_tournament_roles")
        .select("tournament_id, roles:role_id(code)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("tournament_id", tournamentId),
    ]);

  const isSuperAdmin = hasRoleCode(globalRows ?? [], "super_admin");
  const isClubAdmin = hasRoleCode(clubRows ?? [], "club_admin");
  const isDirector = hasRoleCode(tourRows ?? [], "tournament_director");
  const isMember = hasRoleCode(tourRows ?? [], "handicap_committee");

  const isAdmin = isSuperAdmin || isClubAdmin || isDirector;

  return {
    userId,
    isAdmin,
    isMember: isMember || isAdmin,
  };
}
