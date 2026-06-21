import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { saveTeePosition } from "@/lib/distances/calibrationStore";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import { normalizeTeeSetCode } from "@/lib/distances/teePositions";

export const dynamic = "force-dynamic";

/** GET salida calibrada de un hoyo/color (o default del catálogo). */
export async function GET(request: NextRequest) {
  const hole = Number(request.nextUrl.searchParams.get("hole"));
  const teeCode = normalizeTeeSetCode(
    request.nextUrl.searchParams.get("tee_code")
  );
  const courseId =
    request.nextUrl.searchParams.get("course_id")?.trim() ||
    defaultDistanciasCourseId();

  if (!Number.isFinite(hole) || hole < 1 || hole > 18) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("course_hole_tee_positions")
      .select("lat, lon, updated_at")
      .eq("course_id", courseId)
      .eq("hole_number", hole)
      .eq("tee_set_code", teeCode)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (data) {
      return NextResponse.json({
        ok: true,
        source: "db",
        tee_set_code: teeCode,
        lat: Number(data.lat),
        lon: Number(data.lon),
        updated_at: data.updated_at,
      });
    }

    const fallback = CCQ_HOLE_POINTS[hole]?.tee;
    if (!fallback) {
      return NextResponse.json({ ok: false, error: "Sin salida default" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      source: "default",
      tee_set_code: teeCode,
      lat: fallback.lat,
      lon: fallback.lon,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando salida";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

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

  const teeSetCode = normalizeTeeSetCode(String(body.tee_set_code ?? ""));
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false, error: "lat/lon inválidos" }, { status: 400 });
  }

  const courseId = String(body.course_id ?? "").trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    await saveTeePosition(admin, { courseId, hole, teeSetCode, lat, lon });
    return NextResponse.json({ ok: true, tee_set_code: teeSetCode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando salida";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
