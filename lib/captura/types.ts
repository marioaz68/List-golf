export type HoleNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18;

export type HoleScores = Record<HoleNumber, number | null>;

export type GroupCapturePlayer = {
  entryId: string;
  playerId: string;
  name: string;
  initials: string;
  scores: HoleScores;
  /** Si la celda está en rojo: alguien modificó el score y se espera testigo. */
  pending: Partial<Record<HoleNumber, boolean>>;
  /** Score privado del jugador ("Mi Tarjeta"). Solo se incluye si el cliente
   *  está autorizado para verla (?me=entryId del propio jugador o caddie). */
  privateScores?: HoleScores;
  /** Categoría del jugador (para deep-link a resultados en vivo). */
  categoryId?: string | null;
};

export type WitnessAssignmentPayload = {
  entryId: string;
  witnessEntryId: string;
};

export type GroupCapturePayload = {
  groupId: string;
  roundId: string;
  tournamentId: string | null;
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
  players: GroupCapturePlayer[];
  witnesses: WitnessAssignmentPayload[];
  /** entryId del jugador identificado por el link (?me=...). Null si el
   *  visitante abrió un link genérico. */
  myEntryId: string | null;
  /** Si el visitante es caddie: lista de entry_ids cuyas tarjetas privadas
   *  puede leer/editar. */
  caddieForEntryIds: string[];
};
