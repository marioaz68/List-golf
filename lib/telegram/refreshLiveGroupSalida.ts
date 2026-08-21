import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lectura fresca de salidas (pairing_groups + round) justo antes de
 * cualquier Telegram que cite grupo / tee time.
 *
 * Evita mandar horarios calculados al crear el grupo o cacheados en el
 * caller cuando el comité ya movió la salida en tee-sheet.
 */

export type LiveGroupSalida = {
  groupId: string;
  roundId: string;
  groupNo: number | null;
  /** HH:MM */
  teeTime: string | null;
  startingHole: number | null;
  notes: string | null;
  roundNo: number | null;
  roundDate: string | null;
};

export type RefreshLiveGroupSalidaResult = {
  live: LiveGroupSalida;
  /** El tee que el caller iba a usar no coincide con el de salidas. */
  teeWasStale: boolean;
  /** Tee propuesto por el caller (HH:MM), si venía. */
  proposedTeeTime: string | null;
};

export function normalizeTeeHHMM(
  raw: string | null | undefined
): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t.slice(0, 5);
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

export async function refreshLiveGroupSalida(
  admin: SupabaseClient,
  args: {
    groupId: string;
    /** Si se pasa, valida que el grupo siga en esa ronda. */
    roundId?: string | null;
    /** Tee que el caller iba a publicar (fórmula / cache). */
    proposedTeeTime?: string | null;
  }
): Promise<RefreshLiveGroupSalidaResult | null> {
  const groupId = String(args.groupId ?? "").trim();
  if (!groupId) return null;

  const { data: group, error } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no, tee_time, starting_hole, notes")
    .eq("id", groupId)
    .maybeSingle();

  if (error || !group?.id) {
    if (error) {
      console.error("[refreshLiveGroupSalida] group:", error.message);
    }
    return null;
  }

  const roundId = String(group.round_id ?? "").trim();
  if (args.roundId && String(args.roundId).trim() !== roundId) {
    console.warn(
      `[refreshLiveGroupSalida] group ${groupId} round mismatch: live=${roundId} proposed=${args.roundId}`
    );
  }

  let roundNo: number | null = null;
  let roundDate: string | null = null;
  if (roundId) {
    const { data: round } = await admin
      .from("rounds")
      .select("id, round_no, round_date")
      .eq("id", roundId)
      .maybeSingle();
    roundNo = typeof round?.round_no === "number" ? round.round_no : null;
    roundDate = round?.round_date != null ? String(round.round_date) : null;
  }

  const liveTee = normalizeTeeHHMM(
    group.tee_time != null ? String(group.tee_time) : null
  );
  const proposedTee = normalizeTeeHHMM(args.proposedTeeTime);
  const teeWasStale = Boolean(
    proposedTee && liveTee && proposedTee !== liveTee
  );

  if (teeWasStale) {
    console.info(
      `[refreshLiveGroupSalida] tee stale group=${groupId} proposed=${proposedTee} live=${liveTee}`
    );
  }

  return {
    live: {
      groupId: String(group.id),
      roundId,
      groupNo: typeof group.group_no === "number" ? group.group_no : null,
      teeTime: liveTee,
      startingHole:
        typeof group.starting_hole === "number" ? group.starting_hole : null,
      notes: group.notes != null ? String(group.notes) : null,
      roundNo,
      roundDate,
    },
    teeWasStale,
    proposedTeeTime: proposedTee,
  };
}
