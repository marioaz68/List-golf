import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { backfillConsolationLosersFromRound } from "@/lib/matchplay/consolationMatchPlay";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/backfill-consolation
 * Body: { tournament_id, round_no? }
 *
 * Enruta perdedores ya cerrados hacia consolación MP (ej. R3 → R4 G3–G4).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tournament_id?: string;
      round_no?: number;
    };
    const tournamentId = String(body.tournament_id ?? "").trim();
    if (!tournamentId) {
      return NextResponse.json(
        { ok: false, error: "tournament_id requerido" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const result = await backfillConsolationLosersFromRound(
      admin,
      tournamentId,
      body.round_no
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error en backfill",
      },
      { status: 500 }
    );
  }
}
