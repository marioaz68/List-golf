import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import { saveGreenPoint, type GreenKey } from "@/lib/distances/calibrationStore";

export const dynamic = "force-dynamic";

const KEYS = new Set<GreenKey>(["front", "center", "back"]);

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

  const key = String(body.key ?? "") as GreenKey;
  if (!KEYS.has(key)) {
    return NextResponse.json({ ok: false, error: "key inválido" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false, error: "lat/lon inválidos" }, { status: 400 });
  }

  const courseId = String(body.course_id ?? "").trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    await saveGreenPoint(admin, { courseId, hole, key, lat, lon });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando green";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
