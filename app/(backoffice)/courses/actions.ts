"use server";

import {
  isCcqNormalizedName,
  normalizeClubText,
  validateClubIdentity,
} from "@/lib/clubs/clubIdentity";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
}

function normalizeCode(v: string) {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  return normalizeClubText(value);
}

type TeeSetRow = {
  id?: string;
  code: string;
  name: string;
  color: string;
  sort_order?: number;
  gender_default?: string | null;
  slope_men?: number | null;
  slope_women?: number | null;
  course_rating_men?: number | null;
  course_rating_women?: number | null;
  par?: number | null;
  yardage?: number | null;
};

function optNum(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function optInt(fd: FormData, key: string): number | null {
  const n = optNum(fd, key);
  return n == null ? null : Math.trunc(n);
}

function optGender(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim().toUpperCase();
  if (v === "M" || v === "F" || v === "X") return v;
  return null;
}

function whsPayload(r: TeeSetRow) {
  return {
    gender_default: r.gender_default ?? null,
    slope_men: r.slope_men ?? null,
    slope_women: r.slope_women ?? null,
    course_rating_men: r.course_rating_men ?? null,
    course_rating_women: r.course_rating_women ?? null,
    par: r.par ?? null,
    yardage: r.yardage ?? null,
  };
}

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
};

async function getActiveClubByIdOrThrow(
  supabase: ReturnType<typeof createAdminClient>,
  club_id: string
) {
  const { data, error } = await supabase
    .from("clubs")
    .select("id,name,short_name,normalized_name,is_active")
    .eq("id", club_id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo club: ${error.message}`);
  }

  const club = (data as ClubRow | null) ?? null;

  if (!club) {
    throw new Error("El club seleccionado no existe o está inactivo.");
  }

  if (!club.name?.trim()) {
    throw new Error("El club seleccionado no tiene nombre válido.");
  }

  return club;
}

async function findClubByNormalizedName(
  supabase: ReturnType<typeof createAdminClient>,
  normalized_name: string
) {
  const { data, error } = await supabase
    .from("clubs")
    .select("id,name,short_name,normalized_name,is_active")
    .eq("normalized_name", normalized_name)
    .order("is_active", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Error buscando club existente: ${error.message}`);
  }

  const first = ((data ?? [])[0] as ClubRow | undefined) ?? null;
  return first;
}

async function resolveClubForCreateCourse(
  supabase: ReturnType<typeof createAdminClient>,
  formData: FormData
) {
  const club_mode = String(formData.get("club_mode") ?? "existing").trim();

  if (club_mode === "existing") {
    const club_id = reqStr(formData, "club_id");
    return await getActiveClubByIdOrThrow(supabase, club_id);
  }

  if (club_mode === "new") {
    const new_club_name = reqStr(formData, "new_club_name");
    const new_club_short_name = optStr(formData, "new_club_short_name");
    const short_name = isCcqNormalizedName(normalizeText(new_club_name))
      ? "CCQ"
      : new_club_short_name;
    const { normalized_name } = validateClubIdentity({
      name: new_club_name,
      short_name,
    });

    const existing = await findClubByNormalizedName(supabase, normalized_name);

    if (existing?.id && existing.name?.trim()) {
      if (!existing.is_active) {
        const { error: activateError } = await supabase
          .from("clubs")
          .update({
            is_active: true,
            short_name: existing.short_name?.trim() || new_club_short_name,
          })
          .eq("id", existing.id);

        if (activateError) throw new Error(activateError.message);

        return {
          ...existing,
          is_active: true,
          short_name: existing.short_name?.trim() || new_club_short_name,
        } as ClubRow;
      }

      return existing;
    }

    const { data, error } = await supabase
      .from("clubs")
      .insert({
        name: new_club_name,
        short_name: short_name ?? new_club_short_name,
        normalized_name,
        is_active: true,
      })
      .select("id,name,short_name,normalized_name,is_active")
      .single();

    if (error) {
      throw new Error(`Error creando club nuevo: ${error.message}`);
    }

    const created = (data as ClubRow | null) ?? null;

    if (!created?.id || !created.name?.trim()) {
      throw new Error("No se pudo crear el club nuevo.");
    }

    return created;
  }

  throw new Error("Modo de club inválido.");
}

function revalidateAll() {
  revalidatePath("/courses");
  revalidatePath("/clubs");
  revalidatePath("/tournaments");
}

export async function createCourse(formData: FormData) {
  const supabase = createAdminClient();

  const name = reqStr(formData, "name");
  const short_name = optStr(formData, "short_name");

  const club = await resolveClubForCreateCourse(supabase, formData);

  const { data, error } = await supabase
    .from("courses")
    .insert({
      name,
      club_id: club.id,
      club_name: club.name?.trim() ?? null,
      short_name,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidateAll();
  redirect(`/courses?course_id=${data.id}`);
}

export async function updateCourse(formData: FormData) {
  const supabase = createAdminClient();

  const course_id = reqStr(formData, "course_id");
  const name = reqStr(formData, "name");
  const club_id = reqStr(formData, "club_id");
  const short_name = optStr(formData, "short_name");

  const club = await getActiveClubByIdOrThrow(supabase, club_id);

  const { error } = await supabase
    .from("courses")
    .update({
      name,
      club_id: club.id,
      club_name: club.name?.trim() ?? null,
      short_name,
    })
    .eq("id", course_id);

  if (error) throw new Error(error.message);

  revalidateAll();
  redirect(`/courses?course_id=${course_id}`);
}

export async function saveCourseHoles(formData: FormData) {
  const supabase = createAdminClient();

  const course_id = reqStr(formData, "course_id");

  const rows = Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;

    const par = reqInt(formData, `par_${hole}`);
    const handicap_index = reqInt(formData, `hcp_${hole}`);

    return {
      course_id,
      hole_number: hole,
      par,
      handicap_index,
    };
  });

  const { error } = await supabase.from("course_holes").upsert(rows, {
    onConflict: "course_id,hole_number",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/courses");
  redirect(`/courses?course_id=${course_id}`);
}

export async function saveCourseTeeSets(formData: FormData) {
  const supabase = createAdminClient();

  const course_id = reqStr(formData, "course_id");
  const rowsRaw = reqStr(formData, "rows_json");
  const deleteIdsRaw = String(formData.get("delete_ids_json") ?? "").trim();
  const rowCount = reqInt(formData, "tee_row_count");

  let idRows: Array<{ id?: string }> = [];
  let deleteIds: string[] = [];

  try {
    idRows = JSON.parse(rowsRaw);
  } catch {
    throw new Error("rows_json inválido");
  }

  try {
    deleteIds = deleteIdsRaw ? JSON.parse(deleteIdsRaw) : [];
  } catch {
    throw new Error("delete_ids_json inválido");
  }

  if (!Array.isArray(idRows)) throw new Error("rows_json debe ser un arreglo");
  if (!Array.isArray(deleteIds)) {
    throw new Error("delete_ids_json debe ser un arreglo");
  }

  if (idRows.length !== rowCount) {
    throw new Error("tee_row_count no coincide con las filas del formulario");
  }

  const normalized: TeeSetRow[] = idRows.map((meta, i) => {
    const n = i + 1;
    return {
      id: String(meta.id ?? "").trim(),
      code: normalizeCode(String(formData.get(`tee_code_${n}`) ?? "")),
      name: String(formData.get(`tee_name_${n}`) ?? "").trim(),
      color: String(formData.get(`tee_color_${n}`) ?? "").trim(),
      gender_default: optGender(formData, `tee_gender_${n}`),
      course_rating_men: optNum(formData, `tee_rating_men_${n}`),
      slope_men: optInt(formData, `tee_slope_men_${n}`),
      course_rating_women: optNum(formData, `tee_rating_women_${n}`),
      slope_women: optInt(formData, `tee_slope_women_${n}`),
      sort_order: n,
    };
  });

  const used = new Set<string>();
  for (let i = 0; i < normalized.length; i++) {
    const r = normalized[i];

    if (!r.code) throw new Error(`Falta code en fila ${i + 1}`);
    if (!r.name) throw new Error(`Falta name en fila ${i + 1}`);

    if (used.has(r.code)) {
      throw new Error(`El code "${r.code}" está repetido`);
    }
    used.add(r.code);
  }

  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("course_tee_sets")
      .delete()
      .eq("course_id", course_id)
      .in("id", deleteIds);

    if (delErr) throw new Error(delErr.message);
  }

  const existing = normalized.filter((r) => r.id && !r.id.startsWith("tmp_"));
  const fresh = normalized.filter((r) => !r.id || r.id.startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("course_tee_sets")
      .update({
        code: r.code,
        name: r.name,
        color: r.color || null,
        sort_order: r.sort_order,
        ...whsPayload(r),
      })
      .eq("id", r.id)
      .eq("course_id", course_id);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      course_id,
      code: r.code,
      name: r.name,
      color: r.color || null,
      sort_order: r.sort_order,
      ...whsPayload(r),
    }));

    const { error } = await supabase.from("course_tee_sets").insert(payload);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/courses");
  redirect(`/courses?course_id=${course_id}`);
}