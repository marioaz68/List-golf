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

function normalizeCode(v: string) {
  return String(v ?? "").trim().toUpperCase();
}

async function normalizeTournamentTeeSetSortOrder(tournamentId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tournament_tee_sets")
    .select("id, sort_order")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data?.length) return;

  for (let i = 0; i < data.length; i++) {
    const nextOrder = i + 1;
    if ((data[i].sort_order ?? 0) !== nextOrder) {
      const { error: upErr } = await supabase
        .from("tournament_tee_sets")
        .update({ sort_order: nextOrder })
        .eq("id", data[i].id);

      if (upErr) throw new Error(upErr.message);
    }
  }
}

type CatalogRowInput = {
  id?: string;
  code: string;
  name: string;
  color: string;
  sort_order?: number;
  selected?: boolean;
};

export async function saveTeeSetCatalogAndSelectionAction(formData: FormData) {
  const supabase = await createClient();

  const tournament_id = reqStr(formData, "tournament_id");
  const rowsRaw = reqStr(formData, "rows_json");

  let rows: CatalogRowInput[] = [];

  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    throw new Error("rows_json inválido");
  }

  if (!Array.isArray(rows)) throw new Error("rows_json debe ser un arreglo");

  const normalized = rows.map((r, i) => ({
    id: String(r.id ?? "").trim(),
    code: normalizeCode(r.code),
    name: String(r.name ?? "").trim(),
    color: String(r.color ?? "").trim(),
    sort_order: i + 1,
    selected: Boolean(r.selected),
  }));

  const used = new Set<string>();
  for (let i = 0; i < normalized.length; i++) {
    const r = normalized[i];
    if (!r.code) throw new Error(`Falta Code en fila ${i + 1}`);
    if (!r.name) throw new Error(`Falta Nombre en fila ${i + 1}`);
    if (used.has(r.code)) throw new Error(`El Code "${r.code}" está repetido.`);
    used.add(r.code);
  }

  for (const r of normalized) {
    if (r.id) {
      const { error } = await supabase
        .from("tee_set_catalog")
        .update({
          code: r.code,
          name: r.name,
          color: r.color || null,
          sort_order: r.sort_order,
          is_active: true,
        })
        .eq("id", r.id);

      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("tee_set_catalog")
        .insert({
          code: r.code,
          name: r.name,
          color: r.color || null,
          sort_order: r.sort_order,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      r.id = inserted.id;
    }
  }

  const selectedIds = normalized.filter((r) => r.selected).map((r) => r.id).filter(Boolean);

  const { data: existingAssigned, error: existingErr } = await supabase
    .from("tournament_tee_sets")
    .select("id, tee_set_catalog_id")
    .eq("tournament_id", tournament_id);

  if (existingErr) throw new Error(existingErr.message);

  const existingAssignedIds = new Set(
    (existingAssigned ?? []).map((r) => String(r.tee_set_catalog_id))
  );

  const selectedSet = new Set(selectedIds.map(String));

  const toDelete = (existingAssigned ?? [])
    .filter((r) => !selectedSet.has(String(r.tee_set_catalog_id)))
    .map((r) => r.id);

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("tournament_tee_sets")
      .delete()
      .in("id", toDelete);

    if (error) throw new Error(error.message);
  }

  let nextSort = 1;
  for (const r of normalized) {
    if (!r.id || !r.selected) continue;

    if (existingAssignedIds.has(String(r.id))) {
      const { error } = await supabase
        .from("tournament_tee_sets")
        .update({ sort_order: nextSort })
        .eq("tournament_id", tournament_id)
        .eq("tee_set_catalog_id", r.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("tournament_tee_sets")
        .insert({
          tournament_id,
          tee_set_catalog_id: r.id,
          sort_order: nextSort,
        });

      if (error) throw new Error(error.message);
    }

    nextSort += 1;
  }

  await normalizeTournamentTeeSetSortOrder(tournament_id);

  revalidatePath("/tee-sets");
  redirect(`/tee-sets?tournament_id=${tournament_id}`);
}