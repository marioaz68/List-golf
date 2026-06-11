import { NextRequest, NextResponse } from "next/server";
import {
  defaultDistanciasCourseId,
  loadGreenOverrideForHole,
} from "@/lib/distances/loadGreenPoints";

export const dynamic = "force-dynamic";

/**
 * GET /api/captura/distancias/greens?hole=1&course_id=uuid
 * Coordenadas calibradas del green (entrada/centro/atrás) para yardas.
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
    const data = await loadGreenOverrideForHole(courseId, hole);
    return NextResponse.json({ ok: true, course_id: courseId, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando green";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
