import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import {
  deriveMatchHolesFromStrokes,
  type DerivedMatchDecision,
} from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import type { GroupMatchPlayProgressionRow } from "@/lib/captura/types";

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
  /** Desempate en curso: hoyo (1-9) con captura incompleta. */
  playoffPendingHole?: number;
  /** Progresión del match hoyo por hoyo (puntos acumulados + label). */
  progression?: GroupMatchPlayProgressionRow[];
  /** Etiqueta corta de las parejas (top / bottom) para leyendas. */
  topLabel?: string | null;
  bottomLabel?: string | null;
  /** `matchplay_matches.id` (cuadro oficial) si las parejas del grupo
   *  coinciden con un match real publicado. null si el torneo todavía
   *  no tiene cuadro publicado o el match no se encuentra. */
  matchplayMatchId?: string | null;
  /** True si el match ya está marcado como `completed` en DB. */
  matchplayCompleted?: boolean;
};

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Etiqueta corta del estado del match tras un hoyo:
 *  - "AS" cuando los acumulados son iguales,
 *  - "T+N" / "B+N" indicando qué pareja va arriba (T=top, B=bottom)
 *    y por cuántos puntos. N puede ser decimal (0.5 cuando una sub-
 *    competencia del hoyo quedó halved).
 */
function buildProgressionLabel(top: number, bottom: number): string {
  if (top === bottom) return "AS";
  if (top > bottom) return `T+${formatPts(top - bottom)}`;
  return `B+${formatPts(bottom - top)}`;
}

function formatDecisionLabel(decision: DerivedMatchDecision): string {
  const diffAbs = Math.abs(decision.top_total - decision.bottom_total);
  const lead = Number.isInteger(diffAbs)
    ? String(diffAbs)
    : diffAbs.toFixed(1).replace(/\.0$/, "");

  if (decision.via_playoff && decision.playoff_hole != null) {
    return `Desempate H${decision.playoff_hole} · ${lead} arriba`;
  }

  // Cada hoyo otorga máximo 2 puntos en Bola Baja + Bola Alta, así que
  // los puntos por jugar al cierre = hoyos restantes × 2.
  const pointsLeft = Math.max(0, 18 - decision.decided_at_hole) * 2;
  const tail = pointsLeft > 0 ? ` · ${pointsLeft} por jugar` : "";
  if (diffAbs === 0) {
    return `H${decision.decided_at_hole} · AS${tail}`;
  }
  return `H${decision.decided_at_hole} · ${lead} arriba${tail}`;
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

  // Buscar match real en matchplay_matches para poder cerrarlo/avanzarlo.
  let matchplayMatchId: string | null = null;
  let matchplayCompleted = false;
  if (match.top_pair_id && match.bottom_pair_id) {
    const { data: bracketRow } = await admin
      .from("matchplay_brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bracketRow?.id) {
      const { data: candidates } = await admin
        .from("matchplay_matches")
        .select("id, top_pair_id, bottom_pair_id, status, round_no")
        .eq("bracket_id", bracketRow.id)
        .eq("round_no", match.round_no);
      const real = (candidates ?? []).find(
        (m) =>
          (m.top_pair_id === match.top_pair_id &&
            m.bottom_pair_id === match.bottom_pair_id) ||
          (m.top_pair_id === match.bottom_pair_id &&
            m.bottom_pair_id === match.top_pair_id)
      );
      if (real) {
        matchplayMatchId = String(real.id);
        matchplayCompleted = real.status === "completed";
      }
    }
  }

  const { decisions, summaries, holes } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    [match]
  );
  const decision = decisions.get(matchId);
  const summary = summaries.get(matchId);

  // ─── Construir progresión hoyo por hoyo ──────────────────────────────
  // Sólo incluye hoyos del match (no `after_decision` extra que se sigan
  // capturando como stroke play). Para cada hoyo: puntos acumulados +
  // label "AS" / "T+N" / "B+N".
  const matchHoles = holes
    .filter((h) => h.match_id === matchId)
    .sort((a, b) => a.hole_no - b.hole_no);
  let topAcc = 0;
  let bottomAcc = 0;
  const progression: GroupMatchPlayProgressionRow[] = [];
  for (const h of matchHoles) {
    // Si los puntos son 0/0 en un hoyo posterior al cierre, igual lo
    // omitimos del display (no aporta a la lectura del match).
    if (
      decision?.decided_at_hole != null &&
      h.hole_no > decision.decided_at_hole &&
      h.top_points === 0 &&
      h.bottom_points === 0
    ) {
      continue;
    }
    topAcc += Number(h.top_points ?? 0);
    bottomAcc += Number(h.bottom_points ?? 0);
    progression.push({
      hole_no: h.hole_no,
      top_cum: topAcc,
      bottom_cum: bottomAcc,
      label: buildProgressionLabel(topAcc, bottomAcc),
    });
  }

  // (DerivedMatchRow no incluye nombres de las parejas; el cliente las
  //  rotula con los nombres de los jugadores del payload.)
  const topLabel: string | null = null;
  const bottomLabel: string | null = null;

  if (decision?.decided_at_hole) {
    return {
      decidedAtHole: decision.decided_at_hole,
      resultText: formatDecisionLabel(decision),
      // Para firma: 18 si decidió antes; 18+playoff_hole si decidió en desempate.
      holesRequired: decision.decided_at_hole,
      viaPlayoff: decision.via_playoff,
      playoffHole: decision.playoff_hole,
      progression,
      topLabel,
      bottomLabel,
      matchplayMatchId,
      matchplayCompleted,
    };
  }

  if (summary?.needs_playoff) {
    const pending = summary.playoff_pending_hole;
    return {
      decidedAtHole: null,
      resultText:
        pending != null
          ? `Desempate P${pending} · faltan scores para calcular puntos`
          : "Empate al 18 — definiendo en desempate",
      holesRequired: 18,
      needsPlayoff: true,
      playoffPendingHole: pending,
      progression,
      topLabel,
      bottomLabel,
      matchplayMatchId,
      matchplayCompleted,
    };
  }

  // Match aún en curso (sin decisión ni desempate). Igualmente devolvemos
  // la progresión para que el cliente pueda dibujar la fila.
  if (progression.length > 0) {
    return {
      decidedAtHole: null,
      resultText: progression[progression.length - 1]!.label,
      holesRequired: 18,
      progression,
      topLabel,
      bottomLabel,
      matchplayMatchId,
      matchplayCompleted,
    };
  }

  return null;
}
