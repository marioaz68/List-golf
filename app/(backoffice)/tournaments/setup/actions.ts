"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function optStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
}

function reqInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) throw new Error(`Falta ${key}`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido en ${key}`);
  return Math.trunc(n);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Fecha base inválida para generar rondas");
  }
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildSetupRedirectUrl(
  tournament_id: string,
  opts?: {
    club_name?: string | null;
    init_club_name?: string | null;
  }
) {
  const params = new URLSearchParams();
  params.set("tournament_id", tournament_id);

  if (opts?.club_name) {
    params.set("club_name", opts.club_name);
  }

  if (opts?.init_club_name) {
    params.set("init_club_name", opts.init_club_name);
  }

  return `/tournaments/setup?${params.toString()}`;
}

async function ensureTournamentSetupAccess(tournament_id: string) {
  await requireTournamentAccess({
    tournamentId: tournament_id,
    allowedRoles: ["super_admin", "club_admin", "tournament_director"],
  });
}

async function replaceTournamentCategoriesFromTemplate(params: {
  tournament_id: string;
  template_id: string;
}) {
  const supabase = await createClient();

  const { tournament_id, template_id } = params;

  const { data: templateRows, error: templateRowsError } = await supabase
    .from("category_template_items")
    .select(
      "code, name, gender, category_group, handicap_min, handicap_max, handicap_percent_override, allow_multiple_prizes_per_player, default_prize_count, sort_order, is_active"
    )
    .eq("template_id", template_id)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (templateRowsError) throw new Error(templateRowsError.message);

  if (!templateRows || templateRows.length === 0) {
    throw new Error("La plantilla no tiene categorías");
  }

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("tournament_id", tournament_id);

  if (deleteError) throw new Error(deleteError.message);

  const rows = templateRows.map((row, idx) => ({
    tournament_id,
    code: row.code,
    name: row.name,
    gender: row.gender ?? "X",
    category_group: row.category_group ?? "main",
    handicap_min: row.handicap_min ?? 0,
    handicap_max: row.handicap_max ?? 0,
    handicap_percent_override: row.handicap_percent_override ?? null,
    allow_multiple_prizes_per_player:
      row.allow_multiple_prizes_per_player ?? false,
    default_prize_count: row.default_prize_count ?? null,
    sort_order: row.sort_order ?? idx + 1,
    is_active: row.is_active ?? true,
  }));

  const { error: insertError } = await supabase
    .from("categories")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);
}

export async function applyCourseToTournament(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureTournamentSetupAccess(tournament_id);

  const course_id = reqStr(formData, "course_id");
  const club_name = optStr(formData, "club_name");
  const init_club_name = optStr(formData, "init_club_name");

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, name, club_name")
    .eq("id", course_id)
    .single();

  if (courseError) throw new Error(courseError.message);
  if (!course) throw new Error("Campo no encontrado");

  const { error: updateTournamentError } = await supabase
    .from("tournaments")
    .update({
      club_name: course.club_name ?? null,
      course_name: course.name ?? null,
    })
    .eq("id", tournament_id);

  if (updateTournamentError) throw new Error(updateTournamentError.message);

  const { data: holes, error: holesError } = await supabase
    .from("course_holes")
    .select("hole_number, par, handicap_index")
    .eq("course_id", course_id)
    .order("hole_number");

  if (holesError) throw new Error(holesError.message);
  if (!holes || holes.length === 0) {
    throw new Error("El campo no tiene tarjeta base cargada");
  }

  const { error: deleteError } = await supabase
    .from("tournament_holes")
    .delete()
    .eq("tournament_id", tournament_id);

  if (deleteError) throw new Error(deleteError.message);

  const rows = holes.map((h) => ({
    tournament_id,
    hole_number: h.hole_number,
    par: h.par,
    handicap_index: h.handicap_index,
  }));

  const { error: insertError } = await supabase
    .from("tournament_holes")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);

  revalidatePath("/tournaments/setup");
  revalidatePath("/tournaments");
  revalidatePath("/score-entry");

  redirect(
    buildSetupRedirectUrl(tournament_id, {
      club_name,
      init_club_name,
    })
  );
}

export async function applyCategoryTemplateToTournament(formData: FormData) {
  const tournament_id = reqStr(formData, "tournament_id");
  await ensureTournamentSetupAccess(tournament_id);

  const template_id = reqStr(formData, "template_id");
  const club_name = optStr(formData, "club_name");
  const init_club_name = optStr(formData, "init_club_name");

  await replaceTournamentCategoriesFromTemplate({
    tournament_id,
    template_id,
  });

  revalidatePath("/tournaments/setup");
  revalidatePath("/categories");
  revalidatePath("/tournaments");

  redirect(
    buildSetupRedirectUrl(tournament_id, {
      club_name,
      init_club_name,
    })
  );
}

export async function initializeTournament(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  await ensureTournamentSetupAccess(tournament_id);

  const course_id = reqStr(formData, "course_id");
  const template_id = optStr(formData, "template_id");
  const rounds_count = reqInt(formData, "rounds_count");
  const club_name = optStr(formData, "club_name");
  const init_club_name = optStr(formData, "init_club_name");

  if (rounds_count <= 0) {
    throw new Error("El número de rondas debe ser mayor a cero");
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, start_date")
    .eq("id", tournament_id)
    .single();

  if (tournamentError) throw new Error(tournamentError.message);
  if (!tournament) throw new Error("Torneo no encontrado");

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, name, club_name")
    .eq("id", course_id)
    .single();

  if (courseError) throw new Error(courseError.message);
  if (!course) throw new Error("Campo no encontrado");

  const { error: updateTournamentError } = await supabase
    .from("tournaments")
    .update({
      club_name: course.club_name ?? null,
      course_name: course.name ?? null,
    })
    .eq("id", tournament_id);

  if (updateTournamentError) throw new Error(updateTournamentError.message);

  const baseDate = String(tournament.start_date ?? "").trim() || todayISO();

  const { data: holes, error: holesError } = await supabase
    .from("course_holes")
    .select("hole_number, par, handicap_index")
    .eq("course_id", course_id)
    .order("hole_number");

  if (holesError) throw new Error(holesError.message);
  if (!holes || holes.length === 0) {
    throw new Error("El campo no tiene tarjeta base cargada");
  }

  const { error: deleteTournamentHolesError } = await supabase
    .from("tournament_holes")
    .delete()
    .eq("tournament_id", tournament_id);

  if (deleteTournamentHolesError) {
    throw new Error(deleteTournamentHolesError.message);
  }

  const tournamentHoleRows = holes.map((h) => ({
    tournament_id,
    hole_number: h.hole_number,
    par: h.par,
    handicap_index: h.handicap_index,
  }));

  const { error: insertTournamentHolesError } = await supabase
    .from("tournament_holes")
    .insert(tournamentHoleRows);

  if (insertTournamentHolesError) {
    throw new Error(insertTournamentHolesError.message);
  }

  if (template_id) {
    await replaceTournamentCategoriesFromTemplate({
      tournament_id,
      template_id,
    });
  }

  const { error: deleteRoundsError } = await supabase
    .from("rounds")
    .delete()
    .eq("tournament_id", tournament_id);

  if (deleteRoundsError) throw new Error(deleteRoundsError.message);

  const roundRows = Array.from({ length: rounds_count }, (_, idx) => ({
    tournament_id,
    round_no: idx + 1,
    date: addDaysISO(baseDate, idx),
  }));

  const { error: insertRoundsError } = await supabase
    .from("rounds")
    .insert(roundRows);

  if (insertRoundsError) throw new Error(insertRoundsError.message);

  revalidatePath("/tournaments/setup");
  revalidatePath("/tournaments");
  revalidatePath("/categories");
  revalidatePath("/rounds");
  revalidatePath("/score-entry");

  redirect(
    buildSetupRedirectUrl(tournament_id, {
      club_name,
      init_club_name,
    })
  );
}