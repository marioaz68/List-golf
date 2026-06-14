import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import { saveHoleBoundary } from "@/lib/distances/calibrationStore";
import { parseBoundaryGeoJson } from "@/lib/distances/holeBoundary";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const tg = String(body.tg ?? "").trim();
  if (!isCalibrationAllowed(tg)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  const hole = Number(body.hole);
  if (!Number.isFinite(hole) || hole < 1 || hole > 18) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  const polygon = parseBoundaryGeoJson(body.polygon);
  if (!polygon) {
    return NextResponse.json(
      { ok: false, error: "polygon inválido" },
      { status: 400 }
    );
  }

  const courseId = String(body.course_id ?? "").trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    await saveHoleBoundary(admin, {
      courseId,
      hole,
      boundaryGeojson: polygon,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando polígono";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
