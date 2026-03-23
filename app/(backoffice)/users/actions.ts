"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

type AccessContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  tournament: { id: string; club_id: string | null } | null;
  isSuperAdmin: boolean;
  allowedClubIds: Set<string>;
  allowedTournamentIds: Set<string>;
};

function extractRoleCode(roleValue: any): string | null {
  if (!roleValue) return null;
  if (Array.isArray(roleValue)) return roleValue[0]?.code ?? null;
  return roleValue.code ?? null;
}

async function getCurrentAccessContext(
  tournamentId?: string | null
): Promise<AccessContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Sesión no válida.");
  }

  const { data: globalRoles } = await supabase
    .from("user_global_roles")
    .select("roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin =
    (globalRoles ?? []).some((r: any) => extractRoleCode(r.roles) === "super_admin");

  let tournament: { id: string; club_id: string | null } | null = null;

  if (tournamentId) {
    const { data: t, error: tError } = await supabase
      .from("tournaments")
      .select("id, club_id")
      .eq("id", tournamentId)
      .single();

    if (tError || !t) {
      throw new Error("Torneo no encontrado.");
    }

    tournament = t;
  }

  const { data: clubRoles } = await supabase
    .from("user_club_roles")
    .select("club_id, roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedClubIds = new Set(
    (clubRoles ?? [])
      .filter((r: any) => extractRoleCode(r.roles) === "club_admin")
      .map((r: any) => r.club_id)
      .filter(Boolean)
  );

  const { data: tournamentRoles } = await supabase
    .from("user_tournament_roles")
    .select("tournament_id, roles:role_id(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedTournamentIds = new Set(
    (tournamentRoles ?? [])
      .filter((r: any) => extractRoleCode(r.roles) === "tournament_director")
      .map((r: any) => r.tournament_id)
      .filter(Boolean)
  );

  return {
    supabase,
    user: { id: user.id },
    tournament,
    isSuperAdmin,
    allowedClubIds,
    allowedTournamentIds,
  };
}

async function ensureUsersManageAccess(tournamentId?: string | null) {
  const ctx = await getCurrentAccessContext(tournamentId);

  if (ctx.isSuperAdmin) return ctx;

  if (tournamentId && ctx.tournament) {
    if (ctx.tournament.club_id && ctx.allowedClubIds.has(ctx.tournament.club_id)) {
      return ctx;
    }

    if (ctx.allowedTournamentIds.has(tournamentId)) {
      return ctx;
    }

    throw new Error("No tienes permisos para administrar usuarios en este torneo.");
  }

  if (ctx.allowedClubIds.size > 0) {
    return ctx;
  }

  throw new Error("No tienes permisos para administrar usuarios.");
}

async function getRoleById(roleId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("id, code, name")
    .eq("id", roleId)
    .single();

  if (error || !data) {
    throw new Error("Rol no encontrado.");
  }

  return data as { id: string; code: string | null; name: string | null };
}

async function ensureCanTouchProfile(profileId: string, tournamentId?: string | null) {
  const ctx = await ensureUsersManageAccess(tournamentId);

  if (ctx.isSuperAdmin) return ctx;

  const supabase = ctx.supabase;

  const { data: targetGlobalRoles } = await supabase
    .from("user_global_roles")
    .select("roles:role_id(code)")
    .eq("user_id", profileId)
    .eq("is_active", true);

  const isTargetSuperAdmin = (targetGlobalRoles ?? []).some(
    (r: any) => extractRoleCode(r.roles) === "super_admin"
  );

  if (isTargetSuperAdmin) {
    throw new Error("No puedes modificar un super admin.");
  }

  const { data: targetClubRoles } = await supabase
    .from("user_club_roles")
    .select("club_id, roles:role_id(code)")
    .eq("user_id", profileId)
    .eq("is_active", true);

  const targetClubAdminClubIds = new Set(
    (targetClubRoles ?? [])
      .filter((r: any) => extractRoleCode(r.roles) === "club_admin")
      .map((r: any) => r.club_id)
      .filter(Boolean)
  );

  if (targetClubAdminClubIds.size > 0) {
    throw new Error("No puedes modificar a otro club admin.");
  }

  if (ctx.allowedClubIds.size > 0) {
    const hasVisibleClubRole = (targetClubRoles ?? []).some(
      (r: any) => r.club_id && ctx.allowedClubIds.has(r.club_id)
    );

    const { data: clubTournaments } = await supabase
      .from("tournaments")
      .select("id, club_id")
      .in("club_id", Array.from(ctx.allowedClubIds));

    const allowedTournamentIdsFromClub = new Set(
      (clubTournaments ?? []).map((t: any) => t.id).filter(Boolean)
    );

    const { data: targetTournamentRoles } = await supabase
      .from("user_tournament_roles")
      .select("tournament_id")
      .eq("user_id", profileId)
      .eq("is_active", true);

    const hasVisibleTournamentRole = (targetTournamentRoles ?? []).some(
      (r: any) =>
        r.tournament_id && allowedTournamentIdsFromClub.has(r.tournament_id)
    );

    if (hasVisibleClubRole || hasVisibleTournamentRole || profileId === ctx.user.id) {
      return ctx;
    }
  }

  if (tournamentId && ctx.allowedTournamentIds.has(tournamentId)) {
    const { data: targetTournamentRoles } = await supabase
      .from("user_tournament_roles")
      .select("tournament_id, roles:role_id(code)")
      .eq("user_id", profileId)
      .eq("tournament_id", tournamentId)
      .eq("is_active", true);

    const hasTargetTournamentDirector = (targetTournamentRoles ?? []).some(
      (r: any) => extractRoleCode(r.roles) === "tournament_director"
    );

    if (hasTargetTournamentDirector) {
      throw new Error("No puedes modificar a otro tournament director.");
    }

    if ((targetTournamentRoles ?? []).length > 0 || profileId === ctx.user.id) {
      return ctx;
    }
  }

  throw new Error("No puedes modificar este usuario con tus permisos actuales.");
}

function canAssignClubRole(
  actor: Awaited<ReturnType<typeof ensureUsersManageAccess>>,
  roleCode: string | null
) {
  if (actor.isSuperAdmin) return true;
  return false;
}

function canAssignTournamentRole(
  actor: Awaited<ReturnType<typeof ensureUsersManageAccess>>,
  roleCode: string | null
) {
  if (actor.isSuperAdmin) return true;

  const allowedForClubAdmin = new Set([
    "tournament_director",
    "score_capture",
    "checkin",
    "viewer",
  ]);

  const allowedForTournamentDirector = new Set([
    "score_capture",
    "checkin",
    "viewer",
  ]);

  if (actor.allowedClubIds.size > 0) {
    return allowedForClubAdmin.has(roleCode ?? "");
  }

  return allowedForTournamentDirector.has(roleCode ?? "");
}

function revalidateUsersPaths(tournamentId?: string | null) {
  revalidatePath("/users");
  revalidatePath("/tournaments");

  if (tournamentId) {
    revalidatePath(`/users?tournament_id=${tournamentId}`);
    revalidatePath(`/tournaments/staff?tournament_id=${tournamentId}`);
  }
}

export async function updateProfileAction(formData: FormData) {
  const profileId = reqStr(formData, "profile_id");
  const tournamentId = optStr(formData, "tournament_id");

  await ensureCanTouchProfile(profileId, tournamentId);

  const supabase = await createClient();

  const firstName = optStr(formData, "first_name");
  const lastName = optStr(formData, "last_name");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      is_active: isActive,
    })
    .eq("id", profileId);

  if (error) {
    throw new Error(`Error actualizando usuario: ${error.message}`);
  }

  revalidateUsersPaths(tournamentId);
}

export async function assignUserClubRoleAction(formData: FormData) {
  const profileId = reqStr(formData, "profile_id");
  const clubId = reqStr(formData, "club_id");
  const roleId = reqStr(formData, "role_id");
  const tournamentId = optStr(formData, "tournament_id");

  const ctx = await ensureUsersManageAccess(tournamentId);
  await ensureCanTouchProfile(profileId, tournamentId);

  if (!ctx.isSuperAdmin && !ctx.allowedClubIds.has(clubId)) {
    throw new Error("No tienes permisos para asignar roles en ese club.");
  }

  const role = await getRoleById(roleId);

  if (!canAssignClubRole(ctx, role.code)) {
    throw new Error("No tienes permisos para asignar ese rol de club.");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("user_club_roles").upsert(
    {
      user_id: profileId,
      club_id: clubId,
      role_id: roleId,
      is_active: true,
    },
    {
      onConflict: "user_id,club_id,role_id",
    }
  );

  if (error) {
    throw new Error(`Error asignando rol al usuario: ${error.message}`);
  }

  revalidateUsersPaths(tournamentId);
}

export async function removeUserClubRoleAction(formData: FormData) {
  const relationId = reqStr(formData, "relation_id");
  const tournamentId = optStr(formData, "tournament_id");

  const ctx = await ensureUsersManageAccess(tournamentId);
  const supabase = await createClient();

  const { data: relation, error: relationError } = await supabase
    .from("user_club_roles")
    .select("id, user_id, club_id, role_id, roles:role_id(code)")
    .eq("id", relationId)
    .single();

  if (relationError || !relation) {
    throw new Error("Relación de club no encontrada.");
  }

  if (!ctx.isSuperAdmin && !ctx.allowedClubIds.has((relation as any).club_id)) {
    throw new Error("No tienes permisos para quitar roles en ese club.");
  }

  const relationRoleCode = extractRoleCode((relation as any).roles);

  if (!canAssignClubRole(ctx, relationRoleCode)) {
    throw new Error("No tienes permisos para quitar ese rol de club.");
  }

  await ensureCanTouchProfile((relation as any).user_id, tournamentId);

  const { error } = await supabase
    .from("user_club_roles")
    .delete()
    .eq("id", relationId);

  if (error) {
    throw new Error(`Error quitando rol: ${error.message}`);
  }

  revalidateUsersPaths(tournamentId);
}

export async function assignUserTournamentRoleAction(formData: FormData) {
  const profileId = reqStr(formData, "profile_id");
  const tournamentId = reqStr(formData, "tournament_id");
  const roleId = reqStr(formData, "role_id");

  const ctx = await ensureUsersManageAccess(tournamentId);
  await ensureCanTouchProfile(profileId, tournamentId);

  const role = await getRoleById(roleId);

  if (!canAssignTournamentRole(ctx, role.code)) {
    throw new Error("No tienes permisos para asignar ese rol de torneo.");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("user_tournament_roles").upsert(
    {
      user_id: profileId,
      tournament_id: tournamentId,
      role_id: roleId,
      is_active: true,
    },
    {
      onConflict: "user_id,tournament_id,role_id",
    }
  );

  if (error) {
    throw new Error(`Error asignando rol de torneo: ${error.message}`);
  }

  revalidateUsersPaths(tournamentId);
}

export async function removeUserTournamentRoleAction(formData: FormData) {
  const relationId = reqStr(formData, "relation_id");
  const tournamentId = reqStr(formData, "tournament_id");

  const ctx = await ensureUsersManageAccess(tournamentId);
  const supabase = await createClient();

  const { data: relation, error: relationError } = await supabase
    .from("user_tournament_roles")
    .select("id, user_id, tournament_id, role_id, roles:role_id(code)")
    .eq("id", relationId)
    .single();

  if (relationError || !relation) {
    throw new Error("Relación de torneo no encontrada.");
  }

  const relationRoleCode = extractRoleCode((relation as any).roles);

  if (!canAssignTournamentRole(ctx, relationRoleCode)) {
    throw new Error("No tienes permisos para quitar ese rol de torneo.");
  }

  await ensureCanTouchProfile((relation as any).user_id, tournamentId);

  const { error } = await supabase
    .from("user_tournament_roles")
    .delete()
    .eq("id", relationId);

  if (error) {
    throw new Error(`Error quitando rol de torneo: ${error.message}`);
  }

  revalidateUsersPaths(tournamentId);
}