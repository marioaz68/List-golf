import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadStrokeAggregateStandings } from "@/lib/matchplay/strokeAggregateStandings";

export const dynamic = "force-dynamic";

/**
 * GET /api/matchplay/stroke-aggregate-standings?tournament_id=
 *
 * Clasificación de consolación Stroke Play Agregado (neto suma de pareja).
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
    .select("is_public, name")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.is_public === false) {
    return NextResponse.json(
      { ok: false, error: "no disponible" },
      { status: 404 }
    );
  }

  try {
    const standings = await loadStrokeAggregateStandings(admin, tournamentId);
    return NextResponse.json({
      tournamentName: tournament.name ?? "Torneo",
      ...standings,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error cargando tabla",
      },
      { status: 500 }
    );
  }
}
