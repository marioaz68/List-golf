import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRole } from "./permissions";
import { isCommitteeOnlyUser } from "./isCommitteeOnlyUser";

export { isCommitteeOnlyUser };

type RoleValue =
  | {
      code: string | null;
    }
  | {
      code: string | null;
    }[]
  | null;

type GlobalRoleRow = {
  roles: RoleValue;
};

type ClubRoleRow = {
  roles: RoleValue;
};

type TournamentRoleRow = {
  roles: RoleValue;
};

function extractRoleCode(roleValue: RoleValue | undefined): string | null {
  if (!roleValue) return null;
  if (Array.isArray(roleValue)) return roleValue[0]?.code ?? null;
  return roleValue.code ?? null;
}

function addAssignedRole(roles: Set<string>, code: string | null) {
  const raw = code?.trim() ?? "";
  if (!raw) return;
  const normalized = normalizeRole(raw);
  roles.add(normalized ?? raw);
}

export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const roles = new Set<string>();

  const { data: globalRows, error: globalError } = await supabase
    .from("user_global_roles")
    .select("roles:role_id ( code )")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (globalError) {
    console.error("Error loading user_global_roles:", globalError.message);
  } else {
    for (const row of (globalRows ?? []) as GlobalRoleRow[]) {
      addAssignedRole(roles, extractRoleCode(row.roles));
    }
  }

  const { data: clubRows, error: clubError } = await supabase
    .from("user_club_roles")
    .select("roles:role_id ( code )")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (clubError) {
    console.error("Error loading user_club_roles:", clubError.message);
  } else {
    for (const row of (clubRows ?? []) as ClubRoleRow[]) {
      addAssignedRole(roles, extractRoleCode(row.roles));
    }
  }

  const { data: tournamentRows, error: tournamentError } = await supabase
    .from("user_tournament_roles")
    .select("roles:role_id ( code )")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (tournamentError) {
    console.error("Error loading user_tournament_roles:", tournamentError.message);
  } else {
    for (const row of (tournamentRows ?? []) as TournamentRoleRow[]) {
      addAssignedRole(roles, extractRoleCode(row.roles));
    }
  }

  return Array.from(roles);
}