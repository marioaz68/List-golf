import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";

export const dynamic = "force-dynamic";

/** GET /api/captura/distancias/boundaries?course_id=
 *  Devuelve los polígonos calibrados de los 18 hoyos (los que dibujaste en Calibrar). */
export async function GET(request: NextRequest) {
  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("course_holes")
      .select("hole_number, boundary_geojson")
      .eq("course_id", courseId)
      .not("boundary_geojson", "is", null)
      .order("hole_number", { ascending: true });
    if (error) throw new Error(error.message);

    const boundaries = (data ?? []).map((r) => ({
      hole_number: Number(r.hole_number),
      polygon: r.boundary_geojson,
    }));

    return NextResponse.json({ ok: true, boundaries });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando polígonos";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
