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

/** Tipos de polígono calibrable por hoyo (además de la línea azul del hoyo). */
export type HolePolygonKind =
  | "fairway"
  | "green"
  | "bunker"
  | "water"
  | "ob"
  | "centerline";

export interface HolePolygonRow {
  kind: HolePolygonKind;
  sort_order: number;
  geojson: unknown;
}

/** Carga todos los polígonos calibrados de un hoyo (fairway, green, etc.). */
export async function loadHolePolygons(
  admin: SupabaseClient,
  courseId: string,
  hole: number,
  kind?: HolePolygonKind
): Promise<HolePolygonRow[]> {
  let q = admin
    .from("course_hole_polygons")
    .select("kind, sort_order, geojson")
    .eq("course_id", courseId)
    .eq("hole_number", hole)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HolePolygonRow[];
}

/** Guarda (upsert) un polígono calibrado de un hoyo en su "slot" (kind+índice). */
export async function saveHolePolygon(
  admin: SupabaseClient,
  args: {
    courseId: string;
    hole: number;
    kind: HolePolygonKind;
    geojson: unknown;
    sortOrder?: number;
  }
): Promise<void> {
  const { courseId, hole, kind, geojson } = args;
  const sortOrder = args.sortOrder ?? 0;
  const { error } = await admin.from("course_hole_polygons").upsert(
    {
      course_id: courseId,
      hole_number: hole,
      kind,
      sort_order: sortOrder,
      geojson,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id,hole_number,kind,sort_order" }
  );
  if (error) throw new Error(error.message);
}

/** Borra un polígono calibrado de un hoyo. */
export async function deleteHolePolygon(
  admin: SupabaseClient,
  args: {
    courseId: string;
    hole: number;
    kind: HolePolygonKind;
    sortOrder?: number;
  }
): Promise<void> {
  const { courseId, hole, kind } = args;
  const sortOrder = args.sortOrder ?? 0;
  const { error } = await admin
    .from("course_hole_polygons")
    .delete()
    .eq("course_id", courseId)
    .eq("hole_number", hole)
    .eq("kind", kind)
    .eq("sort_order", sortOrder);
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

/** Guarda la posición de una salida (tee) por hoyo y color de marcadores. */
export async function saveTeePosition(
  admin: SupabaseClient,
  args: {
    courseId: string;
    hole: number;
    teeSetCode: string;
    lat: number;
    lon: number;
  }
): Promise<void> {
  const { courseId, hole, teeSetCode, lat, lon } = args;
  const { error } = await admin.from("course_hole_tee_positions").upsert(
    {
      course_id: courseId,
      hole_number: hole,
      tee_set_code: teeSetCode.trim().toUpperCase(),
      lat,
      lon,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id,hole_number,tee_set_code" }
  );
  if (error) throw new Error(error.message);
}
