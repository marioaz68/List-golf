"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { DbReferencePointKind } from "@/lib/distances/courseReferencePoints";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function reqNum(fd: FormData, key: string) {
  const n = Number(String(fd.get(key) ?? "").trim());
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${key}`);
  return n;
}

const KINDS = new Set<DbReferencePointKind>([
  "bunker",
  "water",
  "dogleg",
  "hazard",
  "other",
  "custom",
]);

export async function saveCourseHolePoint(formData: FormData) {
  const supabase = await createClient();
  const courseId = reqStr(formData, "course_id");
  const holeNumber = Math.trunc(reqNum(formData, "hole_number"));
  if (holeNumber < 1 || holeNumber > 18) throw new Error("Hoyo inválido");

  const label = reqStr(formData, "label");
  const shortLabel = String(formData.get("short_label") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "other").trim() as DbReferencePointKind;
  const kind = KINDS.has(kindRaw) ? kindRaw : "other";
  const lat = reqNum(formData, "lat");
  const lon = reqNum(formData, "lon");
  const sortOrder = Math.trunc(reqNum(formData, "sort_order") || 0);
  const id = String(formData.get("id") ?? "").trim();

  const row = {
    course_id: courseId,
    hole_number: holeNumber,
    label,
    short_label: shortLabel || null,
    kind,
    lat,
    lon,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase
      .from("course_hole_reference_points")
      .update(row)
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("course_hole_reference_points")
      .insert(row);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/course-hole-points");
}

export async function deleteCourseHolePoint(formData: FormData) {
  const supabase = await createClient();
  const id = reqStr(formData, "id");
  const { error } = await supabase
    .from("course_hole_reference_points")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/course-hole-points");
}
