import { NextRequest, NextResponse } from "next/server";
import { loadCourseReferencePointsForHole } from "@/lib/distances/loadCourseReferencePoints";
import { defaultDistanciasCourseId } from "@/lib/distances/loadCourseReferencePoints";

export const dynamic = "force-dynamic";

/**
 * GET /api/captura/distancias/points?hole=1&course_id=uuid
 * Puntos nombrados del hoyo para la mini app de yardas (público).
 */
export async function GET(request: NextRequest) {
  const holeRaw = request.nextUrl.searchParams.get("hole")?.trim() ?? "1";
  const hole = Number(holeRaw);
  if (!Number.isFinite(hole) || hole < 1 || hole > 18) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  try {
    const points = await loadCourseReferencePointsForHole(courseId, hole);
    return NextResponse.json({
      ok: true,
      course_id: courseId,
      hole,
      points: points.map((p) => ({
        id: p.id,
        label: p.label,
        short_label: p.shortLabel,
        kind: p.kind,
        lat: p.lat,
        lon: p.lon,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando puntos";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
