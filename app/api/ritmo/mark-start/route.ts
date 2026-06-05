import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";
import { markGroupStarted, clearGroupStart } from "@/lib/ritmo/groupStart";

export const dynamic = "force-dynamic";

/**
 * POST /api/ritmo/mark-start
 *
 * Marca / edita / limpia la hora real de salida de un grupo (control de ritmo).
 * Pensado para que el comité lo use desde la pantalla de Ritmo en vivo cuando
 * no hay tee time oficial (match play R2+).
 *
 * body:
 *   { group_id, clear: true }                  → limpia la hora real
 *   { group_id, started_at: ISO }              → fija una hora específica (override)
 *   { group_id, time: "HH:MM", round_date }    → fija hora local Mx (-06:00)
 *   { group_id }                               → marca "ahora" (idempotente)
 */
export async function POST(req: Request) {
  // Permiso: módulo de ritmo (mismo gate que la pantalla).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });
  }
  const roles = await getUserRoles(supabase, user.id);
  if (!canAccessModule(roles, "ritmo")) {
    return NextResponse.json({ ok: false, error: "Sin permiso." }, { status: 403 });
  }

  let body: {
    group_id?: string;
    clear?: boolean;
    started_at?: string;
    time?: string;
    round_date?: string;
    force?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const groupId = String(body.group_id ?? "").trim();
  if (!groupId) {
    return NextResponse.json({ ok: false, error: "group_id requerido." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.clear) {
    const res = await clearGroupStart(admin, groupId);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, actualStartAt: null });
  }

  let startedAt: Date | undefined;
  if (body.started_at) {
    const d = new Date(body.started_at);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, error: "started_at inválido." }, { status: 400 });
    }
    startedAt = d;
  } else if (body.time && body.round_date) {
    // Hora local de Querétaro/México (UTC-6, sin horario de verano).
    const m = /^(\d{1,2}):(\d{2})$/.exec(body.time.trim());
    if (!m) {
      return NextResponse.json({ ok: false, error: "time debe ser HH:MM." }, { status: 400 });
    }
    const hh = String(m[1]).padStart(2, "0");
    const iso = `${body.round_date}T${hh}:${m[2]}:00-06:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, error: "Fecha/hora inválida." }, { status: 400 });
    }
    startedAt = d;
  }

  // force = true cuando se edita una hora explícita (sobrescribe la previa).
  const force = body.force ?? (startedAt != null);
  const res = await markGroupStarted(admin, groupId, { startedAt, force });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    actualStartAt: res.actualStartAt,
    alreadySet: res.alreadySet,
  });
}
