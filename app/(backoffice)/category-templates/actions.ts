"use server";

import { createClient } from "@/utils/supabase/server";
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

function optBool(fd: FormData, key: string) {
  return fd.get(key) === "on";
}

function parseGender(value: string) {
  const g = String(value ?? "").trim().toUpperCase();
  if (!g) return "X";
  if (g !== "M" && g !== "F" && g !== "X") {
    throw new Error(`Género inválido: ${g}`);
  }
  return g as "M" | "F" | "X";
}

function parseCategoryGroup(value: string) {
  const g = String(value ?? "").trim().toLowerCase();
  if (!g) return "main";

  const allowed = ["main", "senior", "ladies", "super_senior", "mixed"];
  if (!allowed.includes(g)) {
    throw new Error(`Grupo inválido: ${g}`);
  }

  return g as "main" | "senior" | "ladies" | "super_senior" | "mixed";
}

function validateHandicapRange(min: number, max: number, prefix = "") {
  const label = prefix ? `${prefix}: ` : "";

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`${label}rangos inválidos`);
  }

  if (min < -10 || min > 54) {
    throw new Error(`${label}handicap_min fuera de rango razonable (-10 a 54)`);
  }

  if (max < -10 || max > 54) {
    throw new Error(`${label}handicap_max fuera de rango razonable (-10 a 54)`);
  }

  if (min > max) {
    throw new Error(`${label}handicap_min no puede ser mayor que handicap_max`);
  }
}

async function normalizeTemplateSortOrder(templateId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("category_template_items")
    .select("id, sort_order, handicap_min, code")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("handicap_min", { ascending: true })
    .order("code", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data?.length) return;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nextOrder = i + 1;

    if (row.sort_order !== nextOrder) {
      const { error: upErr } = await supabase
        .from("category_template_items")
        .update({ sort_order: nextOrder })
        .eq("id", row.id);

      if (upErr) throw new Error(upErr.message);
    }
  }
}

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();

  const name = reqStr(formData, "name");
  const description = optStr(formData, "description");
  const is_active = optBool(formData, "is_active");

  const { data, error } = await supabase
    .from("category_templates")
    .insert({
      name,
      description,
      is_active,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/category-templates");
  redirect(`/category-templates?template_id=${data.id}`);
}

export async function updateTemplateHeader(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const name = reqStr(formData, "name");
  const description = optStr(formData, "description");
  const is_active = optBool(formData, "is_active");

  const { error } = await supabase
    .from("category_templates")
    .update({
      name,
      description,
      is_active,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/category-templates");
  redirect(`/category-templates?template_id=${id}`);
}

export async function deleteTemplate(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");

  const { error } = await supabase
    .from("category_templates")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/category-templates");
  redirect("/category-templates");
}

type SnapshotRow = {
  id?: string;
  code: string;
  name: string;
  gender: "M" | "F" | "X";
  category_group: string;
  handicap_min: number;
  handicap_max: number;
  handicap_percent_override?: number | null;
  allow_multiple_prizes_per_player?: boolean;
  default_prize_count?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

export async function saveTemplateItemsSnapshot(formData: FormData) {
  const supabase = await createClient();

  const template_id = reqStr(formData, "template_id");
  const rowsRaw = reqStr(formData, "rows_json");
  const deleteIdsRaw = String(formData.get("delete_ids_json") ?? "").trim();

  let rows: SnapshotRow[] = [];
  let deleteIds: string[] = [];

  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    throw new Error("rows_json inválido");
  }

  try {
    deleteIds = deleteIdsRaw ? JSON.parse(deleteIdsRaw) : [];
  } catch {
    throw new Error("delete_ids_json inválido");
  }

  if (!Array.isArray(rows)) throw new Error("rows_json debe ser un arreglo");
  if (!Array.isArray(deleteIds)) {
    throw new Error("delete_ids_json debe ser un arreglo");
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    r.code = String(r.code ?? "").trim().toUpperCase();
    r.name = String(r.name ?? "").trim();
    r.gender = parseGender(String(r.gender ?? "X"));
    r.category_group = parseCategoryGroup(String(r.category_group ?? "main"));
    r.handicap_min = Number(r.handicap_min);
    r.handicap_max = Number(r.handicap_max);
    r.handicap_percent_override =
      r.handicap_percent_override === null ||
      r.handicap_percent_override === undefined ||
      String(r.handicap_percent_override) === ""
        ? null
        : Math.trunc(Number(r.handicap_percent_override));
    r.allow_multiple_prizes_per_player = Boolean(
      r.allow_multiple_prizes_per_player
    );
    r.default_prize_count =
      r.default_prize_count === null ||
      r.default_prize_count === undefined ||
      String(r.default_prize_count) === ""
        ? null
        : Math.trunc(Number(r.default_prize_count));
    r.is_active = Boolean(r.is_active);
    r.sort_order = i + 1;

    if (!r.code) throw new Error(`Falta code en fila ${i + 1}`);
    if (!r.name) throw new Error(`Falta name en fila ${i + 1}`);

    validateHandicapRange(
      r.handicap_min,
      r.handicap_max,
      `En fila ${i + 1}`
    );
  }

  const used = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const code = rows[i].code.toUpperCase();
    if (used.has(code)) {
      throw new Error(`El code "${code}" está repetido en fila ${i + 1}`);
    }
    used.add(code);
  }

  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("category_template_items")
      .delete()
      .eq("template_id", template_id)
      .in("id", deleteIds);

    if (delErr) throw new Error(delErr.message);
  }

  const existing = rows.filter((r) => r.id && !String(r.id).startsWith("tmp_"));
  const fresh = rows.filter((r) => !r.id || String(r.id).startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("category_template_items")
      .update({
        template_id,
        code: r.code,
        name: r.name,
        gender: r.gender,
        category_group: r.category_group,
        handicap_min: r.handicap_min,
        handicap_max: r.handicap_max,
        handicap_percent_override: r.handicap_percent_override ?? null,
        allow_multiple_prizes_per_player:
          r.allow_multiple_prizes_per_player ?? false,
        default_prize_count: r.default_prize_count ?? null,
        is_active: r.is_active ?? true,
        sort_order: r.sort_order,
      })
      .eq("id", r.id!);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      template_id,
      code: r.code,
      name: r.name,
      gender: r.gender,
      category_group: r.category_group,
      handicap_min: r.handicap_min,
      handicap_max: r.handicap_max,
      handicap_percent_override: r.handicap_percent_override ?? null,
      allow_multiple_prizes_per_player:
        r.allow_multiple_prizes_per_player ?? false,
      default_prize_count: r.default_prize_count ?? null,
      is_active: r.is_active ?? true,
      sort_order: r.sort_order,
    }));

    const { error } = await supabase.from("category_template_items").insert(payload);
    if (error) throw new Error(error.message);
  }

  await normalizeTemplateSortOrder(template_id);

  revalidatePath("/category-templates");
  redirect(`/category-templates?template_id=${template_id}`);
}