import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { isStablefordCategory } from "./categoryCompetitionRules";
import { stablefordPoints } from "./competitionScoring";
import {
  effectivePlayingHandicapForScoring,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "./handicapStrokes";

export type PerHoleCompetitionCell = {
  holeNumber: number;
  par: number | null;
  grossStrokes: number | null;
  strokeIndex: number;
  strokesReceived: number;
  netStrokes: number | null;
  stablefordPoints: number | null;
};

/**
 * Desglose hoyo por hoyo del detalle de una ronda.
 *
 * `resolvedPlayingHandicap` YA ES el PH de torneo del inscrito (override de
 * comité → PH guardado → WHS), no el índice: es el mismo valor que la página
 * pública mete en `handicapsByPlayerId` y el mismo que usan los totales en
 * `PublicLeaderboardDetailTable`. Por eso NO se le vuelve a aplicar el % de
 * la categoría: hacerlo lo bajaba otra vez al 80% y el desglose repartía
 * menos golpes de los que descontaba el total en la misma pantalla.
 */
export function perHoleCompetitionBreakdown(
  detail: RoundDetail,
  rule: CategoryCompetitionRule,
  resolvedPlayingHandicap: number | null | undefined,
  strokeIndexByHole?: StrokeIndexByHole
): PerHoleCompetitionCell[] {
  const ph = effectivePlayingHandicapForScoring(
    resolvedPlayingHandicap,
    resolvedPlayingHandicap,
    rule.handicap_percentage
  );
  const useStableford = isStablefordCategory(rule);
  const useNet =
    useStableford ||
    rule.leaderboard_basis === "net" ||
    rule.leaderboard_basis === "both";

  return detail.holes.map((hole) => {
    const holeNumber = hole.hole_number;
    const par = hole.par != null ? Number(hole.par) : null;
    const gross =
      hole.strokes != null && !Number.isNaN(Number(hole.strokes))
        ? Number(hole.strokes)
        : null;
    const si = strokeIndexForHole(holeNumber, strokeIndexByHole);
    const received =
      gross != null && useNet ? strokesReceivedOnHole(ph, si) : 0;
    const net =
      gross != null && useNet ? gross - received : gross != null ? gross : null;
    const pts =
      net != null && par != null && useStableford
        ? stablefordPoints(net, par)
        : null;

    return {
      holeNumber,
      par,
      grossStrokes: gross,
      strokeIndex: si,
      strokesReceived: received,
      netStrokes: net,
      stablefordPoints: pts,
    };
  });
}

/** Igual que arriba: el valor que entra ya es el PH de torneo resuelto. */
export function formatPlayingHandicapSummary(
  resolvedPlayingHandicap: number | null | undefined,
  handicapPercentage: number
): string {
  const ph = effectivePlayingHandicapForScoring(
    resolvedPlayingHandicap,
    resolvedPlayingHandicap,
    handicapPercentage
  );
  return `PH ${ph}`;
}

export type EntryHandicapCardInput = {
  handicap_index?: number | null;
  course_handicap?: number | null;
  playing_handicap?: number | null;
  playing_handicap_override?: number | null;
};

function fmtHi(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Carnet del jugador: HI (variable) + HC/PH fijos del torneo/campo. */
export function formatEntryHandicapCard(
  h: EntryHandicapCardInput
): string | null {
  const hi =
    h.handicap_index != null && Number.isFinite(Number(h.handicap_index))
      ? Number(h.handicap_index)
      : null;
  const ch =
    h.course_handicap != null && Number.isFinite(Number(h.course_handicap))
      ? Math.round(Number(h.course_handicap))
      : null;
  // Orden canónico: override de comité → PH guardado. Antes se leía solo
  // `playing_handicap` y el override únicamente pintaba la etiqueta
  // "(manual)", así que el carnet podía mostrar un golpe distinto al que
  // usaban el marcador, la tarjeta y la subasta.
  const phRaw =
    h.playing_handicap_override != null &&
    Number.isFinite(Number(h.playing_handicap_override))
      ? Number(h.playing_handicap_override)
      : h.playing_handicap != null && Number.isFinite(Number(h.playing_handicap))
        ? Number(h.playing_handicap)
        : null;
  const ph = phRaw != null ? Math.round(phRaw) : null;

  if (hi == null && ch == null && ph == null) return null;

  const parts: string[] = [];
  if (hi != null) parts.push(`HI ${fmtHi(hi)}`);
  if (ch != null) parts.push(`HC ${ch}`);
  if (ph != null) {
    parts.push(
      `PH ${ph}${h.playing_handicap_override != null ? " (manual)" : ""}`
    );
  }
  return parts.join(" · ");
}

export function entryHandicapCardFromRow(
  row: EntryHandicapCardInput & { player_id?: string },
  handicapIndexFallback?: number | null
): string | null {
  return formatEntryHandicapCard({
    handicap_index: row.handicap_index ?? handicapIndexFallback ?? null,
    course_handicap: row.course_handicap,
    playing_handicap: row.playing_handicap,
    playing_handicap_override: row.playing_handicap_override,
  });
}
