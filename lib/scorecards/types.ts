export type ScorecardStatus =
  | "draft"
  | "in_review"
  | "signed_marker"
  | "signed_player"
  | "signed_complete"
  | "locked"
  | "needs_staff_review"
  | "disputed";

export type ScorecardSignatureRole =
  | "player"
  | "marker"
  | "witness"
  | "staff";

export type ScorecardSignatureType =
  | "tap"
  | "typed_name"
  | "drawn"
  | "otp";

export type HoleScoreRow = {
  id?: string;
  round_score_id?: string | null;
  entry_id?: string | null;
  round_id?: string | null;
  hole_no?: number | null;
  hole_number?: number | null;
  strokes?: number | null;
  created_at?: string | null;
};

export type ScorecardHole = {
  hole: number;
  strokes: number | null;
};

export type ScorecardTotals = {
  out: number;
  in: number;
  gross: number;
  holesPlayed: number;
};

export type ScorecardSignature = {
  id?: string;
  scorecard_id: string;
  role: ScorecardSignatureRole;
  signature_type: ScorecardSignatureType;
  signer_name: string;
  signer_player_id?: string | null;
  signer_phone?: string | null;
  signed_text?: string | null;
  signature_payload?: string | null;
  signed_at?: string | null;
};

export type ScorecardSummary = {
  scorecard_id: string;
  entry_id: string;
  tournament_id?: string | null;
  round_id: string;
  status: ScorecardStatus;
  holes: ScorecardHole[];
  totals: ScorecardTotals;
  is_disqualified?: boolean | null;
  is_withdrawn?: boolean | null;
  marker_signed_at?: string | null;
  player_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
};

export type BuildScorecardInput = {
  scorecard_id: string;
  entry_id: string;
  round_id: string;
  tournament_id?: string | null;
  status?: ScorecardStatus;
  holeScores: HoleScoreRow[];
  is_disqualified?: boolean | null;
  is_withdrawn?: boolean | null;
  marker_signed_at?: string | null;
  player_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
};

export type SignScorecardInput = {
  scorecard_id: string;
  role: ScorecardSignatureRole;
  signer_name: string;
  signature_type?: ScorecardSignatureType;
  signer_player_id?: string | null;
  signer_phone?: string | null;
  signed_text?: string | null;
  signature_payload?: string | null;
};

export type ScorecardAuditAction =
  | "score_created"
  | "score_updated"
  | "signature_added"
  | "signature_removed"
  | "status_changed"
  | "locked"
  | "unlocked"
  | "disputed"
  | "resolved";

export type ScorecardAuditLogRow = {
  id?: string;
  scorecard_id: string;
  action: ScorecardAuditAction;
  actor_type: ScorecardSignatureRole | "system";
  actor_id?: string | null;
  actor_name?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  created_at?: string | null;
};