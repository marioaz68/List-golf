import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { defaultDistanciasCourseId } from "@/lib/distances/loadGreenPoints";
import {
  deleteHolePolygon,
  loadHolePolygons,
  saveHolePolygon,
  type HolePolygonKind,
} from "@/lib/distances/calibrationStore";
import { parseBoundaryGeoJson } from "@/lib/distances/holeBoundary";
import { parseCenterlineGeo } from "@/lib/distances/centerline";

export const dynamic = "force-dynamic";

const KINDS = new Set<HolePolygonKind>([
  "fairway",
  "green",
  "bunker",
  "water",
  "ob",
  "centerline",
]);

function parseHole(v: string | null): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

/** GET: lista los polígonos calibrados de un hoyo (opcionalmente por tipo). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const hole = parseHole(sp.get("hole"));
  if (hole == null) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }
  const kindRaw = sp.get("kind");
  const kind = kindRaw && KINDS.has(kindRaw as HolePolygonKind)
    ? (kindRaw as HolePolygonKind)
    : undefined;
  const courseId = sp.get("course_id")?.trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    const rows = await loadHolePolygons(admin, courseId, hole, kind);
    return NextResponse.json({ ok: true, polygons: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando polígonos";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** POST: guarda (upsert) un polígono de un hoyo en su slot (kind + índice). */
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

  const hole = parseHole(String(body.hole ?? ""));
  if (hole == null) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  const kind = String(body.kind ?? "") as HolePolygonKind;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "kind inválido" }, { status: 400 });
  }

  // El fairway/green/etc. son polígonos; la centerline es una línea (LineString).
  const geojson =
    kind === "centerline"
      ? parseCenterlineGeo(body.polygon)
      : parseBoundaryGeoJson(body.polygon);
  if (!geojson) {
    return NextResponse.json(
      { ok: false, error: kind === "centerline" ? "línea inválida" : "polygon inválido" },
      { status: 400 }
    );
  }

  const sortOrder = Number(body.sort_order ?? 0);
  const courseId = String(body.course_id ?? "").trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    await saveHolePolygon(admin, {
      courseId,
      hole,
      kind,
      geojson,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando polígono";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** DELETE: borra un polígono de un hoyo (por kind + índice). */
export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tg = String(sp.get("tg") ?? "").trim();
  if (!isCalibrationAllowed(tg)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }
  const hole = parseHole(sp.get("hole"));
  if (hole == null) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }
  const kind = String(sp.get("kind") ?? "") as HolePolygonKind;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "kind inválido" }, { status: 400 });
  }
  const sortOrder = Number(sp.get("sort_order") ?? 0);
  const courseId = sp.get("course_id")?.trim() || defaultDistanciasCourseId();

  try {
    const admin = createAdminClient();
    await deleteHolePolygon(admin, {
      courseId,
      hole,
      kind,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error borrando polígono";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
