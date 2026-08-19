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

/** Golpes que se registran cuando el jugador levanta (X) en match play. */
export const PICKED_UP_STROKES = 10;

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
  /** Match play: el jugador no terminó el hoyo (levantó). strokes = 10 y
   *  la UI muestra X; para puntos cuenta como derrota automática de bola alta. */
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
  /** Tarjeta cerrada oficialmente (`scorecards.locked_at`). */
  lockedAt?: string | null;
  /**
   * Match play: golpes de ventaja recibidos por hoyo (0 omitido, 1 o 2).
   * Precalculados con PH del match (bola baja vs baja / alta vs alta).
   * Independiente del score capturado; el capturador ve quién recibe.
   */
  strokesByHole?: Partial<Record<HoleNumber, number>>;
  /** PH de juego usado para el match (referencia en UI). */
  playingHandicap?: number | null;
  /** Rol de bola dentro de su pareja (low_high). */
  ballRole?: "baja" | "alta" | null;
  /** "top" | "bottom" pareja del match (para colorear MATCH). */
  matchSide?: "top" | "bottom" | null;
};

export type WitnessAssignmentPayload = {
  entryId: string;
  witnessEntryId: string;
};

/** Las dos parejas de un grupo (2×2). Null si el grupo no es de parejas. */
export type PairSidesPayload = {
  a: string[];
  b: string[];
};

/** Progresión hoyo por hoyo del match (puntos acumulados después de cada
 *  hoyo). Solo incluye hoyos que ya están capturados. */
export type GroupMatchPlayProgressionRow = {
  hole_no: number;
  top_cum: number;
  bottom_cum: number;
  /** Texto corto del estado tras el hoyo: "AS", "A+1.5", "B+0.5", etc. */
  label: string;
  /** Quién va arriba: top / bottom / empate. */
  lead: "top" | "bottom" | "as";
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
  /** Etiquetas de las parejas (nombres cortos). */
  topLabel?: string | null;
  bottomLabel?: string | null;
  /** Iniciales compactas para la fila MATCH (p. ej. "SC" / "CD"). */
  topShort?: string | null;
  bottomShort?: string | null;
  /**
   * Golpes de ventaja por entry y hoyo (precalculados).
   * Clave: entryId → hole_no → golpes (1 o 2).
   */
  strokesByEntry?: Record<string, Partial<Record<number, number>>>;
  /** PH por entry. */
  phByEntry?: Record<string, number | null>;
  /** Baja/alta por entry. */
  ballRoleByEntry?: Record<string, "baja" | "alta">;
  /** top/bottom pair por entry. */
  sideByEntry?: Record<string, "top" | "bottom">;
  /** entry_ids de cada pareja (orden: a, b). En individual, un id por lado. */
  topEntryIds?: string[];
  bottomEntryIds?: string[];
  /** Individual (1 vs 1) o parejas. */
  matchType?: "individual" | "pairs";
  /** `matchplay_matches.id` (cuadro oficial) si las parejas del grupo
   *  coinciden con un match real publicado. null si no hay cuadro. */
  matchplayMatchId?: string | null;
  /** True si el match ya está marcado como `completed` en DB. */
  matchplayCompleted?: boolean;
};

export type GroupCapturePayload = {
  groupId: string;
  roundId: string;
  roundDate?: string | null;
  /** Ronda cerrada automáticamente por cambio de fecha (día anterior). */
  captureClosedByDate?: boolean;
  tournamentId: string | null;
  groupNo: number | null;
  startingHole: number | null;
  teeTime: string | null;
  tournamentName: string | null;
  /** `settings.format.matchplay_variant` del torneo (`"ryder"` | undefined). */
  matchplayVariant: string | null;
  /** Número de ronda del torneo (rounds.round_no), p. ej. 2. */
  roundNo: number | null;
  /** Etiqueta de la etapa del cuadro de match play: "Octavos", "Cuartos",
   *  "Semifinal", "Final", "Dieciseisavos"… null si no es match play o no
   *  se pudo derivar. */
  bracketRoundLabel: string | null;
  players: GroupCapturePlayer[];
  witnesses: WitnessAssignmentPayload[];
  /** Presente cuando el grupo es un partido de parejas (2 vs 2). */
  pairSides?: PairSidesPayload | null;
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
