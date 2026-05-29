import { HOLES_PLAYOFF } from "@/lib/captura/loadGroupCapture";
import type {
  GroupCapturePlayer,
  GroupMatchPlayCapture,
  HoleNumber,
  HoleScores,
} from "@/lib/captura/types";

export type PlayoffCaptureAnalysis = {
  /** Mostrar tabla / dots de desempate (P1-P9). */
  showPlayoffSection: boolean;
  /** Hay scores en 19-27 pero el match ya cerró en los 18 (no vía playoff). */
  orphanPlayoffScores: boolean;
  /** Primer hoyo de desempate (1-9) con captura incompleta. */
  pendingPlayoffHole: number | null;
  /** Hoyo almacenado en BD (19-27) pendiente de completar. */
  pendingStoreHole: HoleNumber | null;
  /** Jugadores sin score en el hoyo de desempate pendiente. */
  missingPlayerNames: string[];
};

function hasAnyPlayoffScore(scores: HoleScores): boolean {
  return HOLES_PLAYOFF.some((h) => scores[h] != null);
}

/**
 * Decide si se muestra el tramo de desempate y si falta algún score para
 * poder calcular puntos / cerrar el match en muerte súbita.
 */
export function analyzePlayoffCapture(
  matchPlay: GroupMatchPlayCapture | null | undefined,
  players: Pick<GroupCapturePlayer, "entryId" | "name" | "scores">[]
): PlayoffCaptureAnalysis {
  const empty: PlayoffCaptureAnalysis = {
    showPlayoffSection: false,
    orphanPlayoffScores: false,
    pendingPlayoffHole: null,
    pendingStoreHole: null,
    missingPlayerNames: [],
  };
  if (!matchPlay) return empty;

  const anyPlayoffCaptured = players.some((p) => hasAnyPlayoffScore(p.scores));
  const decidedBeforePlayoff =
    matchPlay.decidedAtHole != null &&
    matchPlay.decidedAtHole <= 18 &&
    !matchPlay.viaPlayoff;

  const showPlayoffSection = Boolean(
    matchPlay.needsPlayoff || matchPlay.viaPlayoff
  );

  const orphanPlayoffScores = decidedBeforePlayoff && anyPlayoffCaptured;

  if (!showPlayoffSection) {
    return {
      ...empty,
      orphanPlayoffScores,
    };
  }

  // Primer hoyo de playoff incompleto (todos deben tener score para sumar puntos).
  for (const storeHole of HOLES_PLAYOFF) {
    const missing = players.filter((p) => p.scores[storeHole] == null);
    if (missing.length > 0) {
      return {
        showPlayoffSection: true,
        orphanPlayoffScores,
        pendingPlayoffHole: storeHole - 18,
        pendingStoreHole: storeHole,
        missingPlayerNames: missing.map((p) => p.name),
      };
    }

    // Todos capturaron este hoyo: si el match ya se decidió aquí, no seguimos.
    if (
      matchPlay.viaPlayoff &&
      matchPlay.playoffHole != null &&
      matchPlay.playoffHole <= storeHole - 18
    ) {
      break;
    }
  }

  return {
    showPlayoffSection: true,
    orphanPlayoffScores,
    pendingPlayoffHole: null,
    pendingStoreHole: null,
    missingPlayerNames: [],
  };
}
