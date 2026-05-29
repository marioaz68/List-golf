import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { autoPublishBracketFromPairings } from "@/lib/matchplay/autoPublishBracketFromPairings";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/auto-publish-from-pairings { tournament_id }
 *
 * Regenera el cuadro usando los grupos del pairing R1 como pares
 * iniciales. Útil cuando el comité ya armó las parejas en grupos para
 * R1 y el cuadro debe reflejar exactamente esos enfrentamientos.
 */
export async function POST(req: Request) {
  let body: { tournament_id?: string } = {};
  try {
    body = (await req.json()) as { tournament_id?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido." },
      { status: 400 }
    );
  }
  const tournamentId = String(body.tournament_id ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, error: "Falta tournament_id." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "No autenticado." },
      { status: 401 }
    );
  }
  const roles = await getUserRoles(supabase, user.id);
  if (
    !canAccessModule(roles, "score-entry") &&
    !canAccessModule(roles, "tournaments-setup") &&
    !canAccessModule(roles, "tournaments")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sin permisos para regenerar el cuadro." },
      { status: 403 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await autoPublishBracketFromPairings(admin, tournamentId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error regenerando el cuadro.",
      },
      { status: 500 }
    );
  }
}
