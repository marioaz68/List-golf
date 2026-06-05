import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { STROKE_AGG_NOTES_PREFIX } from "@/lib/matchplay/consolationStrokePlay";

export const dynamic = "force-dynamic";

/**
 * POST /api/matchplay/stroke-aggregate-move
 * body: { tournament_id, entry_id, to_group_id, target_position }
 *
 * Mueve un jugador entre las salidas (foursomes) de la consolación Stroke
 * Play Agregado. Solo toca los grupos cuyo `notes` empieza con
 * "STROKE AGREGADO · " — NO recalcula tee times ni compacta las finales
 * principal/consolación que comparten la misma ronda.
 */
export async function POST(req: Request) {
  let body: {
    tournament_id?: string;
    entry_id?: string;
    to_group_id?: string;
    target_position?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const tournamentId = String(body.tournament_id ?? "").trim();
  const entryId = String(body.entry_id ?? "").trim();
  const toGroupId = String(body.to_group_id ?? "").trim();
  const targetPosition = Math.max(1, Math.trunc(Number(body.target_position ?? 1)) || 1);

  if (!tournamentId || !entryId || !toGroupId) {
    return NextResponse.json(
      { ok: false, error: "tournament_id, entry_id y to_group_id son requeridos" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Validar que el grupo destino es STROKE AGREGADO y pertenece al torneo.
  const { data: destGroup } = await admin
    .from("pairing_groups")
    .select("id, round_id, notes, rounds!inner(tournament_id)")
    .eq("id", toGroupId)
    .maybeSingle();

  const destNotes = String(destGroup?.notes ?? "");
  const destRound = destGroup?.rounds as
    | { tournament_id?: string }
    | { tournament_id?: string }[]
    | null;
  const destRoundObj = Array.isArray(destRound) ? destRound[0] : destRound;

  if (
    !destGroup ||
    !destNotes.startsWith(STROKE_AGG_NOTES_PREFIX) ||
    String(destRoundObj?.tournament_id ?? "") !== tournamentId
  ) {
    return NextResponse.json(
      { ok: false, error: "Grupo destino no es una salida válida de Stroke Agregado." },
      { status: 400 }
    );
  }
  const roundId = String(destGroup.round_id);

  // 2. Conjunto de grupos STROKE AGREGADO de esa ronda (scope del movimiento).
  const { data: strokeGroups } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", roundId)
    .ilike("notes", `${STROKE_AGG_NOTES_PREFIX}%`);
  const strokeGroupIds = new Set((strokeGroups ?? []).map((g) => String(g.id)));
  if (!strokeGroupIds.has(toGroupId)) {
    return NextResponse.json(
      { ok: false, error: "Grupo destino fuera de alcance." },
      { status: 400 }
    );
  }

  // 3. Quitar al jugador SOLO de los grupos stroke (no toca finales MP).
  await admin
    .from("pairing_group_members")
    .delete()
    .eq("entry_id", entryId)
    .in("group_id", Array.from(strokeGroupIds));

  // 4. Leer destino e insertar en la posición pedida.
  const { data: destMembers } = await admin
    .from("pairing_group_members")
    .select("entry_id, position")
    .eq("group_id", toGroupId)
    .order("position", { ascending: true });
  const ordered = (destMembers ?? []).map((m) => String(m.entry_id));
  const insertAt = Math.min(targetPosition - 1, ordered.length);
  ordered.splice(insertAt, 0, entryId);

  await admin.from("pairing_group_members").delete().eq("group_id", toGroupId);
  const { error: insErr } = await admin.from("pairing_group_members").insert(
    ordered.map((id, i) => ({
      group_id: toGroupId,
      entry_id: id,
      position: i + 1,
    }))
  );
  if (insErr) {
    return NextResponse.json(
      { ok: false, error: "Error reordenando grupo destino: " + insErr.message },
      { status: 500 }
    );
  }

  // 5. Renumerar posiciones de los demás grupos stroke (compactar huecos).
  for (const gid of strokeGroupIds) {
    if (gid === toGroupId) continue;
    const { data: rows } = await admin
      .from("pairing_group_members")
      .select("entry_id, position")
      .eq("group_id", gid)
      .order("position", { ascending: true });
    const list = (rows ?? []).map((r) => String(r.entry_id));
    const needsRenumber = (rows ?? []).some((r, i) => Number(r.position) !== i + 1);
    if (list.length > 0 && needsRenumber) {
      await admin.from("pairing_group_members").delete().eq("group_id", gid);
      await admin.from("pairing_group_members").insert(
        list.map((id, i) => ({ group_id: gid, entry_id: id, position: i + 1 }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}
