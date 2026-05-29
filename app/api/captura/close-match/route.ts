import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { closeMatchAndAdvanceForGroup } from "@/lib/matchplay/closeAndAdvance";

export const dynamic = "force-dynamic";

/**
 * POST /api/captura/close-match
 * body: { group_id: string }
 *
 * Cierra el match del grupo (si ya está matemáticamente decidido) y
 * avanza al ganador al siguiente cuadro. Si el match siguiente queda
 * con ambas parejas, también crea la salida (pairing_group + tee time)
 * para esa fase en automático.
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
  const groupId = String(o.group_id ?? "").trim();
  if (!groupId) {
    return NextResponse.json(
      { ok: false, error: "Falta group_id." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await closeMatchAndAdvanceForGroup(admin, { groupId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error cerrando match.",
      },
      { status: 500 }
    );
  }
}
