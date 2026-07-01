import { createAdminClient } from "@/utils/supabase/admin";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import {
  hasGreenOverride,
  resolveHoleGreenPoints,
  rowToGreenOverride,
  type HoleGreenOverride,
} from "@/lib/distances/greenPoints";
import { loadLatestFlagForHole } from "@/lib/flags/flagStore";

export async function loadGreenOverridesForCourse(
  courseId: string
): Promise<HoleGreenOverride[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_holes")
    .select(
      "hole_number, green_front_lat, green_front_lon, green_center_lat, green_center_lon, green_back_lat, green_back_lon"
    )
    .eq("course_id", courseId)
    .order("hole_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) =>
    rowToGreenOverride(r as Record<string, unknown>)
  );
}

export async function loadGreenOverrideForHole(
  courseId: string,
  holeNumber: number
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_holes")
    .select(
      "hole_number, green_front_lat, green_front_lon, green_center_lat, green_center_lon, green_back_lat, green_back_lon"
    )
    .eq("course_id", courseId)
    .eq("hole_number", holeNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const override = data
    ? rowToGreenOverride(data as Record<string, unknown>)
    : null;
  const resolved = resolveHoleGreenPoints(holeNumber, override);

  // Bandera del día: si el hoyo tiene una posición de bandera capturada, el
  // "centro" (objetivo principal de Yardas) apunta a la bandera. Si NO hay
  // bandera, se queda con el centro del green calibrado (comportamiento previo).
  const flag = await loadLatestFlagForHole(admin, courseId, holeNumber);
  const usingFlag = !!flag;
  const center = usingFlag
    ? { lat: flag!.lat, lon: flag!.lon }
    : resolved.center;

  return {
    hole: holeNumber,
    // source "db" hace que el cliente use front/center/back que devolvemos.
    // Lo forzamos también cuando hay bandera, aunque el green no esté calibrado.
    source: (override && hasGreenOverride(override)) || usingFlag ? "db" : "default",
    saved: {
      front: !!override?.front,
      center: !!override?.center,
      back: !!override?.back,
    },
    front: resolved.front,
    center,
    back: resolved.back,
    // Metadatos de la bandera del día (para indicador "🚩 pin del día").
    pin: usingFlag ? { lat: flag!.lat, lon: flag!.lon } : null,
    pinFromFlag: usingFlag,
    flagDate: flag?.effective_date ?? null,
  };
}

export function defaultDistanciasCourseId(): string {
  return CCQ_COURSE_ID;
}
