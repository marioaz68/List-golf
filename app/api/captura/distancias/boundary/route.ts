import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import { loadHoleBoundary } from "@/lib/distances/calibrationStore";
import { parseBoundaryGeoJson } from "@/lib/distances/holeBoundary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hole = Number(request.nextUrl.searchParams.get("hole"));
  if (!Number.isFinite(hole) || hole < 1 || hole > 18) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }
  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const raw = await loadHoleBoundary(admin, courseId, hole);
    const polygon = parseBoundaryGeoJson(raw);
    return NextResponse.json({
      ok: true,
      saved: polygon != null,
      polygon,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando polígono";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
