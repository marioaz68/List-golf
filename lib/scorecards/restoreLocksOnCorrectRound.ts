import type { SupabaseClient } from "@supabase/supabase-js";
import { getRoundForCategory, type RoundForGate } from "@/lib/rounds/categoryRoundGate";
import { countHolesOnPlayerRound } from "@/lib/scorecards/countHolesOnPlayerRound";

export type RestoreRoundLocksResult = {
  entriesChecked: number;
  locked: number;
  alreadyLocked: number;
  skippedNoHoles: number;
  errors: string[];
};

/**
 * Vuelve a cerrar R{n} en la fila `rounds` de la categoría del inscrito
 * cuando ya tiene ≥18 hoyos en esa ronda.
 */
export async function restoreLocksOnCorrectRound(
  admin: SupabaseClient,
  tournamentId: string,
  roundNo: number
): Promise<RestoreRoundLocksResult> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, round_no, category_id")
    .eq("tournament_id", tournamentId);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas: ${roundsErr.message}`);
  }

  const roundList = (rounds ?? []) as RoundForGate[];

  const { data: entries, error: entriesErr } = await admin
    .from("tournament_entries")
    .select("id, player_id, player_number, category_id")
    .eq("tournament_id", tournamentId);

  if (entriesErr) {
    throw new Error(`Error leyendo inscripciones: ${entriesErr.message}`);
  }

  const result: RestoreRoundLocksResult = {
    entriesChecked: entries?.length ?? 0,
    locked: 0,
    alreadyLocked: 0,
    skippedNoHoles: 0,
    errors: [],
  };

  const now = new Date().toISOString();

  for (const entry of entries ?? []) {
    const entryId = String(entry.id);
    const playerId = String(entry.player_id ?? "").trim();
    const cat = String(entry.category_id ?? "").trim();
    if (!playerId) continue;

    const round = getRoundForCategory(roundList, roundNo, cat || null);
    if (!round?.id) continue;

    try {
      const holes = await countHolesOnPlayerRound(admin, playerId, round.id);
      if (holes < 18) {
        result.skippedNoHoles += 1;
        continue;
      }

      const { data: existing, error: scErr } = await admin
        .from("scorecards")
        .select("id, locked_at")
        .eq("entry_id", entryId)
        .eq("round_id", round.id)
        .maybeSingle();

      if (scErr) {
        result.errors.push(
          `#${entry.player_number ?? "?"}: ${scErr.message}`
        );
        continue;
      }

      if (existing?.locked_at) {
        result.alreadyLocked += 1;
        continue;
      }

      if (existing?.id) {
        const { error: upErr } = await admin
          .from("scorecards")
          .update({
            locked_at: now,
            status: "locked",
            player_signed_at: now,
            witness_signed_at: now,
            updated_at: now,
          })
          .eq("id", existing.id);

        if (upErr) {
          result.errors.push(
            `#${entry.player_number ?? "?"}: ${upErr.message}`
          );
          continue;
        }
      } else {
        const { error: insErr } = await admin.from("scorecards").insert({
          tournament_id: tournamentId,
          round_id: round.id,
          entry_id: entryId,
          status: "locked",
          locked_at: now,
          player_signed_at: now,
          witness_signed_at: now,
          updated_at: now,
        });

        if (insErr) {
          result.errors.push(
            `#${entry.player_number ?? "?"}: ${insErr.message}`
          );
          continue;
        }
      }

      result.locked += 1;
    } catch (e) {
      result.errors.push(
        `#${entry.player_number ?? "?"}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return result;
}
