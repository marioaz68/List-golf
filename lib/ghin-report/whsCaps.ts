/**
 * Soft / Hard Cap WHS relativos al Low Handicap Index (mínimo en 365 días).
 * Soft = Low HI + 3.0 · Hard = Low HI + 5.0
 * Sin 365 días de historia de índice el cap NO es evaluable.
 */

export const WHS_LOW_HI_LOOKBACK_DAYS = 365;
export const WHS_SOFT_CAP_STROKES = 3.0;
export const WHS_HARD_CAP_STROKES = 5.0;

export type CapEvaluability = "full" | "partial" | "not_evaluable";

export type WhsCapAssessment = {
  evaluability: CapEvaluability;
  /** Días entre min(revision_date) del jugador y el ancla (hoy / corte). */
  historyDaysAvailable: number;
  /**
   * Low HI de f_ghin_min_index en ventana 365d.
   * null si la función devolvió null (no inventar para caps).
   */
  lowHi: number | null;
  /**
   * Valor mostrado como Low HI: lowHi real, o fallback provisional
   * a players.handicap_index cuando lowHi es null.
   */
  lowHiDisplay: number | null;
  lowHiProvisional: boolean;
  softCap: number | null;
  hardCap: number | null;
  /** Nota corta para UI (ventana parcial / no evaluable). */
  note: string | null;
};

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function isoDaysBefore(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  const d = new Date(t - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function isoDaysAfter(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  const d = new Date(t + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Fecha de hoy en America/Mexico_City (YYYY-MM-DD). */
export function todayMexicoIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function assessWhsCaps(params: {
  lowHiFromFn: number | null;
  playerHiFallback: number | null;
  /** min(revision_date) del jugador; null si no hay filas. */
  playerFirstRevision: string | null;
  /** Ancla para contar días disponibles (hoy, por regla del comité). */
  asOfIso: string;
}): WhsCapAssessment {
  const historyDaysAvailable =
    params.playerFirstRevision != null
      ? daysBetweenIso(params.playerFirstRevision, params.asOfIso)
      : 0;

  if (params.lowHiFromFn == null) {
    return {
      evaluability: "not_evaluable",
      historyDaysAvailable,
      lowHi: null,
      lowHiDisplay: params.playerHiFallback,
      lowHiProvisional: true,
      softCap: null,
      hardCap: null,
      note: `Sin histórico suficiente de índice — soft/hard cap no evaluable (se requieren ${WHS_LOW_HI_LOOKBACK_DAYS} días, disponibles ${historyDaysAvailable})`,
    };
  }

  const softCap =
    Math.round((params.lowHiFromFn + WHS_SOFT_CAP_STROKES) * 10) / 10;
  const hardCap =
    Math.round((params.lowHiFromFn + WHS_HARD_CAP_STROKES) * 10) / 10;

  if (historyDaysAvailable < WHS_LOW_HI_LOOKBACK_DAYS) {
    return {
      evaluability: "partial",
      historyDaysAvailable,
      lowHi: params.lowHiFromFn,
      lowHiDisplay: params.lowHiFromFn,
      lowHiProvisional: false,
      softCap,
      hardCap,
      note: `Cap calculado sobre ventana parcial (${historyDaysAvailable} de ${WHS_LOW_HI_LOOKBACK_DAYS} días). No definitivo.`,
    };
  }

  return {
    evaluability: "full",
    historyDaysAvailable,
    lowHi: params.lowHiFromFn,
    lowHiDisplay: params.lowHiFromFn,
    lowHiProvisional: false,
    softCap,
    hardCap,
    note: null,
  };
}
