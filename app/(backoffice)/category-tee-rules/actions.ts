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

function optInt(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${s}`);
  return Math.trunc(n);
}

function optNum(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${s}`);
  return n;
}

function parseGender(value: unknown) {
  const g = String(value ?? "").trim().toUpperCase();
  if (!g) return null;
  if (g !== "M" && g !== "F" && g !== "X") {
    throw new Error(`Género inválido: ${g}`);
  }
  return g as "M" | "F" | "X";
}

type SnapshotRow = {
  id?: string;
  category_id: string;
  tee_set_id: string;
  priority?: number;
  age_min?: number | null;
  age_max?: number | null;
  gender?: "M" | "F" | "X" | null;
  handicap_min?: number | null;
  handicap_max?: number | null;
};

export async function saveCategoryTeeRulesSnapshot(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const rowsRaw = reqStr(formData, "rows_json");
  const deleteIdsRaw = optStr(formData, "delete_ids_json");

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

  if (!Array.isArray(rows)) throw new Error("rows_json debe ser arreglo");
  if (!Array.isArray(deleteIds)) throw new Error("delete_ids_json debe ser arreglo");

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    r.category_id = String(r.category_id ?? "").trim();
    r.tee_set_id = String(r.tee_set_id ?? "").trim();
    r.priority = i + 1;
    r.age_min = optInt(r.age_min);
    r.age_max = optInt(r.age_max);
    r.gender = parseGender(r.gender);
    r.handicap_min = optNum(r.handicap_min);
    r.handicap_max = optNum(r.handicap_max);

    if (!r.category_id) throw new Error(`Falta categoría en fila ${i + 1}`);
    if (!r.tee_set_id) throw new Error(`Falta salida en fila ${i + 1}`);

    if (r.age_min !== null && r.age_max !== null && r.age_min > r.age_max) {
      throw new Error(`Edad mínima mayor que edad máxima en fila ${i + 1}`);
    }

    if (
      r.handicap_min !== null &&
      r.handicap_max !== null &&
      r.handicap_min > r.handicap_max
    ) {
      throw new Error(`Handicap mínimo mayor que handicap máximo en fila ${i + 1}`);
    }
  }

  if (deleteIds.length > 0) {
    const { error: delErr } = await supabase
      .from("category_tee_rules")
      .delete()
      .in("id", deleteIds);

    if (delErr) throw new Error(delErr.message);
  }

  const { data: tournamentCategories, error: catErr } = await supabase
    .from("categories")
    .select("id")
    .eq("tournament_id", tournament_id);

  if (catErr) throw new Error(catErr.message);

  const categoryIds = new Set((tournamentCategories ?? []).map((x) => x.id));
  for (const r of rows) {
    if (!categoryIds.has(r.category_id)) {
      throw new Error("Hay una regla con categoría que no pertenece al torneo actual");
    }
  }

  const existing = rows.filter((r) => r.id && !String(r.id).startsWith("tmp_"));
  const fresh = rows.filter((r) => !r.id || String(r.id).startsWith("tmp_"));

  for (const r of existing) {
    const { error } = await supabase
      .from("category_tee_rules")
      .update({
        tournament_id,
        category_id: r.category_id,
        tee_set_id: r.tee_set_id,
        priority: r.priority,
        age_min: r.age_min,
        age_max: r.age_max,
        gender: r.gender,
        handicap_min: r.handicap_min,
        handicap_max: r.handicap_max,
      })
      .eq("id", r.id!);

    if (error) throw new Error(error.message);
  }

  if (fresh.length > 0) {
    const payload = fresh.map((r) => ({
      tournament_id,
      category_id: r.category_id,
      tee_set_id: r.tee_set_id,
      priority: r.priority,
      age_min: r.age_min,
      age_max: r.age_max,
      gender: r.gender,
      handicap_min: r.handicap_min,
      handicap_max: r.handicap_max,
    }));

    const { error } = await supabase.from("category_tee_rules").insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/category-tee-rules");
  redirect(`/category-tee-rules?tournament_id=${tournament_id}`);
}