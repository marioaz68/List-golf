"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function reqStr(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new Error(`Falta ${key}`);
  return v;
}

function reqInt(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en ${key}`);
  return Math.trunc(n);
}

function normalizePar(n: number) {
  if (n < 3 || n > 6) throw new Error("Par inválido. Debe estar entre 3 y 6.");
  return n;
}

function normalizeHcp(n: number) {
  if (n < 1 || n > 18) {
    throw new Error("HCP del hoyo inválido. Debe estar entre 1 y 18.");
  }
  return n;
}

function buildDefaultHoleRows(courseId: string) {
  const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];

  return Array.from({ length: 18 }, (_, i) => ({
    course_id: courseId,
    hole_number: i + 1,
    par: pars[i] ?? 4,
    handicap_index: i + 1,
  }));
}

export async function seedCourseHoles(formData: FormData) {
  const supabase = await createClient();
  const courseId = reqStr(formData, "course_id");

  const defaults = buildDefaultHoleRows(courseId);

  const { error } = await supabase
    .from("course_holes")
    .upsert(defaults, {
      onConflict: "course_id,hole_number",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/course-holes");
  redirect(`/course-holes?course_id=${courseId}`);
}

export async function saveCourseHoles(formData: FormData) {
  const supabase = await createClient();
  const courseId = reqStr(formData, "course_id");

  const rows = Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const par = normalizePar(reqInt(formData, `par_${hole}`));
    const handicap_index = normalizeHcp(reqInt(formData, `hcp_${hole}`));

    return {
      course_id: courseId,
      hole_number: hole,
      par,
      handicap_index,
    };
  });

  const { error } = await supabase
    .from("course_holes")
    .upsert(rows, {
      onConflict: "course_id,hole_number",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/course-holes");
  redirect(`/course-holes?course_id=${courseId}`);
}