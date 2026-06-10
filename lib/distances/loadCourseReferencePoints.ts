import { createAdminClient } from "@/utils/supabase/admin";
import {
  CCQ_COURSE_ID,
  rowToDbReferencePoint,
  type DbReferencePoint,
} from "@/lib/distances/courseReferencePoints";

export async function loadCourseReferencePoints(
  courseId: string
): Promise<DbReferencePoint[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_hole_reference_points")
    .select(
      "id, course_id, hole_number, label, short_label, kind, lat, lon, sort_order"
    )
    .eq("course_id", courseId)
    .order("hole_number", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) =>
    rowToDbReferencePoint(r as Record<string, unknown>)
  );
}

export async function loadCourseReferencePointsForHole(
  courseId: string,
  holeNumber: number
): Promise<DbReferencePoint[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("course_hole_reference_points")
    .select(
      "id, course_id, hole_number, label, short_label, kind, lat, lon, sort_order"
    )
    .eq("course_id", courseId)
    .eq("hole_number", holeNumber)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) =>
    rowToDbReferencePoint(r as Record<string, unknown>)
  );
}

export function defaultDistanciasCourseId(): string {
  return CCQ_COURSE_ID;
}
