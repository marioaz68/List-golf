import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import { loadGreenOverrideForHole } from "@/lib/distances/loadGreenPoints";
import { loadHolePolygons } from "@/lib/distances/calibrationStore";
import {
  parseBoundaryGeoJson,
  ringFromPolygon,
  type LatLon,
} from "@/lib/distances/holeBoundary";
import { loadLatestFlagForHole } from "@/lib/flags/flagStore";

export const dynamic = "force-dynamic";

/**
 * Lectura PÚBLICA de la posición de la bandera vigente de un hoyo (para que el
 * jugador la vea en Yardas). Solo lectura; no requiere rol de encargado.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const holeRaw = Number(url.searchParams.get("hole"));
  const hole = Number.isInteger(holeRaw) && holeRaw >= 1 && holeRaw <= 18 ? holeRaw : null;
  const courseId = (url.searchParams.get("course_id") ?? "").trim() || CCQ_COURSE_ID;

  if (!hole) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const green = await loadGreenOverrideForHole(courseId, hole);

    let ring: LatLon[] | null = null;
    try {
      const rows = await loadHolePolygons(admin, courseId, hole, "green");
      for (const r of rows) {
        const poly = parseBoundaryGeoJson(r.geojson);
        if (!poly) continue;
        const rr = ringFromPolygon(poly);
        if (rr.length >= 3 && (!ring || rr.length > ring.length)) ring = rr;
      }
    } catch {
      ring = null;
    }

    const flag = await loadLatestFlagForHole(admin, courseId, hole);
    return NextResponse.json({
      ok: true,
      hole,
      greenCenter: green.center ?? null,
      greenFront: green.front ?? null,
      greenBack: green.back ?? null,
      greenRing: ring,
      flag: flag
        ? {
            lat: flag.lat,
            lon: flag.lon,
            color: flag.color,
            side: flag.side,
            depth_yards: flag.depth_yards,
            edge_yards: flag.edge_yards,
            effective_date: flag.effective_date,
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
