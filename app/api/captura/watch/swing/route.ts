import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { parseWatchSwingMetrics, saveWatchSwing } from "@/lib/captura/saveWatchSwing";

export const dynamic = "force-dynamic";

/**
 * POST /api/captura/watch/swing
 *
 * Registra un swing detectado por Apple Watch (reenviado por el iPhone).
 *
 * Body:
 *   {
 *     entry_id?: string,
 *     caddie_id?: string,
 *     lat: number,
 *     lon: number,
 *     swing_no?: number,
 *     detected_at?: string,
 *     backswing_velocity_dps?: number,
 *     forwardswing_velocity_dps?: number,
 *     backswing_club_deg?: number,
 *     forward_club_deg?: number
 *   }
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 }
    );
  }

  const o = body as Record<string, unknown>;
  const norm = (v: unknown): string | null => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const entryId = norm(o.entry_id);
  const caddieId = norm(o.caddie_id);
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  const swingNo =
    o.swing_no != null && Number.isFinite(Number(o.swing_no))
      ? Number(o.swing_no)
      : null;
  const detectedAt = norm(o.detected_at);
  const swingMetrics = parseWatchSwingMetrics(o);

  if (!entryId && !caddieId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id o caddie_id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const result = await saveWatchSwing(admin, {
    entryId,
    caddieId,
    lat,
    lon,
    swingNo,
    detectedAt,
    swingMetrics,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    hoyo: result.hoyo,
    id: result.id,
    swingMetrics: result.swingMetrics ?? null,
    yardage: result.yardage ?? null,
  });
}
