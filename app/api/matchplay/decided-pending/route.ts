import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { listDecidedPendingMatches } from "@/lib/matchplay/listDecidedPendingMatches";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/matchplay/decided-pending?tournament_id=...
 *
 * Devuelve la lista de matches del torneo cuyo derived decision ya es
 * concluyente (winner) pero que aún no fueron marcados como `completed`
 * en `matchplay_matches`. Estos son los que el comité puede cerrar desde
 * captura para mover al ganador al cuadro.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tournamentId = String(url.searchParams.get("tournament_id") ?? "").trim();
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
  if (!canAccessModule(roles, "score-entry")) {
    return NextResponse.json(
      { ok: false, error: "Sin permisos." },
      { status: 403 }
    );
  }

  try {
    const admin = createAdminClient();
    const matches = await listDecidedPendingMatches(admin, tournamentId);
    return NextResponse.json({ ok: true, matches });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Error listando matches.",
      },
      { status: 500 }
    );
  }
}
