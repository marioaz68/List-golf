"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

async function ensureStaffAdminAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

export async function createTournamentAndMaybeCopyCategories(formData: FormData) {
  const supabase = await createClient();

  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const status = optStr(formData, "status") ?? "draft";
  const club_name = optStr(formData, "club_name");
  const course_name = optStr(formData, "course_name");
  const start_date = optStr(formData, "start_date");
  const copy_from_tournament_id = optStr(formData, "copy_from_tournament_id");

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .insert({
      name,
      short_name,
      status,
      club_name,
      course_name,
      start_date,
    })
    .select("id")
    .single();

  if (tournamentError) {
    throw new Error(tournamentError.message);
  }

  if (copy_from_tournament_id) {
    const { data: sourceCategories, error: sourceCategoriesError } =
      await supabase
        .from("categories")
        .select(
          `
            code,
            name,
            gender,
            min_age,
            max_age,
            handicap_min,
            handicap_max,
            sort_order,
            is_active,
            category_group,
            handicap_percent_override,
            allow_multiple_prizes_per_player,
            default_prize_count
          `
        )
        .eq("tournament_id", copy_from_tournament_id)
        .order("sort_order", { ascending: true });

    if (sourceCategoriesError) {
      throw new Error(sourceCategoriesError.message);
    }

    if (sourceCategories && sourceCategories.length > 0) {
      const rows = sourceCategories.map((c) => ({
        tournament_id: tournament.id,
        code: c.code ?? null,
        name: c.name ?? null,
        gender: c.gender ?? null,
        min_age: c.min_age ?? null,
        max_age: c.max_age ?? null,
        handicap_min: c.handicap_min ?? null,
        handicap_max: c.handicap_max ?? null,
        sort_order: c.sort_order ?? null,
        is_active: c.is_active ?? true,
        category_group: c.category_group ?? "main",
        handicap_percent_override: c.handicap_percent_override ?? null,
        allow_multiple_prizes_per_player:
          c.allow_multiple_prizes_per_player ?? false,
        default_prize_count: c.default_prize_count ?? null,
      }));

      const { error: insertCategoriesError } = await supabase
        .from("categories")
        .insert(rows);

      if (insertCategoriesError) {
        throw new Error(insertCategoriesError.message);
      }
    }
  }

  revalidatePath("/tournaments");
  revalidatePath("/categories");
  redirect("/tournaments");
}

export async function updateTournamentAction(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");
  const status = optStr(formData, "status") ?? "draft";
  const club_name = optStr(formData, "club_name");
  const course_name = optStr(formData, "course_name");
  const start_date = optStr(formData, "start_date");

  await ensureStaffAdminAccess(tournament_id);

  const { error } = await supabase
    .from("tournaments")
    .update({
      name,
      short_name,
      status,
      club_name,
      course_name,
      start_date,
    })
    .eq("id", tournament_id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/tournaments");
  revalidatePath("/categories");
  revalidatePath("/tournaments/edit");
  redirect("/tournaments");
}

export async function addTournamentStaff(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const user_id = reqStr(formData, "user_id");
  const role_id = reqStr(formData, "role_id");

  await ensureStaffAdminAccess(tournament_id);

  const { error } = await supabase.from("user_tournament_roles").insert({
    tournament_id,
    user_id,
    role_id,
  });

  if (error) {
    if (error.message?.toLowerCase().includes("duplicate")) {
      throw new Error("Ese usuario ya tiene ese rol en este torneo.");
    }
    throw new Error(error.message);
  }

  revalidatePath("/tournaments/staff");
  revalidatePath("/tournaments");
  redirect(`/tournaments/staff?tournament_id=${tournament_id}`);
}

export async function removeTournamentStaff(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const id = reqStr(formData, "id");

  await ensureStaffAdminAccess(tournament_id);

  const { error } = await supabase
    .from("user_tournament_roles")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/tournaments/staff");
  revalidatePath("/tournaments");
  redirect(`/tournaments/staff?tournament_id=${tournament_id}`);
}