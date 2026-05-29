/** Hoyos 1-18 corresponden al recorrido normal. Los hoyos 19-27 son la
 *  repetición física de los hoyos 1-9 que se juega como desempate
 *  (muerte súbita) cuando el match termina empatado al hoyo 18. */
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
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27;

export type HoleScores = Record<HoleNumber, number | null>;

/** Convierte un hoyo de desempate (19-27) en su hoyo equivalente del
 *  recorrido normal (1-9). Devuelve el mismo número para 1-18. */
export function playoffSourceHole(hole: number): number {
  if (hole >= 19 && hole <= 27) return hole - 18;
  return hole;
}

/** True si `hole` pertenece al tramo de desempate (19-27). */
export function isPlayoffHole(hole: number): boolean {
  return hole >= 19 && hole <= 27;
}

export type CardSignaturePayload = {
  signedByPlayerAt: string | null;
  signedByWitnessAt: string | null;
  signedByWitnessEntryId: string | null;
};

export type GroupCapturePlayer = {
  entryId: string;
  playerId: string;
  name: string;
  initials: string;
  scores: HoleScores;
  /** Match play: el jugador no terminó el hoyo (levantó). strokes queda null
   *  y para puntos cuenta como derrota automática de la bola alta. */
  pickedUp?: Partial<Record<HoleNumber, boolean>>;
  /** Si la celda está en rojo: alguien modificó el score y se espera testigo. */
  pending: Partial<Record<HoleNumber, boolean>>;
  /** Score privado del jugador ("Mi Tarjeta"). Solo se incluye si el cliente
   *  está autorizado para verla (?me=entryId del propio jugador o caddie). */
  privateScores?: HoleScores;
  /** Categoría del jugador (para deep-link a resultados en vivo). */
  categoryId?: string | null;
  /** Firmas de la tarjeta (jugador + testigo). */
  signatures?: CardSignaturePayload;
};

export type WitnessAssignmentPayload = {
  entryId: string;
  witnessEntryId: string;
};

/** Progresión hoyo por hoyo del match (puntos acumulados después de cada
 *  hoyo). Solo incluye hoyos que ya están capturados. */
export type GroupMatchPlayProgressionRow = {
  hole_no: number;
  top_cum: number;
  bottom_cum: number;
  /** Texto corto del estado tras el hoyo: "AS", "T+1", "B+0.5", etc. */
  label: string;
};

/** Match play: estado de la competencia del grupo (decidida o necesita desempate). */
export type GroupMatchPlayCapture = {
  /** Hoyo donde se decidió (1-18 normal; 19-27 si desempate). null si AS al 18 pendiente. */
  decidedAtHole: number | null;
  resultText: string;
  /** Hoyos que deben estar completos para firmar (depende del estado actual). */
  holesRequired: number;
  /** True si el match terminó en desempate. */
  viaPlayoff?: boolean;
  /** Posición del desempate (1-9) donde se cerró. */
  playoffHole?: number;
  /** True si AS al 18 con desempate por jugar. */
  needsPlayoff?: boolean;
  /** Desempate en curso: hoyo (1-9) con al menos un score faltante. */
  playoffPendingHole?: number;
  /** Progresión del match hoyo por hoyo (solo hoyos capturados). */
  progression?: GroupMatchPlayProgressionRow[];
  /** Etiquetas opcionales de las parejas (para tooltip / leyenda). */
  topLabel?: string | null;
  bottomLabel?: string | null;
  /** `matchplay_matches.id` (cuadro oficial) si las parejas del grupo
   *  coinciden con un match real publicado. null si no hay cuadro. */
  matchplayMatchId?: string | null;
  /** True si el match ya está marcado como `completed` en DB. */
  matchplayCompleted?: boolean;
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
  /** Si el torneo es match play y el partido del grupo ya terminó por
   *  marcador, permite firmar sin completar los 18 hoyos. */
  matchPlay?: GroupMatchPlayCapture | null;
};
