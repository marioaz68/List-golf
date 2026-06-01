import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { buildLiveStrokeSnapshot } from "@/lib/matchplay/buildLiveStrokeSnapshot";

export const dynamic = "force-dynamic";

/**
 * GET /api/matchplay/live-from-strokes?tournament_id=
 *
 * Recalcula puntos de match play desde `hole_scores` (captura rápida /
 * tarjeta). Usado por matches-vivo para actualizar en tiempo real sin
 * depender de `matchplay_hole_results`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tournamentId = (url.searchParams.get("tournament_id") ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, error: "tournament_id requerido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("is_public")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.is_public === false) {
    return NextResponse.json(
      { ok: false, error: "no disponible" },
      { status: 404 }
    );
  }

  try {
    const snapshot = await buildLiveStrokeSnapshot(admin, tournamentId);
    return NextResponse.json({
      ok: true,
      ...snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error derivando scores",
      },
      { status: 500 }
    );
  }
}
