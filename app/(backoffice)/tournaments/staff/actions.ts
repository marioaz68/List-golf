"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

async function ensureTournamentStaffAccess(tournamentId: string) {
  await requireTournamentAccess({
    tournamentId,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

export async function assignTournamentRoleAction(formData: FormData) {
  const supabase = await createClient();

  const userId = reqStr(formData, "user_id");
  const tournamentId = reqStr(formData, "tournament_id");
  const roleId = reqStr(formData, "role_id");

  await ensureTournamentStaffAccess(tournamentId);

  const { error } = await supabase.from("user_tournament_roles").upsert(
    {
      user_id: userId,
      tournament_id: tournamentId,
      role_id: roleId,
      is_active: true,
    },
    {
      onConflict: "user_id,tournament_id,role_id",
    }
  );

  if (error) {
    throw new Error(`Error asignando staff al torneo: ${error.message}`);
  }

  revalidatePath("/tournaments/staff");
  revalidatePath("/tournaments");
}

export async function removeTournamentRoleAction(formData: FormData) {
  const supabase = await createClient();

  const relationId = reqStr(formData, "relation_id");
  const tournamentId = reqStr(formData, "tournament_id");

  await ensureTournamentStaffAccess(tournamentId);

  const { error } = await supabase
    .from("user_tournament_roles")
    .delete()
    .eq("id", relationId);

  if (error) {
    throw new Error(`Error quitando staff del torneo: ${error.message}`);
  }

  revalidatePath("/tournaments/staff");
  revalidatePath("/tournaments");
}