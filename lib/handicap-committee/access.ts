import type { SupabaseClient } from "@supabase/supabase-js";

export type HandicapCommitteeAccess = {
  userId: string;
  isAdmin: boolean;
  isMember: boolean;
  /**
   * Alcance con el que el usuario es miembro del comité (puede haber más
   * de uno; se devuelve el más amplio para mostrar en la UI).
   *   - "global"     → rol en user_global_roles
   *   - "club"       → rol en user_club_roles para el club del torneo
   *   - "tournament" → rol en user_tournament_roles para este torneo
   *   - "admin"      → administrador del torneo (no por rol explícito)
   *   - null         → no es miembro
   */
  memberScope: "global" | "club" | "tournament" | "admin" | null;
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
  // Necesitamos el club del torneo para resolver el alcance "club".
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, club_id")
    .eq("id", tournamentId)
    .maybeSingle();

  const clubId: string | null = (tournament as any)?.club_id ?? null;

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

  const isGlobalMember = hasRoleCode(globalRows ?? [], "handicap_committee");
  const isClubMember = (clubRows ?? []).some((row: any) => {
    const r = row.roles;
    const role = Array.isArray(r) ? r[0] : r;
    return (
      role?.code === "handicap_committee" &&
      clubId &&
      String(row.club_id) === clubId
    );
  });
  const isTournamentMember = hasRoleCode(tourRows ?? [], "handicap_committee");

  const isAdmin = isSuperAdmin || isClubAdmin || isDirector;
  const isMember =
    isAdmin || isGlobalMember || isClubMember || isTournamentMember;

  const memberScope: HandicapCommitteeAccess["memberScope"] = isGlobalMember
    ? "global"
    : isClubMember
      ? "club"
      : isTournamentMember
        ? "tournament"
        : isAdmin
          ? "admin"
          : null;

  return {
    userId,
    isAdmin,
    isMember,
    memberScope,
  };
}
