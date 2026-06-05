import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { saveCapturaPosition } from "@/lib/captura/positionFromActor";

export const dynamic = "force-dynamic";

/**
 * POST /api/captura/position
 *
 * Recibe pings GPS desde la Mini App de captura (navegador del caddie o
 * jugador). Lo manda el componente <GpsChip> cada ~30 s mientras el chip
 * está activo.
 *
 * Body:
 *   {
 *     entry_id?: string,    // jugador (uuid)
 *     caddie_id?: string,   // caddie (uuid)
 *     group_id?: string,    // hint del URL para respaldar contexto
 *     lat: number,
 *     lon: number,
 *     accuracy?: number     // metros (informativo, no se guarda por ahora)
 *   }
 *
 * Responde { ok, hoyo, group_id, tournament_id } o { ok: false, error }.
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
  const entryId = norm(o.entry_id) ?? norm(o.me) ?? norm(o.me_entry_id);
  const caddieId = norm(o.caddie_id) ?? norm(o.caddie);
  const groupIdHint = norm(o.group_id);
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  const accuracy =
    o.accuracy != null && Number.isFinite(Number(o.accuracy))
      ? Number(o.accuracy)
      : null;

  if (!entryId && !caddieId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id o caddie_id." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { ok: false, error: "lat/lon inválidos." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const result = await saveCapturaPosition(admin, {
    entryId,
    caddieId,
    groupIdHint,
    lat,
    lon,
    accuracy,
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
    group_id: result.groupId,
    tournament_id: result.tournamentId,
  });
}
