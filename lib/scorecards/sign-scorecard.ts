import {
  SCORECARD_DEFAULT_SIGNATURE_TYPE,
  SCORECARD_MARKER_SIGN_TEXT,
  SCORECARD_PLAYER_SIGN_TEXT,
  SCORECARD_WITNESS_SIGN_TEXT,
} from "./constants";
import { getNextStatusAfterSignature } from "./helpers";
import type {
  ScorecardSignature,
  ScorecardStatus,
  SignScorecardInput,
} from "./types";

type CurrentScorecardState = {
  status: ScorecardStatus;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
};

type SignScorecardResult = {
  signature: ScorecardSignature;
  nextStatus: ScorecardStatus;
  player_signed_at: string | null;
  marker_signed_at: string | null;
  witness_signed_at: string | null;
};

function getDefaultSignedText(role: SignScorecardInput["role"]): string {
  if (role === "player") return SCORECARD_PLAYER_SIGN_TEXT;
  if (role === "marker") return SCORECARD_MARKER_SIGN_TEXT;
  if (role === "witness") return SCORECARD_WITNESS_SIGN_TEXT;
  return "Firma registrada.";
}

export function signScorecard(
  current: CurrentScorecardState,
  input: SignScorecardInput
): SignScorecardResult {
  if (!input.scorecard_id?.trim()) {
    throw new Error("scorecard_id es requerido.");
  }

  if (!input.signer_name?.trim()) {
    throw new Error("signer_name es requerido.");
  }

  if (current.locked_at || current.status === "locked") {
    throw new Error("La tarjeta ya está cerrada y no puede firmarse.");
  }

  const signedAt = new Date().toISOString();

  const signature: ScorecardSignature = {
    scorecard_id: input.scorecard_id,
    role: input.role,
    signature_type:
      input.signature_type ?? SCORECARD_DEFAULT_SIGNATURE_TYPE,
    signer_name: input.signer_name.trim(),
    signer_player_id: input.signer_player_id ?? null,
    signer_phone: input.signer_phone ?? null,
    signed_text: input.signed_text?.trim() || getDefaultSignedText(input.role),
    signature_payload: input.signature_payload ?? null,
    signed_at: signedAt,
  };

  let player_signed_at = current.player_signed_at ?? null;
  let marker_signed_at = current.marker_signed_at ?? null;
  let witness_signed_at = current.witness_signed_at ?? null;

  let nextStatus: ScorecardStatus = current.status;

  if (input.role === "player") {
    player_signed_at = signedAt;
    nextStatus = getNextStatusAfterSignature(current.status, "player");
  } else if (input.role === "marker") {
    marker_signed_at = signedAt;
    nextStatus = getNextStatusAfterSignature(current.status, "marker");
  } else if (input.role === "witness") {
    witness_signed_at = signedAt;
  } else if (input.role === "staff") {
    nextStatus = current.status;
  }

  const hasPlayer = !!player_signed_at;
  const hasMarker = !!marker_signed_at;

  if (hasPlayer && hasMarker) {
    nextStatus = "signed_complete";
  }

  return {
    signature,
    nextStatus,
    player_signed_at,
    marker_signed_at,
    witness_signed_at,
  };
}