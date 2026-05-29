import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import {
  deriveMatchHolesFromStrokes,
  type DerivedMatchDecision,
} from "@/lib/matchplay/deriveMatchHolesFromStrokes";

export type GroupMatchPlayStatus = {
  /** Hoyo en que la competencia de match quedó matemáticamente decidida
   *  (1-18 normal; 19-27 si se decidió en desempate). null si AS al 18
   *  con desempate aún en curso. */
  decidedAtHole: number | null;
  /** Texto corto (ej. "6/4 · decidido en H16"). */
  resultText: string;
  /** Hoyos que deben estar capturados para permitir firma. */
  holesRequired: number;
  /** True si terminó vía desempate (decidedAtHole >= 19). */
  viaPlayoff?: boolean;
  /** Posición del desempate donde se decidió (1-9), si aplica. */
  playoffHole?: number;
  /** True si quedó AS al 18 y aún falta capturar el desempate. */
  needsPlayoff?: boolean;
};

function formatDecisionLabel(decision: DerivedMatchDecision): string {
  if (decision.via_playoff && decision.playoff_hole != null) {
    return `Desempate · decidido en H${decision.playoff_hole}`;
  }
  const diffAbs = Math.abs(decision.top_total - decision.bottom_total);
  const holesLeft = Math.max(0, 18 - decision.decided_at_hole);
  const lead = Number.isInteger(diffAbs)
    ? String(diffAbs)
    : diffAbs.toFixed(1).replace(/\.0$/, "");
  if (holesLeft > 0) {
    return `${lead}/${holesLeft} · decidido en H${decision.decided_at_hole}`;
  }
  return `Decidido en H${decision.decided_at_hole}`;
}

/**
 * Si el grupo pertenece a un torneo match play (bola baja + alta) y el
 * partido ya quedó decidido antes del 18, devuelve el hoyo de cierre.
 */
export async function loadGroupMatchPlayStatus(
  admin: SupabaseClient,
  groupId: string
): Promise<GroupMatchPlayStatus | null> {
  const gid = groupId.trim();
  if (!gid) return null;

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", gid)
    .maybeSingle();

  const roundId = String(groupRow?.round_id ?? "").trim();
  const groupNo =
    typeof groupRow?.group_no === "number" ? groupRow.group_no : null;
  if (!roundId || groupNo == null) return null;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const tournamentId = String(roundRow?.tournament_id ?? "").trim();
  if (!tournamentId) return null;

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (rules?.pair_format !== "low_high") return null;

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const matchId = `derived-${roundId}-g${groupNo}`;
  const match = derived.matches.find((m) => m.id === matchId);
  if (
    !match ||
    !match.top_a_entry_id ||
    !match.top_b_entry_id ||
    !match.bottom_a_entry_id ||
    !match.bottom_b_entry_id
  ) {
    return null;
  }

  const { decisions, summaries } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    [match]
  );
  const decision = decisions.get(matchId);
  const summary = summaries.get(matchId);

  if (decision?.decided_at_hole) {
    return {
      decidedAtHole: decision.decided_at_hole,
      resultText: formatDecisionLabel(decision),
      // Para firma: 18 si decidió antes; 18+playoff_hole si decidió en desempate.
      holesRequired: decision.decided_at_hole,
      viaPlayoff: decision.via_playoff,
      playoffHole: decision.playoff_hole,
    };
  }

  if (summary?.needs_playoff) {
    return {
      decidedAtHole: null,
      resultText: "Empate al 18 — definiendo en desempate",
      holesRequired: 18,
      needsPlayoff: true,
    };
  }

  return null;
}
