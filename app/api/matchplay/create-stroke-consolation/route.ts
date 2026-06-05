import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createStrokeAggregateGroups } from "@/lib/matchplay/consolationStrokePlay";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/create-stroke-consolation
 * Body: { tournament_id, group_size?, replace? }
 *
 * Crea las salidas de Stroke Play Agregado (consolación) en la última ronda:
 * perdedores de R1, R2 y consolación Match Play, en foursomes random por
 * género (grupos de 4).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tournament_id?: string;
      group_size?: number;
      replace?: boolean;
    };
    const tournamentId = String(body.tournament_id ?? "").trim();
    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "tournament_id requerido" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const result = await createStrokeAggregateGroups(admin, tournamentId, {
      groupSize: body.group_size,
      replace: body.replace,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error creando salidas",
      },
      { status: 500 }
    );
  }
}
