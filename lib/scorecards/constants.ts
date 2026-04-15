import type {
  ScorecardSignatureRole,
  ScorecardSignatureType,
  ScorecardStatus,
} from "./types";

export const SCORECARD_STATUSES: ScorecardStatus[] = [
  "draft",
  "in_review",
  "signed_marker",
  "signed_player",
  "signed_complete",
  "locked",
  "needs_staff_review",
  "disputed",
];

export const SCORECARD_SIGNATURE_ROLES: ScorecardSignatureRole[] = [
  "player",
  "marker",
  "witness",
  "staff",
];

export const SCORECARD_SIGNATURE_TYPES: ScorecardSignatureType[] = [
  "tap",
  "typed_name",
  "drawn",
  "otp",
];

export const SCORECARD_DEFAULT_SIGNATURE_TYPE: ScorecardSignatureType =
  "typed_name";

export const SCORECARD_PLAYER_SIGN_TEXT =
  "Confirmo que revisé mi tarjeta y acepto los scores registrados.";

export const SCORECARD_MARKER_SIGN_TEXT =
  "Confirmo que esta tarjeta refleja los scores anotados del jugador, salvo observaciones registradas.";

export const SCORECARD_WITNESS_SIGN_TEXT =
  "Confirmo como testigo que la tarjeta fue revisada en mi presencia.";

export const SCORECARD_STATUS_LABELS: Record<ScorecardStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  signed_marker: "Firmada por marcador",
  signed_player: "Firmada por jugador",
  signed_complete: "Firmas completas",
  locked: "Cerrada",
  needs_staff_review: "Revisión staff",
  disputed: "En disputa",
};