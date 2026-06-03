import type { SupabaseClient } from "@supabase/supabase-js";
import { revertMatchAdvanceForGroup } from "@/lib/matchplay/revertMatchAdvanceForGroup";
import type { StaffCloseEntryParams } from "@/lib/score-entry/closeMatchPlayGroupRound";

export type ReopenMatchPlayGroupRoundResult =
  | {
      ok: true;
      openedCount: number;
      alreadyOpenCount: number;
      bracketReverted: boolean;
      nextGroupRemoved: boolean;
      message: string;
    }
  | { ok: false; error: string };

type StaffOpenEntryParams = Omit<StaffCloseEntryParams, "minHolesRequired">;

/**
 * Abre las 4 tarjetas del grupo, revierte el cierre del match en el cuadro
 * y quita la salida auto-generada de la ronda siguiente para poder corregir
 * scores y volver a cerrar (regenera salidas/grupos al re-cerrar).
 */
export async function reopenMatchPlayGroupRound(
  admin: SupabaseClient,
  staffOpenEntry: (
    admin: SupabaseClient,
    params: StaffOpenEntryParams
  ) => Promise<{ wasOpen: boolean }>,
  params: {
    tournamentId: string;
    groupId: string;
  }
): Promise<ReopenMatchPlayGroupRoundResult> {
  const tournamentId = String(params.tournamentId ?? "").trim();
  const groupId = String(params.groupId ?? "").trim();
  if (!tournamentId || !groupId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  const revert = await revertMatchAdvanceForGroup(admin, {
    tournamentId,
    groupId,
  });
  if (!revert.ok) {
    return { ok: false, error: revert.error };
  }

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id")
    .eq("id", groupId)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim();
  if (!roundId) {
    return { ok: false, error: "Grupo no encontrado." };
  }

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, round_no, tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const currentRoundNo = Number(roundRow?.round_no ?? 0);
  if (!roundRow?.tournament_id || roundRow.tournament_id !== tournamentId) {
    return { ok: false, error: "La ronda del grupo no pertenece a este torneo." };
  }

  const { data: memberRows } = await admin
    .from("pairing_group_members")
    .select("entry_id")
    .eq("group_id", groupId);
  const entryIds = (memberRows ?? [])
    .map((r) => String(r.entry_id ?? "").trim())
    .filter(Boolean);
  if (entryIds.length === 0) {
    return { ok: false, error: "El grupo no tiene jugadores." };
  }

  const { data: entryRows } = await admin
    .from("tournament_entries")
    .select("id, player_id")
    .in("id", entryIds);

  let openedCount = 0;
  let alreadyOpenCount = 0;
  const errors: string[] = [];

  for (const row of entryRows ?? []) {
    const entryId = String(row.id ?? "").trim();
    const playerId = String(row.player_id ?? "").trim();
    if (!entryId || !playerId) continue;
    try {
      const result = await staffOpenEntry(admin, {
        tournamentId,
        roundId,
        roundNo: currentRoundNo,
        entryId,
        playerId,
      });
      if (result.wasOpen) alreadyOpenCount += 1;
      else openedCount += 1;
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : `Error abriendo tarjeta de ${entryId}.`
      );
    }
  }

  if (errors.length > 0 && openedCount === 0 && alreadyOpenCount === 0) {
    return { ok: false, error: errors.join(" ") };
  }

  const partialNote =
    errors.length > 0 ? ` Algunas tarjetas no se abrieron: ${errors.join(" ")}` : "";

  const bracketNote = revert.reverted
    ? revert.message
    : "Tarjetas abiertas para corrección.";

  return {
    ok: true,
    openedCount,
    alreadyOpenCount,
    bracketReverted: revert.reverted,
    nextGroupRemoved: revert.nextGroupRemoved,
    message: `${bracketNote}${partialNote}`,
  };
}
