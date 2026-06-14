import type { SupabaseClient } from "@supabase/supabase-js";
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";

export type GreenKey = "front" | "center" | "back";

const GREEN_COLUMNS: Record<GreenKey, { lat: string; lon: string }> = {
  front: { lat: "green_front_lat", lon: "green_front_lon" },
  center: { lat: "green_center_lat", lon: "green_center_lon" },
  back: { lat: "green_back_lat", lon: "green_back_lon" },
};

/** Guarda un punto del green (entrada/centro/atrás) sin tocar los demás. */
export async function saveGreenPoint(
  admin: SupabaseClient,
  args: { courseId: string; hole: number; key: GreenKey; lat: number; lon: number }
): Promise<void> {
  const { courseId, hole, key, lat, lon } = args;
  const cols = GREEN_COLUMNS[key];
  if (!cols) throw new Error("Punto de green inválido");

  const { data: existing, error: selErr } = await admin
    .from("course_holes")
    .select("id, par, handicap_index")
    .eq("course_id", courseId)
    .eq("hole_number", hole)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  if (existing) {
    const { error } = await admin
      .from("course_holes")
      .update({ [cols.lat]: lat, [cols.lon]: lon })
      .eq("id", (existing as { id: string }).id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("course_holes").insert({
    course_id: courseId,
    hole_number: hole,
    par: CCQ_HOLE_POINTS[hole]?.par ?? 4,
    handicap_index: hole,
    [cols.lat]: lat,
    [cols.lon]: lon,
  });
  if (error) throw new Error(error.message);
}

/** Inserta una trampa/obstáculo en course_hole_reference_points. */
export async function saveReferencePoint(
  admin: SupabaseClient,
  args: {
    courseId: string;
    hole: number;
    kind: string;
    label: string;
    shortLabel: string;
    lat: number;
    lon: number;
  }
): Promise<{ id: string }> {
  const { courseId, hole, kind, label, shortLabel, lat, lon } = args;

  const { count } = await admin
    .from("course_hole_reference_points")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("hole_number", hole);

  const { data, error } = await admin
    .from("course_hole_reference_points")
    .insert({
      course_id: courseId,
      hole_number: hole,
      label,
      short_label: shortLabel || null,
      kind,
      lat,
      lon,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

export async function deleteReferencePoint(
  admin: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await admin
    .from("course_hole_reference_points")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Mueve un punto de referencia ya guardado (arrastre en mapa). */
export async function updateReferencePoint(
  admin: SupabaseClient,
  args: { id: string; lat: number; lon: number }
): Promise<void> {
  const { error } = await admin
    .from("course_hole_reference_points")
    .update({ lat: args.lat, lon: args.lon })
    .eq("id", args.id);
  if (error) throw new Error(error.message);
}

/** Carga polígono calibrado del hoyo (null = usar el del código). */
export async function loadHoleBoundary(
  admin: SupabaseClient,
  courseId: string,
  hole: number
): Promise<unknown | null> {
  const { data, error } = await admin
    .from("course_holes")
    .select("boundary_geojson")
    .eq("course_id", courseId)
    .eq("hole_number", hole)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { boundary_geojson?: unknown } | null)?.boundary_geojson ?? null;
}

/** Guarda el polígono calibrado del hoyo. */
export async function saveHoleBoundary(
  admin: SupabaseClient,
  args: {
    courseId: string;
    hole: number;
    boundaryGeojson: unknown;
  }
): Promise<void> {
  const { courseId, hole, boundaryGeojson } = args;
  const { data: existing, error: selErr } = await admin
    .from("course_holes")
    .select("id, par, handicap_index")
    .eq("course_id", courseId)
    .eq("hole_number", hole)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  if (existing) {
    const { error } = await admin
      .from("course_holes")
      .update({ boundary_geojson: boundaryGeojson })
      .eq("id", (existing as { id: string }).id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("course_holes").insert({
    course_id: courseId,
    hole_number: hole,
    par: CCQ_HOLE_POINTS[hole]?.par ?? 4,
    handicap_index: hole,
    boundary_geojson: boundaryGeojson,
  });
  if (error) throw new Error(error.message);
}
