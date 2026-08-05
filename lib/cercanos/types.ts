/** Máximo de lugares premiados por par 3 (1.º = más cercano). */
export const CLOSEST_TO_PIN_MAX_PRIZES = 15;

export type ClosestToPinEntryRow = {
  id: string;
  tournament_id: string;
  round_id: string;
  hole_number: number;
  entry_id: string;
  distance_cm: number;
  group_id: string | null;
  note: string | null;
  updated_at: string;
};

export type ClosestToPinStanding = {
  position: number;
  tied: boolean;
  entryId: string;
  playerName: string;
  categoryCode: string | null;
  distanceCm: number;
  groupNo: number | null;
  /** Firma del capturista (staff). */
  capturistSigned: boolean;
  capturistSignerName: string | null;
  /** Aceptación del jugador en su teléfono. */
  playerAccepted: boolean;
  playerSignerName: string | null;
};

export type ClosestToPinHoleBoard = {
  holeNumber: number;
  par: number;
  standings: ClosestToPinStanding[];
  totalEntries: number;
};

export type CaptureGroupPlayer = {
  entryId: string;
  playerId: string | null;
  name: string;
  playerNumber: number | null;
  categoryCode: string | null;
  /** Distancia ya capturada (cm), si existe. */
  distanceCm: number | null;
  entryRowId: string | null;
  capturistSigned: boolean;
  capturistSignerName: string | null;
  playerAccepted: boolean;
  playerSignerName: string | null;
  /** Link de aceptación en teléfono del jugador (si hay distancia). */
  acceptUrl: string | null;
};

export type CaptureGroupOption = {
  id: string;
  groupNo: number;
  teeTime: string | null;
  startingHole: number | null;
  memberCount: number;
};
