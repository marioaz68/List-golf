import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { repairMatchplayFromR1 } from "@/lib/matchplay/repairMatchplayFromR1";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/repair-from-r1 { tournament_id }
 *
 * Regenera el cuadro desde grupos R1, cierra matches decididos y limpia
 * avances incorrectos (p. ej. cruces en R3 que no se jugaron).
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
      { ok: false, error: "Sin permisos." },
      { status: 403 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await repairMatchplayFromR1(admin, tournamentId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error reparando el cuadro.",
      },
      { status: 500 }
    );
  }
}
