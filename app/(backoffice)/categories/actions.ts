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
  return String(fd.get(key) ?? "").trim();
}

function optInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
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

function reqGender(fd: FormData, key = "gender") {
  return parseGender(String(fd.get(key) ?? ""));
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

function reqNum(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return n;
}

async function getTournamentOrgId(_tournamentId: string) {
  return null;
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

async function normalizeCategorySortOrder(tournamentId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, sort_order, handicap_min, code")
    .eq("tournament_id", tournamentId)
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
        .from("categories")
        .update({ sort_order: nextOrder })
        .eq("id", row.id);

      if (upErr) throw new Error(upErr.message);
    }
  }
}

function revalidateCategoryPaths() {
  revalidatePath("/categories");
  revalidatePath("/tournaments");
}

export async function createCategory(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const org_id = await getTournamentOrgId(tournament_id);

  const gender = reqGender(formData);
  const category_group = parseCategoryGroup(
    String(formData.get("category_group") ?? "main")
  );
  const code = reqStr(formData, "code").toUpperCase();
  const name = reqStr(formData, "name");
  const handicap_min = reqNum(formData, "handicap_min");
  const handicap_max = reqNum(formData, "handicap_max");
  const is_active = optBool(formData, "is_active");

  const handicap_percent_override = optInt(
    formData,
    "handicap_percent_override"
  );
  const allow_multiple_prizes_per_player = optBool(
    formData,
    "allow_multiple_prizes_per_player"
  );
  const default_prize_count = optInt(formData, "default_prize_count");

  validateHandicapRange(handicap_min, handicap_max);

  const { data: lastRow, error: lastErr } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("tournament_id", tournament_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) throw new Error(lastErr.message);

  const nextSort = (lastRow?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("categories").insert({
    org_id,
    tournament_id,
    gender,
    category_group,
    code,
    name,
    handicap_min,
    handicap_max,
    is_active,
    allow_multiple_prizes_per_player,
    handicap_percent_override,
    default_prize_count,
    sort_order: nextSort,
  });

  if (error) throw new Error(error.message);

  await normalizeCategorySortOrder(tournament_id);

  revalidateCategoryPaths();
  redirect(`/categories?tournament_id=${tournament_id}&tab=editor`);
}

export async function updateCategory(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = reqStr(formData, "tournament_id");
  const org_id = await getTournamentOrgId(tournament_id);

  const gender = reqGender(formData);
  const category_group = parseCategoryGroup(
    String(formData.get("category_group") ?? "main")
  );
  const code = reqStr(formData, "code").toUpperCase();
  const name = reqStr(formData, "name");
  const handicap_min = reqNum(formData, "handicap_min");
  const handicap_max = reqNum(formData, "handicap_max");
  const is_active = optBool(formData, "is_active");

  const handicap_percent_override = optInt(
    formData,
    "handicap_percent_override"
  );
  const allow_multiple_prizes_per_player = optBool(
    formData,
    "allow_multiple_prizes_per_player"
  );
  const default_prize_count = optInt(formData, "default_prize_count");

  validateHandicapRange(handicap_min, handicap_max);

  const { error } = await supabase
    .from("categories")
    .update({
      org_id,
      tournament_id,
      gender,
      category_group,
      code,
      name,
      handicap_min,
      handicap_max,
      is_active,
      allow_multiple_prizes_per_player,
      handicap_percent_override,
      default_prize_count,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidateCategoryPaths();
  redirect(`/categories?tournament_id=${tournament_id}&tab=editor`);
}

type SnapshotRow = {
  id?: string;
  code: string;
  name: string;
  gender: "M" | "F" | "X";
  category_group: string;
  handicap_min: number;
  handicap_max: number;
  is_active?: boolean;
  sort_order?: number;
};

export async function saveCategoriesSnapshot(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const org_id = await getTournamentOrgId(tournament_id);

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
      .from("categories")
      .delete()
      .eq("tournament_id", tournament_id)
      .in("id", deleteIds);

    if (delErr) throw new Error(delErr.message);
  }

  const existing = rows.filter((r) => r.id && !String(r.id).startsWith("tmp_"));
  const fresh = rows.filter((r) => !r.id || String(r.id).startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("categories")
      .update({
        org_id,
        tournament_id,
        code: r.code,
        name: r.name,
        gender: r.gender,
        category_group: r.category_group,
        handicap_min: r.handicap_min,
        handicap_max: r.handicap_max,
        is_active: r.is_active ?? true,
        sort_order: r.sort_order,
      })
      .eq("id", r.id!);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      org_id,
      tournament_id,
      code: r.code,
      name: r.name,
      gender: r.gender,
      category_group: r.category_group,
      handicap_min: r.handicap_min,
      handicap_max: r.handicap_max,
      is_active: r.is_active ?? true,
      sort_order: r.sort_order,
    }));

    const { error } = await supabase.from("categories").insert(payload);
    if (error) throw new Error(error.message);
  }

  await normalizeCategorySortOrder(tournament_id);

  revalidateCategoryPaths();
  redirect(`/categories?tournament_id=${tournament_id}&tab=editor`);
}

export async function deleteCategory(formData: FormData) {
  const supabase = await createClient();

  const id = reqStr(formData, "id");
  const tournament_id = String(formData.get("tournament_id") ?? "").trim();

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) throw new Error(error.message);

  if (tournament_id) {
    await normalizeCategorySortOrder(tournament_id);
  }

  revalidateCategoryPaths();

  if (tournament_id) {
    redirect(`/categories?tournament_id=${tournament_id}&tab=editor`);
  }

  redirect("/categories");
}

export async function applyCategoryTemplate(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const template_id = reqStr(formData, "template_id");
  const org_id = await getTournamentOrgId(tournament_id);

  const { data: template, error: templateError } = await supabase
    .from("category_templates")
    .select("id, name, is_active")
    .eq("id", template_id)
    .eq("is_active", true)
    .maybeSingle();

  if (templateError) throw new Error(templateError.message);
  if (!template) {
    throw new Error("La plantilla seleccionada no existe o está inactiva.");
  }

  const { data: items, error: itemsError } = await supabase
    .from("category_template_items")
    .select(
      "code, name, gender, category_group, handicap_min, handicap_max, is_active, sort_order"
    )
    .eq("template_id", template_id)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const { error: delErr } = await supabase
    .from("categories")
    .delete()
    .eq("tournament_id", tournament_id);

  if (delErr) throw new Error(delErr.message);

  const payload = (items ?? []).map((item, idx) => ({
    org_id,
    tournament_id,
    code: String(item.code ?? "").trim().toUpperCase(),
    name: String(item.name ?? "").trim(),
    gender: parseGender(String(item.gender ?? "X")),
    category_group: parseCategoryGroup(String(item.category_group ?? "main")),
    handicap_min: Number(item.handicap_min ?? 0),
    handicap_max: Number(item.handicap_max ?? 0),
    is_active: item.is_active ?? true,
    sort_order: idx + 1,
    handicap_percent_override: null,
    allow_multiple_prizes_per_player: false,
    default_prize_count: null,
  }));

  if (payload.length > 0) {
    const { error: insErr } = await supabase.from("categories").insert(payload);
    if (insErr) throw new Error(insErr.message);
  }

  await normalizeCategorySortOrder(tournament_id);

  revalidateCategoryPaths();
  redirect(
    `/categories?tournament_id=${tournament_id}&tab=editor&template_id=${template_id}`
  );
}

export async function saveTournamentCategoriesAsTemplate(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const name = reqStr(formData, "template_name");
  const description = optStr(formData, "template_description");
  const org_id = await getTournamentOrgId(tournament_id);

  const { data: currentCategories, error: categoriesError } = await supabase
    .from("categories")
    .select(
      "code, name, gender, category_group, handicap_min, handicap_max, is_active, sort_order"
    )
    .eq("tournament_id", tournament_id)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (categoriesError) throw new Error(categoriesError.message);

  if (!currentCategories || currentCategories.length === 0) {
    throw new Error("Este torneo no tiene categorías para guardar como plantilla.");
  }

  const { data: existingTemplate, error: existingError } = await supabase
    .from("category_templates")
    .select("id, name, is_active")
    .ilike("name", name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  let templateId = existingTemplate?.id ?? "";

  if (templateId) {
    const { error: updateTemplateError } = await supabase
      .from("category_templates")
      .update({
        name,
        description: description || null,
        is_active: true,
      })
      .eq("id", templateId);

    if (updateTemplateError) throw new Error(updateTemplateError.message);

    const { error: deleteItemsError } = await supabase
      .from("category_template_items")
      .delete()
      .eq("template_id", templateId);

    if (deleteItemsError) throw new Error(deleteItemsError.message);
  } else {
    const { data: insertedTemplate, error: insertTemplateError } = await supabase
      .from("category_templates")
      .insert({
        org_id,
        name,
        description: description || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (insertTemplateError) throw new Error(insertTemplateError.message);

    templateId = insertedTemplate.id;
  }

  const itemsPayload = currentCategories.map((item, idx) => ({
    template_id: templateId,
    code: String(item.code ?? "").trim().toUpperCase(),
    name: String(item.name ?? "").trim(),
    gender: parseGender(String(item.gender ?? "X")),
    category_group: parseCategoryGroup(String(item.category_group ?? "main")),
    handicap_min: Number(item.handicap_min ?? 0),
    handicap_max: Number(item.handicap_max ?? 0),
    is_active: item.is_active ?? true,
    sort_order: idx + 1,
  }));

  const { error: insertItemsError } = await supabase
    .from("category_template_items")
    .insert(itemsPayload);

  if (insertItemsError) throw new Error(insertItemsError.message);

  revalidateCategoryPaths();
  redirect(
    `/categories?tournament_id=${tournament_id}&tab=template&template_id=${templateId}`
  );
}

export async function deleteCategoryTemplate(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const template_id = reqStr(formData, "template_id");

  const { data: template, error: templateError } = await supabase
    .from("category_templates")
    .select("id, is_active")
    .eq("id", template_id)
    .maybeSingle();

  if (templateError) throw new Error(templateError.message);
  if (!template) throw new Error("La plantilla ya no existe.");

  const { error: deactivateTemplateError } = await supabase
    .from("category_templates")
    .update({ is_active: false })
    .eq("id", template_id);

  if (deactivateTemplateError) throw new Error(deactivateTemplateError.message);

  const { data: nextTemplates, error: nextTemplatesError } = await supabase
    .from("category_templates")
    .select("id")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1);

  if (nextTemplatesError) throw new Error(nextTemplatesError.message);

  revalidateCategoryPaths();

  const nextTemplateId = nextTemplates?.[0]?.id ?? "";
  const q = new URLSearchParams({
    tournament_id,
    tab: "template",
  });

  if (nextTemplateId) {
    q.set("template_id", nextTemplateId);
  }

  redirect(`/categories?${q.toString()}`);
}