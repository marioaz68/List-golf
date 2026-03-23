"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

function optBool(fd: FormData, key: string, fallback = false) {
  const raw = String(fd.get(key) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "on";
}

type AccessContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
  tournament: { id: string; club_id: string | null } | null;
  isSuperAdmin: boolean;
  allowedClubIds: Set<string>;
  allowedTournamentIds: Set<string>;
};

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
    .select("roles(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin =
    globalRoles?.some((r: any) => {
      const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
      return role?.code === "super_admin";
    }) ?? false;

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
    .select("club_id, roles(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedClubIds = new Set(
    (clubRoles ?? [])
      .filter((r: any) => {
        const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
        return role?.code === "club_admin";
      })
      .map((r: any) => r.club_id)
      .filter(Boolean)
  );

  const { data: tournamentRoles } = await supabase
    .from("user_tournament_roles")
    .select("tournament_id, roles(code)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const allowedTournamentIds = new Set(
    (tournamentRoles ?? [])
      .filter((r: any) => {
        const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
        return role?.code === "tournament_director";
      })
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

    throw new Error("No tienes permisos para crear usuarios en este torneo.");
  }

  if (ctx.allowedClubIds.size > 0) {
    return ctx;
  }

  throw new Error("No tienes permisos para crear usuarios.");
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

async function getRoleIdByCode(code: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roles")
    .select("id, code")
    .eq("code", code)
    .single();

  if (error || !data) {
    throw new Error(`No se encontró el rol ${code}.`);
  }

  return data.id as string;
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

export async function createUserAction(formData: FormData) {
  const email = reqStr(formData, "email").toLowerCase();
  const password = reqStr(formData, "password");
  const firstName = optStr(formData, "first_name");
  const lastName = optStr(formData, "last_name");
  const tournamentId = optStr(formData, "tournament_id");
  const explicitClubId = optStr(formData, "club_id");
  const clubRoleId = optStr(formData, "club_role_id");
  const tournamentRoleIdFromForm = optStr(formData, "tournament_role_id");
  const emailConfirmed = optBool(formData, "email_confirmed", true);
  const isActive = optBool(formData, "is_active", true);

  const ctx = await ensureUsersManageAccess(tournamentId);

  const targetClubId = explicitClubId ?? ctx.tournament?.club_id ?? null;

  if (!ctx.isSuperAdmin) {
    if (!targetClubId && !tournamentId) {
      throw new Error(
        "Debes indicar un club o entrar desde un torneo para crear usuarios."
      );
    }

    if (targetClubId && !ctx.allowedClubIds.has(targetClubId)) {
      if (!(tournamentId && ctx.allowedTournamentIds.has(tournamentId))) {
        throw new Error("No tienes permisos para crear usuarios en ese club.");
      }
    }

    if (tournamentId) {
      if (
        !(ctx.tournament?.club_id && ctx.allowedClubIds.has(ctx.tournament.club_id)) &&
        !ctx.allowedTournamentIds.has(tournamentId)
      ) {
        throw new Error("No tienes permisos para crear usuarios en ese torneo.");
      }
    }
  }

  if (clubRoleId) {
    const clubRole = await getRoleById(clubRoleId);

    if (!canAssignClubRole(ctx, clubRole.code)) {
      throw new Error("No tienes permisos para asignar ese rol de club.");
    }

    if (!targetClubId) {
      throw new Error("Falta el club para asignar rol de club.");
    }
  }

  let tournamentRoleId = tournamentRoleIdFromForm;

  if (tournamentId) {
    if (!tournamentRoleId) {
      tournamentRoleId = await getRoleIdByCode("viewer");
    }

    const tournamentRole = await getRoleById(tournamentRoleId);

    if (!canAssignTournamentRole(ctx, tournamentRole.code)) {
      throw new Error("No tienes permisos para asignar ese rol de torneo.");
    }
  }

  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirmed,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (authError || !authData.user) {
    throw new Error(
      `Error creando usuario: ${authError?.message ?? "No se pudo crear el usuario."}`
    );
  }

  const newUserId = authData.user.id;
  const supabase = await createClient();

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: newUserId,
    email,
    first_name: firstName,
    last_name: lastName,
    is_active: isActive,
  });

  if (profileError) {
    throw new Error(`Usuario creado en Auth, pero falló profile: ${profileError.message}`);
  }

  if (clubRoleId && targetClubId) {
    const { error: clubRoleError } = await supabase.from("user_club_roles").upsert(
      {
        user_id: newUserId,
        club_id: targetClubId,
        role_id: clubRoleId,
        is_active: true,
      },
      {
        onConflict: "user_id,club_id,role_id",
      }
    );

    if (clubRoleError) {
      throw new Error(`Usuario creado, pero falló rol de club: ${clubRoleError.message}`);
    }
  }

  if (tournamentId && tournamentRoleId) {
    const { error: tournamentRoleError } = await supabase
      .from("user_tournament_roles")
      .upsert(
        {
          user_id: newUserId,
          tournament_id: tournamentId,
          role_id: tournamentRoleId,
          is_active: true,
        },
        {
          onConflict: "user_id,tournament_id,role_id",
        }
      );

    if (tournamentRoleError) {
      throw new Error(
        `Usuario creado, pero falló asignación al torneo: ${tournamentRoleError.message}`
      );
    }
  }

  revalidateUsersPaths(tournamentId);

  if (tournamentId) {
    redirect(`/users?tournament_id=${tournamentId}`);
  }

  redirect("/users");
}