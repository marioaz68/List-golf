import { createAdminClient } from "@/utils/supabase/admin";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import {
  hasGreenOverride,
  resolveHoleGreenPoints,
  rowToGreenOverride,
  type HoleGreenOverride,
} from "@/lib/distances/greenPoints";

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
  return {
    hole: holeNumber,
    source: override && hasGreenOverride(override) ? "db" : "default",
    front: resolved.front,
    center: resolved.center,
    back: resolved.back,
  };
}

export function defaultDistanciasCourseId(): string {
  return CCQ_COURSE_ID;
}
