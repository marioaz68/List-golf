import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import { loadGreenOverrideForHole } from "@/lib/distances/loadGreenPoints";
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

/** GET ?tg=&hole=&course_id= → centro del green + bandera vigente del hoyo. */
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
    const flag = await loadLatestFlagForHole(admin, courseId, hole);
    return NextResponse.json({
      ok: true,
      hole,
      greenCenter: green.center ? { lat: green.center.lat, lon: green.center.lon } : null,
      greenFront: green.front ? { lat: green.front.lat, lon: green.front.lon } : null,
      greenBack: green.back ? { lat: green.back.lat, lon: green.back.lon } : null,
      flag: flag
        ? {
            lat: flag.lat,
            lon: flag.lon,
            source: flag.source,
            effective_date: flag.effective_date,
            valid_until: flag.valid_until,
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error cargando hoyo";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** POST {tg, course_id, hole, lat, lon, note} → guarda el pin ajustado en mapa. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const tg = String(body.tg ?? "").trim();
  const hole = parseHole(body.hole);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const courseId = String(body.course_id ?? "").trim() || CCQ_COURSE_ID;
  const validUntilRaw = String(body.valid_until ?? "").trim();
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(validUntilRaw) ? validUntilRaw : null;

  if (!hole) {
    return NextResponse.json({ ok: false, error: "hole inválido" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: false, error: "lat/lon inválidos" }, { status: 400 });
  }

  const admin = createAdminClient();
  const keeper = await resolveFlagKeeper(admin, tg);
  if (!keeper) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
  }

  try {
    await saveFlagPosition(admin, {
      courseId,
      hole,
      lat,
      lon,
      source: "map",
      validUntil,
      chatId: tg,
      profileId: keeper.profileId,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error guardando bandera";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
