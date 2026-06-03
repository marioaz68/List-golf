import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignCaddieToEntryParams = {
  tournamentId: string;
  entryId: string;
  caddieId: string;
  roundId: string;
  pairingGroupId?: string | null;
};

export type AssignCaddieToEntryResult =
  | { ok: true; roundId: string }
  | { ok: false; error: string };

/** Asigna un caddie a un inscrito en una ronda y propaga a las demás rondas
 *  elegibles del torneo (misma regla que /caddies). */
export async function assignCaddieToEntry(
  supabase: SupabaseClient,
  params: AssignCaddieToEntryParams
): Promise<AssignCaddieToEntryResult> {
  const { tournamentId, entryId, caddieId, roundId } = params;
  const pairingGroupId = params.pairingGroupId?.trim() || null;

  if (!tournamentId || !entryId || !caddieId || !roundId) {
    return { ok: false, error: "Datos incompletos" };
  }

  const { data: conflicts, error: conflictError } = await supabase
    .from("caddie_assignments")
    .select("id, entry_id")
    .eq("tournament_id", tournamentId)
    .eq("caddie_id", caddieId)
    .eq("round_id", roundId)
    .eq("is_active", true);

  if (conflictError) return { ok: false, error: conflictError.message };

  const conflict = (conflicts ?? []).find((a) => a.entry_id !== entryId);
  if (conflict) {
    return { ok: false, error: "Este caddie ya está asignado a otro jugador en esta ronda" };
  }

  const { error: deactivateError } = await supabase
    .from("caddie_assignments")
    .update({ is_active: false })
    .eq("tournament_id", tournamentId)
    .eq("entry_id", entryId)
    .eq("round_id", roundId)
    .eq("is_active", true);

  if (deactivateError) return { ok: false, error: deactivateError.message };

  const { error } = await supabase.from("caddie_assignments").insert({
    tournament_id: tournamentId,
    entry_id: entryId,
    caddie_id: caddieId,
    round_id: roundId,
    pairing_group_id: pairingGroupId,
    role: "marker",
    is_active: true,
  });

  if (error) return { ok: false, error: error.message };

  try {
    const { data: entryRow } = await supabase
      .from("tournament_entries")
      .select("category_id")
      .eq("id", entryId)
      .maybeSingle();
    const categoryId =
      (entryRow as { category_id?: string | null } | null)?.category_id ?? null;

    const { data: roundsRaw } = await supabase
      .from("rounds")
      .select("id, category_id, round_no")
      .eq("tournament_id", tournamentId);

    type RoundLite = {
      id: string;
      category_id: string | null;
      round_no: number | null;
    };
    const allRounds = (roundsRaw ?? []) as RoundLite[];
    const eligibleRounds = allRounds.filter((r) => {
      if (r.id === roundId) return false;
      if (!r.category_id) return true;
      return categoryId != null && r.category_id === categoryId;
    });

    if (eligibleRounds.length > 0) {
      const eligibleIds = eligibleRounds.map((r) => r.id);
      const { data: existingForEntry } = await supabase
        .from("caddie_assignments")
        .select("round_id, caddie_id")
        .eq("tournament_id", tournamentId)
        .eq("entry_id", entryId)
        .eq("is_active", true)
        .in("round_id", eligibleIds);
      const occupiedByEntry = new Set(
        (existingForEntry ?? []).map((a) => String(a.round_id))
      );

      const { data: caddieElsewhere } = await supabase
        .from("caddie_assignments")
        .select("round_id, entry_id")
        .eq("tournament_id", tournamentId)
        .eq("caddie_id", caddieId)
        .eq("is_active", true)
        .in("round_id", eligibleIds);
      const blockedRoundsForCaddie = new Set(
        (caddieElsewhere ?? [])
          .filter((a) => a.entry_id !== entryId)
          .map((a) => String(a.round_id))
      );

      const targetRoundIds = eligibleIds.filter(
        (rid) =>
          !occupiedByEntry.has(rid) && !blockedRoundsForCaddie.has(rid)
      );
      const groupByRound = new Map<string, string | null>();
      if (targetRoundIds.length > 0) {
        const { data: pgmRows } = await supabase
          .from("pairing_group_members")
          .select(
            `id, group_id,
             pairing_groups!inner ( id, round_id )`
          )
          .eq("entry_id", entryId);
        type PgmRow = {
          group_id: string;
          pairing_groups:
            | { id: string; round_id: string }
            | { id: string; round_id: string }[]
            | null;
        };
        for (const row of (pgmRows ?? []) as unknown as PgmRow[]) {
          const pg = Array.isArray(row.pairing_groups)
            ? row.pairing_groups[0]
            : row.pairing_groups;
          if (pg?.round_id) {
            groupByRound.set(String(pg.round_id), String(row.group_id));
          }
        }
      }

      const insertRows = targetRoundIds.map((rid) => ({
        tournament_id: tournamentId,
        entry_id: entryId,
        caddie_id: caddieId,
        round_id: rid,
        pairing_group_id: groupByRound.get(rid) ?? null,
        role: "marker",
        is_active: true,
      }));
      if (insertRows.length > 0) {
        const { error: bulkErr } = await supabase
          .from("caddie_assignments")
          .insert(insertRows);
        if (bulkErr) {
          console.warn(
            "[caddies] no se pudo propagar caddie al resto de rondas:",
            bulkErr.message
          );
        }
      }
    }
  } catch (err) {
    console.warn("[caddies] error propagando caddie a otras rondas:", err);
  }

  return { ok: true, roundId };
}

/** Primera ronda del torneo (por round_no) aplicable al inscrito. */
export async function resolveDefaultRoundForEntry(
  supabase: SupabaseClient,
  tournamentId: string,
  entryId: string
): Promise<{ roundId: string | null; pairingGroupId: string | null }> {
  const { data: entryRow } = await supabase
    .from("tournament_entries")
    .select("category_id")
    .eq("id", entryId)
    .maybeSingle();
  const categoryId =
    (entryRow as { category_id?: string | null } | null)?.category_id ?? null;

  const { data: roundsRaw } = await supabase
    .from("rounds")
    .select("id, category_id, round_no")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });

  type RoundLite = {
    id: string;
    category_id: string | null;
    round_no: number | null;
  };
  const rounds = (roundsRaw ?? []) as RoundLite[];
  const applicable = rounds.filter((r) => {
    if (!r.category_id) return true;
    return categoryId != null && r.category_id === categoryId;
  });
  const round = applicable[0] ?? rounds[0] ?? null;
  if (!round) return { roundId: null, pairingGroupId: null };

  let pairingGroupId: string | null = null;
  const { data: pgmRows } = await supabase
    .from("pairing_group_members")
    .select(
      `group_id,
       pairing_groups!inner ( id, round_id )`
    )
    .eq("entry_id", entryId);

  type PgmRow = {
    group_id: string;
    pairing_groups:
      | { id: string; round_id: string }
      | { id: string; round_id: string }[]
      | null;
  };
  for (const row of (pgmRows ?? []) as unknown as PgmRow[]) {
    const pg = Array.isArray(row.pairing_groups)
      ? row.pairing_groups[0]
      : row.pairing_groups;
    if (pg?.round_id === round.id) {
      pairingGroupId = String(row.group_id);
      break;
    }
  }

  return { roundId: round.id, pairingGroupId };
}
