import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPublishBracketFromPairings } from "@/lib/matchplay/autoPublishBracketFromPairings";
import { closeMatchAndAdvanceForGroup } from "@/lib/matchplay/closeAndAdvance";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";

export type RepairMatchplayFromR1Result =
  | {
      ok: true;
      bracketId: string;
      bracketSize: number;
      closedCount: number;
      skippedCount: number;
      errors: string[];
      message: string;
    }
  | { ok: false; error: string };

/**
 * Repara el cuadro de un torneo con bracket desalineado:
 *  1. Borra el cuadro actual y lo regenera desde grupos R1 del calendario.
 *  2. Cierra cada match de R1 que ya está decidido por scores y avanza
 *     ganadores a R2 del bracket (sin crear salidas de calendario hasta
 *     que ambas parejas estén en el siguiente cruce).
 *  3. Elimina salidas auto-generadas de rondas > 1 (notas MATCH PLAY).
 */
export async function repairMatchplayFromR1(
  admin: SupabaseClient,
  tournamentId: string
): Promise<RepairMatchplayFromR1Result> {
  if (!tournamentId) {
    return { ok: false, error: "Falta tournament_id." };
  }

  const { data: r1Round } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("round_no", 1)
    .maybeSingle();
  if (!r1Round?.id) {
    return { ok: false, error: "El torneo no tiene ronda 1." };
  }

  // Quitar salidas auto-generadas en rondas posteriores (si existen).
  const { data: laterRounds } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .gt("round_no", 1);
  for (const r of laterRounds ?? []) {
    const { data: autoGroups } = await admin
      .from("pairing_groups")
      .select("id")
      .eq("round_id", r.id)
      .like("notes", "MATCH PLAY%");
    if (autoGroups?.length) {
      const ids = autoGroups.map((g) => g.id);
      await admin.from("pairing_group_members").delete().in("group_id", ids);
      await admin.from("pairing_groups").delete().in("id", ids);
    }
  }

  const regen = await autoPublishBracketFromPairings(admin, tournamentId);
  if (!regen.ok) {
    return { ok: false, error: regen.error };
  }

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const r1Matches = derived.matches.filter((m) => m.round_no === 1);
  const { decisions } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    r1Matches
  );

  const errors: string[] = [];
  let closedCount = 0;
  let skippedCount = 0;

  for (const m of r1Matches) {
    const decision = decisions.get(m.id);
    if (!decision) {
      skippedCount += 1;
      continue;
    }
    if (!m.top_pair_id || !m.bottom_pair_id) {
      skippedCount += 1;
      continue;
    }

    const close = await closeMatchAndAdvanceForGroup(admin, {
      groupId: m.group_id,
      notifyNextGroup: false,
    });
    if (close.ok) {
      closedCount += 1;
    } else {
      errors.push(`G${m.group_no ?? "?"}: ${close.error}`);
    }
  }

  const message =
    `Cuadro reparado (${regen.bracketSize} plazas, ${regen.pairedMatchesR1} matches R1). ` +
    `${closedCount} match(es) de R1 cerrados y avanzados a R2. ` +
    (skippedCount > 0 ? `${skippedCount} sin resultado aún. ` : "") +
    (errors.length > 0 ? `Avisos: ${errors.join(" · ")}` : "");

  return {
    ok: true,
    bracketId: regen.bracketId,
    bracketSize: regen.bracketSize,
    closedCount,
    skippedCount,
    errors,
    message,
  };
}
