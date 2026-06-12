import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import {
  deleteReferencePoint,
  saveReferencePoint,
} from "@/lib/distances/calibrationStore";

export const dynamic = "force-dynamic";

const KINDS = new Set(["bunker", "water", "dogleg", "hazard", "other", "custom"]);

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

  const kindRaw = String(body.kind ?? "other").trim();
  const kind = KINDS.has(kindRaw) ? kindRaw : "other";
  const label = String(body.label ?? "").trim();
  if (!label) {
    return NextResponse.json({ ok: false, error: "Falta nombre" }, { status: 400 });
  }
  const shortLabel = String(body.short_label ?? "").trim().slice(0, 6);

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false, error: "lat/lon inválidos" }, { status: 400 });
  }

  const courseId = String(body.course_id ?? "").trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const res = await saveReferencePoint(admin, {
      courseId,
      hole,
      kind,
      label,
      shortLabel,
      lat,
      lon,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando punto";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const tg = request.nextUrl.searchParams.get("tg")?.trim() ?? "";
  if (!isCalibrationAllowed(tg)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });
  }
  try {
    const admin = createAdminClient();
    await deleteReferencePoint(admin, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error eliminando punto";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
