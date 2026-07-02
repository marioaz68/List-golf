import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import { loadGreenOverrideForHole } from "@/lib/distances/loadGreenPoints";
import { loadHolePolygons } from "@/lib/distances/calibrationStore";
import { parseBoundaryGeoJson, ringFromPolygon, type LatLon } from "@/lib/distances/holeBoundary";
import {
  computeFlagPosition,
  type FlagColor,
  type FlagSide,
} from "@/lib/flags/pinSheetGeometry";
import {
  loadLatestFlagForHole,
  resolveFlagKeeper,
  saveFlagPosition,
} from "@/lib/flags/flagStore";

export const dynamic = "force-dynamic";

function parseHole(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 18 ? n : null;
}

/** Circunferencia calibrada del green del hoyo (anillo con más vértices). */
async function loadGreenRing(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
  hole: number
): Promise<LatLon[] | null> {
  try {
    const rows = await loadHolePolygons(admin, courseId, hole, "green");
    let best: LatLon[] | null = null;
    for (const r of rows) {
      const poly = parseBoundaryGeoJson(r.geojson);
      if (!poly) continue;
      const ring = ringFromPolygon(poly);
      if (ring.length >= 3 && (!best || ring.length > best.length)) best = ring;
    }
    return best;
  } catch {
    return null;
  }
}

async function loadKindRings(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
  hole: number,
  kind: "green" | "bunker"
): Promise<LatLon[][]> {
  try {
    const rows = await loadHolePolygons(admin, courseId, hole, kind);
    const out: LatLon[][] = [];
    for (const r of rows) {
      const poly = parseBoundaryGeoJson(r.geojson);
      if (!poly) continue;
      const ring = ringFromPolygon(poly);
      if (ring.length >= 3) out.push(ring);
    }
    return out;
  } catch {
    return [];
  }
}

const COLORS = new Set<FlagColor>(["roja", "blanca", "azul"]);
const SIDES = new Set<FlagSide>(["left", "right"]);

/** GET ?tg=&hole=&course_id= → geometría del green + bandera vigente. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tg = (url.searchParams.get("tg") ?? "").trim();
  const hole = parseHole(url.searchParams.get("hole"));
  const courseId = (url.searchParams.get("course_id") ?? "").trim() || CCQ_COURSE_ID;

  if (!hole) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const keeper = await resolveFlagKeeper(admin, tg);
  if (!keeper) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  try {
    const green = await loadGreenOverrideForHole(courseId, hole);
    const ring = await loadGreenRing(admin, courseId, hole);
    const bunkerRings = await loadKindRings(admin, courseId, hole, "bunker");
    const flag = await loadLatestFlagForHole(admin, courseId, hole);
    return NextResponse.json({
      ok: true,
      hole,
      greenCenter: green.center ?? null,
      greenFront: green.front ?? null,
      greenBack: green.back ?? null,
      greenRing: ring,
      bunkerRings,
      flag: flag
        ? {
            lat: flag.lat,
            lon: flag.lon,
            source: flag.source,
            effective_date: flag.effective_date,
            valid_until: flag.valid_until,
            color: flag.color,
            side: flag.side,
            depth_yards: flag.depth_yards,
            edge_yards: flag.edge_yards,
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando hoyo";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * POST {tg, course_id, hole, color, side, depth_yards, edge_yards, valid_until}
 * Captura por yardas: calcula lat/lon con la geometría del green y guarda.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const tg = String(body.tg ?? "").trim();
  const hole = parseHole(body.hole);
  const courseId = String(body.course_id ?? "").trim() || CCQ_COURSE_ID;
  const color = String(body.color ?? "").trim() as FlagColor;
  const side = String(body.side ?? "").trim() as FlagSide;
  const depthYards = Number(body.depth_yards);
  const edgeYards = Number(body.edge_yards);
  const validUntilRaw = String(body.valid_until ?? "").trim();
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validUntilRaw) ? validUntilRaw : null;

  if (!hole) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }
  if (!COLORS.has(color)) {
    return NextResponse.json({ ok: false, error: "color inválido" }, { status: 400 });
  }
  if (!SIDES.has(side)) {
    return NextResponse.json({ ok: false, error: "lado inválido" }, { status: 400 });
  }
  if (!Number.isFinite(depthYards) || depthYards < 0 || depthYards > 60) {
    return NextResponse.json({ ok: false, error: "yardas de profundidad inválidas" }, { status: 400 });
  }
  if (!Number.isFinite(edgeYards) || edgeYards < 0 || edgeYards > 40) {
    return NextResponse.json({ ok: false, error: "yardas a la orilla inválidas" }, { status: 400 });
  }

  const admin = createAdminClient();
  const keeper = await resolveFlagKeeper(admin, tg);
  if (!keeper) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  try {
    const green = await loadGreenOverrideForHole(courseId, hole);
    const ring = await loadGreenRing(admin, courseId, hole);
    const pos = computeFlagPosition(
      {
        front: green.front,
        back: green.back,
        center: green.center,
        ring,
      },
      { color, side, depthYards, edgeYards }
    );
    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "El green de este hoyo no está calibrado (frente/atrás)." },
        { status: 400 }
      );
    }

    await saveFlagPosition(admin, {
      courseId,
      hole,
      lat: pos.lat,
      lon: pos.lon,
      source: "yards",
      validUntil,
      chatId: tg,
      profileId: keeper.profileId,
      color,
      side,
      depthYards,
      edgeYards,
    });
    return NextResponse.json({ ok: true, lat: pos.lat, lon: pos.lon });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando bandera";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
