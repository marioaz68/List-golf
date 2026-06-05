import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

type Item = { group_id: string; group_no: number; tee_time: string | null };

/**
 * POST /api/ritmo/group-schedule
 *
 * Fija el ORDEN (group_no) y la HORA DE SALIDA programada (tee_time) de los
 * grupos de una ronda, desde la pantalla de Ritmo en vivo. Útil en match play
 * R2+ donde no hubo tee sheet oficial: el comité define en qué orden y a qué
 * hora va saliendo cada grupo.
 *
 * No toca actual_start_at (la "salida real" se marca aparte con "Salió ahora").
 *
 * body: { round_id, items: [{ group_id, group_no, tee_time }] }
 */
export async function POST(req: Request) {
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

  let body: { round_id?: string; items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const roundId = String(body.round_id ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!roundId || items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "round_id e items requeridos." },
      { status: 400 }
    );
  }

  // Normalizar y validar tee_time (HH:MM) y group_no.
  const normalized: Item[] = [];
  for (const it of items) {
    const gid = String(it.group_id ?? "").trim();
    if (!gid) continue;
    const groupNo = Math.trunc(Number(it.group_no));
    if (!Number.isFinite(groupNo) || groupNo < 1) {
      return NextResponse.json(
        { ok: false, error: "Cada grupo necesita un orden válido (≥1)." },
        { status: 400 }
      );
    }
    let tee: string | null = null;
    const raw = String(it.tee_time ?? "").trim();
    if (raw) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: `Hora inválida: ${raw} (usa HH:MM).` },
          { status: 400 }
        );
      }
      tee = `${String(m[1]).padStart(2, "0")}:${m[2]}`;
    }
    normalized.push({ group_id: gid, group_no: groupNo, tee_time: tee });
  }

  // Órdenes duplicados → error (el orden debe ser único).
  const orders = normalized.map((n) => n.group_no);
  if (new Set(orders).size !== orders.length) {
    return NextResponse.json(
      { ok: false, error: "Hay órdenes repetidos. Cada grupo debe tener un número distinto." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Validar que todos los grupos pertenecen a la ronda.
  const ids = normalized.map((n) => n.group_id);
  const { data: existing } = await admin
    .from("pairing_groups")
    .select("id, round_id")
    .in("id", ids);
  const valid = new Set(
    (existing ?? [])
      .filter((g) => String(g.round_id) === roundId)
      .map((g) => String(g.id))
  );
  const allValid = normalized.every((n) => valid.has(n.group_id));
  if (!allValid) {
    return NextResponse.json(
      { ok: false, error: "Algún grupo no pertenece a la ronda." },
      { status: 400 }
    );
  }

  // Fase 1: mover group_no a valores temporales negativos (evita choque con la
  // restricción única (round_id, group_no) al reordenar).
  for (let i = 0; i < normalized.length; i++) {
    const { error } = await admin
      .from("pairing_groups")
      .update({ group_no: -1000 - i })
      .eq("id", normalized[i].group_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: "Error reordenando (fase 1): " + error.message },
        { status: 500 }
      );
    }
  }

  // Fase 2: valores finales (group_no + tee_time).
  for (const n of normalized) {
    const { error } = await admin
      .from("pairing_groups")
      .update({ group_no: n.group_no, tee_time: n.tee_time })
      .eq("id", n.group_id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: "Error guardando (fase 2): " + error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, updated: normalized.length });
}
