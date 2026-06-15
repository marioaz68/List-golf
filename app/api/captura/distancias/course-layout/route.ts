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
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import {
  defaultCenterline,
  waypointsFromLine,
} from "@/lib/distances/centerline";

export const dynamic = "force-dynamic";

/** GET /api/captura/distancias/course-layout?course_id=
 *  Polígonos calibrados + greens de los 18 hoyos (una sola llamada al abrir Yardas). */
export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const [boundRes, overrides, clRes] = await Promise.all([
      admin
        .from("course_holes")
        .select("hole_number, boundary_geojson")
        .eq("course_id", courseId)
        .not("boundary_geojson", "is", null)
        .order("hole_number", { ascending: true }),
      loadGreenOverridesForCourse(courseId),
      admin
        .from("course_hole_polygons")
        .select("hole_number, geojson")
        .eq("course_id", courseId)
        .eq("kind", "centerline"),
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

    // Centerlines calibradas; si un hoyo no tiene, se genera una por defecto
    // (recta salida→green según par) para que Yardas funcione de una vez.
    const clByHole = new Map<number, { lat: number; lon: number }[]>();
    if (!clRes.error) {
      for (const row of clRes.data ?? []) {
        const wps = waypointsFromLine(row.geojson);
        if (wps.length >= 2) clByHole.set(Number(row.hole_number), wps);
      }
    }
    const centerlines = greens.map((g) => {
      const calibrated = clByHole.get(g.hole_number);
      if (calibrated) {
        return { hole_number: g.hole_number, source: "db", waypoints: calibrated };
      }
      const hp = CCQ_HOLE_POINTS[g.hole_number];
      const tee = hp?.tee;
      const par = hp?.par ?? 4;
      const waypoints = tee
        ? defaultCenterline(tee, g.center, g.back ?? null, par)
        : [g.center];
      return { hole_number: g.hole_number, source: "default", waypoints };
    });

    return NextResponse.json({ ok: true, boundaries, greens, centerlines });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando layout";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
