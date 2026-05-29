import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { autoPublishBracket } from "@/lib/matchplay/autoPublishBracket";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/auto-publish  { tournament_id }
 *
 * Genera y publica el cuadro de match play en un solo paso, sin pasar
 * por /matchplay. Pensado para que desde `/score-entry` (panel de
 * matches decididos sin cerrar) el comité publique el bracket con un
 * clic, sin perderse en el menú general de configuración.
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
      { ok: false, error: "Sin permisos para publicar el cuadro." },
      { status: 403 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await autoPublishBracket(admin, tournamentId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error publicando el cuadro.",
      },
      { status: 500 }
    );
  }
}
