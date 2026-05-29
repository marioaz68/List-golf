import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { canAccessModule } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/captura/audit?group_id=...
 *
 * Devuelve la bitácora completa de scores de un grupo (todos los
 * jugadores, todos los hoyos, todas las acciones). Reservado para
 * comité/super_admin/club_admin.
 *
 * Estructura por entrada:
 *   {
 *     id, entry_id, hole_no, action, created_at,
 *     old_strokes, new_strokes, old_picked_up, new_picked_up,
 *     actor_role, actor_label, source
 *   }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = String(url.searchParams.get("group_id") ?? "").trim();
  if (!groupId) {
    return NextResponse.json(
      { ok: false, error: "Falta group_id." },
      { status: 400 }
    );
  }

  // Auth: cualquiera con captura-telegram puede ver auditoría de su torneo
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
  if (!canAccessModule(roles, "captura-telegram")) {
    return NextResponse.json(
      { ok: false, error: "Sin permisos." },
      { status: 403 }
    );
  }

  try {
    const admin = createAdminClient();

    // Resolver round y miembros del grupo
    const { data: groupRow } = await admin
      .from("pairing_groups")
      .select("id, round_id")
      .eq("id", groupId)
      .maybeSingle();
    if (!groupRow?.round_id) {
      return NextResponse.json(
        { ok: false, error: "Grupo no encontrado." },
        { status: 404 }
      );
    }
    const roundId = String(groupRow.round_id);

    const { data: membersRaw } = await admin
      .from("pairing_group_members")
      .select(
        `id, position, entry_id,
         tournament_entries ( id, player_number,
           players ( first_name, last_name ) )`
      )
      .eq("group_id", groupId)
      .order("position", { ascending: true });

    type MemberRaw = {
      id: string;
      position: number | null;
      entry_id: string | null;
      tournament_entries:
        | {
            id: string;
            player_number: number | null;
            players:
              | {
                  first_name: string | null;
                  last_name: string | null;
                }
              | { first_name: string | null; last_name: string | null }[]
              | null;
          }
        | null;
    };
    const players = ((membersRaw ?? []) as unknown as MemberRaw[])
      .map((m) => {
        const entry = Array.isArray(m.tournament_entries)
          ? m.tournament_entries[0]
          : m.tournament_entries;
        const p = entry?.players
          ? Array.isArray(entry.players)
            ? entry.players[0]
            : entry.players
          : null;
        return {
          entryId: String(m.entry_id ?? ""),
          position: m.position,
          playerNumber: entry?.player_number ?? null,
          name:
            [p?.first_name, p?.last_name]
              .map((s) => String(s ?? "").trim())
              .filter(Boolean)
              .join(" ") || "(sin nombre)",
        };
      })
      .filter((p) => p.entryId);

    const entryIds = players.map((p) => p.entryId);

    // Cargar bitácora del round, filtrando a los entries del grupo.
    let auditRows: Array<{
      id: string;
      entry_id: string;
      hole_no: number;
      action: string;
      old_strokes: number | null;
      new_strokes: number | null;
      old_picked_up: boolean | null;
      new_picked_up: boolean | null;
      old_pending_witness: boolean | null;
      new_pending_witness: boolean | null;
      actor_role: string | null;
      actor_entry_id: string | null;
      actor_caddie_id: string | null;
      actor_user_id: string | null;
      actor_label: string | null;
      source: string | null;
      created_at: string;
    }> = [];

    if (entryIds.length > 0) {
      const { data: a, error: auditErr } = await admin
        .from("hole_score_audit")
        .select(
          "id, entry_id, hole_no, action, old_strokes, new_strokes, old_picked_up, new_picked_up, old_pending_witness, new_pending_witness, actor_role, actor_entry_id, actor_caddie_id, actor_user_id, actor_label, source, created_at"
        )
        .eq("round_id", roundId)
        .in("entry_id", entryIds)
        .order("created_at", { ascending: true });
      if (auditErr) {
        // Tabla podría no existir si la migración no se aplicó
        return NextResponse.json({
          ok: true,
          players,
          entries: [],
          missingAuditTable: /relation .* does not exist/i.test(
            auditErr.message
          ),
          error: auditErr.message,
        });
      }
      auditRows = a ?? [];
    }

    return NextResponse.json({
      ok: true,
      groupId,
      roundId,
      players,
      entries: auditRows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : "Error cargando auditoría.",
      },
      { status: 500 }
    );
  }
}
