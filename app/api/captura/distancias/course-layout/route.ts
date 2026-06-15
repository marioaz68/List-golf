import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  defaultDistanciasCourseId,
  loadGreenOverridesForCourse,
} from "@/lib/distances/loadGreenPoints";
import {
  hasGreenOverride,
  resolveHoleGreenPoints,
} from "@/lib/distances/greenPoints";

export const dynamic = "force-dynamic";

/** GET /api/captura/distancias/course-layout?course_id=
 *  Polígonos calibrados + greens de los 18 hoyos (una sola llamada al abrir Yardas). */
export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const [boundRes, overrides] = await Promise.all([
      admin
        .from("course_holes")
        .select("hole_number, boundary_geojson")
        .eq("course_id", courseId)
        .not("boundary_geojson", "is", null)
        .order("hole_number", { ascending: true }),
      loadGreenOverridesForCourse(courseId),
    ]);

    if (boundRes.error) throw new Error(boundRes.error.message);

    const boundaries = (boundRes.data ?? []).map((r) => ({
      hole_number: Number(r.hole_number),
      polygon: r.boundary_geojson,
    }));

    const overrideByHole = new Map(
      overrides.map((o) => [o.holeNumber, o])
    );
    const greens = Array.from({ length: 18 }, (_, i) => {
      const hole = i + 1;
      const override = overrideByHole.get(hole) ?? null;
      const resolved = resolveHoleGreenPoints(hole, override);
      return {
        hole_number: hole,
        source: override && hasGreenOverride(override) ? "db" : "default",
        front: resolved.front,
        center: resolved.center,
        back: resolved.back,
      };
    });

    return NextResponse.json({ ok: true, boundaries, greens });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando layout";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
