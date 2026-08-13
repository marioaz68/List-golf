import type { CcqTeeCode } from "./ccqCourse";

export type GhinEscenarioRow = {
  n_solicitado: number;
  n_usado: number;
  indice: number | null;
  desde: string | null;
  hasta: string | null;
  es_historico: boolean;
  universo: number;
};

export type GhinHoleAvgRow = {
  hoyo: number;
  promedio: number | null;
  promedio_mejores10: number | null;
  n_rondas: number;
  desde: string | null;
  hasta: string | null;
  es_historico: boolean;
};

export type ScenarioKey =
  | "hi_torneo"
  | "whs_8_20"
  | "best_8_year"
  | "best_10_year"
  | "best_15_year"
  | "best_20_year"
  | "avg_all_year";

export type ScenarioBar = {
  key: ScenarioKey;
  label: string;
  color: string;
  index: number | null;
  ch: number | null;
  hp: number | null;
  nUsed: number | null;
  nUniverse: number | null;
  esHistorico: boolean;
  periodLabel: string | null;
};

export type ScenarioTableRow = ScenarioBar & {
  deltaHi: number | null;
  deltaHp: number | null;
};

export type MonthlyHiPoint = {
  /** ISO YYYY-MM-DD de la revisión (una fila = un punto). */
  date: string;
  label: string;
  hi: number;
};

export type VerdictStatus = "normal" | "revisar" | "sin_datos";

export type GhinLiveReportData = {
  playerId: string;
  fullName: string;
  ghin: string | null;
  gender: "M" | "F" | "X" | null;
  tournamentId: string | null;
  tournamentName: string | null;
  enrolled: boolean;
  provisional: boolean;
  teeCode: CcqTeeCode;
  teeCr: number;
  teeSlope: number;
  teePar: number;

  /** KPIs */
  hiTorneo: number | null;
  hiWhsOfficial: number | null;
  hiBest10Year: number | null;
  hiBest10Historico: boolean;
  hiSoloTorneos: number | null;
  hiSoloTorneosN: number;
  hiSoloTorneosNd: boolean;
  ch100: number | null;
  hp80: number | null;

  activity: {
    rondasTotal: number;
    rondasAnio: number;
    rondas3Anios: number;
    difPromAnio: number | null;
    primera: string | null;
    ultima: string | null;
  } | null;

  scenarios: ScenarioBar[];
  scenarioTable: ScenarioTableRow[];
  monthlyHi: MonthlyHiPoint[];
  holes: GhinHoleAvgRow[];
  holesHistorico: boolean;
  holesPeriod: string | null;
  strokesByHole: number[];
  netAvgs: number[];
  netBest10: number[];

  verdict: VerdictStatus;
  verdictNote: string | null;
  anyHistorico: boolean;

  /**
   * LIMITACIÓN CONOCIDA: ghin_index_revisions arranca 2026-05-01.
   * f_ghin_min_index necesita carry-in anterior al inicio de ventana;
   * si devuelve null caemos a players.handicap_index.
   */
  minIndexFallbackUsed: boolean;

  /**
   * Soft / Hard Cap WHS vs Low HI (365 días).
   * Si evaluability === 'not_evaluable' NO mostrar soft/hard como números
   * válidos; excluir de cualquier promedio/conteo agregado.
   */
  caps: {
    evaluability: "full" | "partial" | "not_evaluable";
    historyDaysAvailable: number;
    lowHi: number | null;
    lowHiDisplay: number | null;
    lowHiProvisional: boolean;
    softCap: number | null;
    hardCap: number | null;
    note: string | null;
  };

  /**
   * Cortes reales por fuente (ISO YYYY-MM-DD). No usar una sola fecha
   * "vigente al…" ni new Date(): las tablas no avanzan al unísono.
   * - revisions: max(revision_date) de toda ghin_index_revisions
   * - rounds: max(date_played) de ghin_rounds para este ghin_number
   */
  dataCutoffs: {
    revisions: string | null;
    rounds: string | null;
  };
};
