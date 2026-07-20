import {
  carryYards,
  CLUB_BY_ID,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import type { LieKind } from "@/lib/distances/detectLie";
import type { WatchSwingMetrics } from "@/lib/distances/swingMetrics";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";
import type { LatLon } from "@/lib/distances/holeBoundary";
import { resolveGroupStartHole } from "@/lib/ritmo/startHole";

export interface HoleShot {
  id: string;
  hole: number;
  strokeNo: number;
  catalogId: string;
  swing: SwingKind;
  plannedYards: number;
  actualYards: number | null;
  from: LatLon;
  to: LatLon | null;
  /** Lie donde quedó la bola (al confirmar caída). */
  lieKind?: LieKind;
  /** Golpe de castigo (p. ej. OB stroke-and-distance). */
  isPenalty?: boolean;
  /** Origen del registro (manual en mapa vs Apple Watch). */
  source?: "manual" | "watch";
  /** Métricas de swing del Apple Watch (velocidad y ángulo back/forward). */
  swingMetrics?: WatchSwingMetrics;
  /** Motivo del castigo cuando isPenalty. */
  penaltyReason?: PenaltyReason;
  plannedAt: number;
  completedAt: number | null;
}

export type PenaltyReason =
  | "ob"
  | "water"
  | "unplayable"
  | "hazard"
  | "lost"
  | "wrong_place"
  | "wrong_ball"
  | "other";

/** Castigos manuales (+1 por clic). OB y lago los maneja el sistema. */
export type ManualPenaltyReason = Exclude<PenaltyReason, "ob" | "water">;

export const MANUAL_PENALTY_OPTIONS: ReadonlyArray<{
  reason: ManualPenaltyReason;
  label: string;
}> = [
  { reason: "unplayable", label: "BI +1" },
  { reason: "hazard", label: "Zanja +1" },
  { reason: "lost", label: "Perdida +1" },
  { reason: "wrong_place", label: "Lugar +1" },
  { reason: "wrong_ball", label: "Equiv. +1" },
  { reason: "other", label: "Otro +1" },
];

export function penaltyReasonLabel(reason?: PenaltyReason | string): string {
  switch (reason) {
    case "ob":
      return "Fuera de límites (OB)";
    case "water":
      return "Lago";
    case "unplayable":
      return "Bola injugable";
    case "hazard":
      return "Zanja";
    case "lost":
      return "Bola perdida";
    case "wrong_place":
      return "Lugar incorrecto";
    case "wrong_ball":
      return "Bola equivocada";
    case "other":
      return "Otro castigo";
    default:
      return "Castigo";
  }
}

export interface HoleShotsStore {
  version: 2;
  byHole: Record<string, HoleShot[]>;
  /** Salida marcada por el jugador al iniciar cada hoyo. */
  teeMarkByHole: Record<string, LatLon>;
  /** Marca de tiempo local/servidor para fusionar copias. */
  updatedAt?: number;
  /** Hoyo de salida de la ronda (1 o 10). */
  roundStartHole?: number;
}

const STORAGE_PREFIX = "listgolf-hole-shots-v2";

export function defaultHoleShotsStore(): HoleShotsStore {
  return { version: 2, byHole: {}, teeMarkByHole: {} };
}

function storageKey(scope?: string): string {
  const s = scope?.trim();
  return s ? `${STORAGE_PREFIX}:${s}` : STORAGE_PREFIX;
}

function migrateStore(raw: unknown): HoleShotsStore {
  if (!raw || typeof raw !== "object") return defaultHoleShotsStore();
  const o = raw as {
    version?: number;
    byHole?: Record<string, HoleShot[]>;
    teeMarkByHole?: Record<string, LatLon>;
    roundStartHole?: number;
  };
  if (o.version === 2 && o.byHole) {
    return {
      version: 2,
      byHole: o.byHole,
      teeMarkByHole: o.teeMarkByHole ?? {},
      roundStartHole:
        typeof o.roundStartHole === "number" &&
        o.roundStartHole >= 1 &&
        o.roundStartHole <= 18
          ? o.roundStartHole
          : undefined,
    };
  }
  if (o.version === 1 && o.byHole) {
    return { version: 2, byHole: o.byHole, teeMarkByHole: {} };
  }
  return defaultHoleShotsStore();
}

export function loadHoleShots(scope?: string): HoleShotsStore {
  if (typeof window === "undefined") return defaultHoleShotsStore();
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) {
      const legacy = window.localStorage.getItem(
        scope?.trim()
          ? `listgolf-hole-shots-v1:${scope.trim()}`
          : "listgolf-hole-shots-v1"
      );
      if (legacy) return migrateStore(JSON.parse(legacy));
      return defaultHoleShotsStore();
    }
    return migrateStore(JSON.parse(raw));
  } catch {
    return defaultHoleShotsStore();
  }
}

export function saveHoleShots(store: HoleShotsStore, scope?: string): void {
  if (typeof window === "undefined") return;
  const stamped: HoleShotsStore = { ...store, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(stamped));
  } catch {
    /* quota / privado */
  }
  try {
    // Import dinámico evita circular deps en SSR.
    void import("@/lib/distances/syncHoleShotsRemote").then(({ queueHoleShotsRemoteSync }) => {
      queueHoleShotsRemoteSync(stamped, scope);
    });
  } catch {
    /* sin sync remoto */
  }
}

/** Golpes completados + salidas marcadas (actividad registrada). */
export function storeActivityScore(store: HoleShotsStore): number {
  let n = 0;
  for (const shots of Object.values(store.byHole)) {
    n += shots.filter((s) => s.completedAt != null).length;
  }
  n += Object.keys(store.teeMarkByHole ?? {}).length;
  return n;
}

function holeLatestShotTs(shots: HoleShot[]): number {
  let best = 0;
  for (const s of shots) {
    const ts = s.completedAt ?? s.plannedAt ?? 0;
    if (ts > best) best = ts;
  }
  return best;
}

/** Fusiona copia local y remota hoyo por hoyo (no pisa castigos de un hoyo con datos viejos de otro). */
export function mergeHoleShotsStores(
  local: HoleShotsStore,
  remote: HoleShotsStore
): HoleShotsStore {
  const holeKeys = new Set([
    ...Object.keys(local.byHole ?? {}),
    ...Object.keys(remote.byHole ?? {}),
  ]);
  const byHole: Record<string, HoleShot[]> = {};
  for (const key of holeKeys) {
    const localShots = local.byHole[key] ?? [];
    const remoteShots = remote.byHole[key] ?? [];
    const localDone = localShots.filter((s) => s.completedAt != null).length;
    const remoteDone = remoteShots.filter((s) => s.completedAt != null).length;
    if (remoteDone > localDone) {
      byHole[key] = remoteShots;
    } else if (localDone > remoteDone) {
      byHole[key] = localShots;
    } else {
      byHole[key] =
        holeLatestShotTs(remoteShots) > holeLatestShotTs(localShots)
          ? remoteShots
          : localShots;
    }
  }
  const teeMarkByHole = { ...remote.teeMarkByHole, ...local.teeMarkByHole };
  const winner = (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? local : remote;
  return {
    version: 2,
    byHole,
    teeMarkByHole,
    roundStartHole: winner.roundStartHole ?? local.roundStartHole ?? remote.roundStartHole,
    updatedAt: Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0),
  };
}

export function shotsForHole(store: HoleShotsStore, hole: number): HoleShot[] {
  return store.byHole[String(hole)] ?? [];
}

/** Golpes nuevos del Watch tras merge remoto (para toast en mini-app). */
export function findNewWatchShots(
  prev: HoleShotsStore,
  next: HoleShotsStore
): HoleShot[] {
  const prevIds = new Set<string>();
  for (const shots of Object.values(prev.byHole ?? {})) {
    for (const s of shots) prevIds.add(s.id);
  }
  const added: HoleShot[] = [];
  for (const shots of Object.values(next.byHole ?? {})) {
    for (const s of shots) {
      if (!prevIds.has(s.id) && s.source === "watch") added.push(s);
    }
  }
  return added;
}

export function holeTeeMark(
  store: HoleShotsStore,
  hole: number
): LatLon | null {
  const m = store.teeMarkByHole[String(hole)];
  return m ? { ...m } : null;
}

export function hasHoleTeeMark(store: HoleShotsStore, hole: number): boolean {
  return Boolean(store.teeMarkByHole[String(hole)]);
}

export function setHoleTeeMark(
  store: HoleShotsStore,
  hole: number,
  point: LatLon
): HoleShotsStore {
  return {
    ...store,
    teeMarkByHole: {
      ...store.teeMarkByHole,
      [String(hole)]: { ...point },
    },
  };
}

export function clearHoleTeeMark(
  store: HoleShotsStore,
  hole: number
): HoleShotsStore {
  const key = String(hole);
  if (!store.teeMarkByHole[key]) return store;
  const { [key]: _, ...rest } = store.teeMarkByHole;
  return { ...store, teeMarkByHole: rest };
}

export function hasLoggedShotsOnHole(
  store: HoleShotsStore,
  hole: number
): boolean {
  return shotsForHole(store, hole).some((s) => s.completedAt != null);
}

/** Ancla del hoyo: dónde se juega el siguiente golpe (no dónde cayó un OB). */
export function lastBallPosition(
  store: HoleShotsStore,
  hole: number,
  catalogTee?: LatLon
): LatLon | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (s.completedAt == null) continue;
    if (s.isPenalty) {
      if (s.penaltyReason === "water" && s.to == null) continue;
      if (s.to) return s.to;
      continue;
    }
    if (s.lieKind === "ob") return { ...s.from };
    if (s.lieKind === "water") continue;
    if (s.to) return s.to;
  }
  return holeTeeMark(store, hole) ?? catalogTee ?? null;
}

export function pendingShotOnHole(
  store: HoleShotsStore,
  hole: number
): HoleShot | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    if (shots[i].completedAt == null) return shots[i];
  }
  return null;
}

export function lastCompletedShot(
  store: HoleShotsStore,
  hole: number
): HoleShot | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    if (shots[i].completedAt != null) return shots[i];
  }
  return null;
}

/** ¿El putt final (≤1 yd) ya quedó registrado como golpe completado? */
export function isFinalTapInPuttRecorded(
  store: HoleShotsStore,
  hole: number
): boolean {
  const last = lastCompletedShot(store, hole);
  if (!last) return false;
  return (
    last.catalogId === "putter" &&
    last.actualYards != null &&
    last.actualYards <= 1 &&
    (last.lieKind === "green" || last.lieKind === "given")
  );
}

export function isGivenPuttRecorded(
  store: HoleShotsStore,
  hole: number
): boolean {
  const last = lastCompletedShot(store, hole);
  return last?.lieKind === "given";
}

/** Registra el putt final (<1 yd) al cerrar el hoyo (entró o quedó dada). */
export function addFinalGreenPutt(
  store: HoleShotsStore,
  hole: number,
  from: LatLon,
  pin: LatLon,
  lieKind: LieKind = "green"
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = completedStrokeCount(store, hole) + 1;
  const now = Date.now();
  const shot: HoleShot = {
    id: `${hole}-${now}-final-${strokeNo}`,
    hole,
    strokeNo,
    catalogId: "putter",
    swing: "full",
    plannedYards: 1,
    actualYards: 1,
    from: { ...from },
    to: { ...pin },
    lieKind,
    plannedAt: now,
    completedAt: now,
  };
  return {
    ...store,
    byHole: { ...store.byHole, [key]: [...prev, shot] },
  };
}

export function isTapInPendingPutt(
  store: HoleShotsStore,
  hole: number
): HoleShot | null {
  return pendingPutterShotOnHole(store, hole);
}

/** Cualquier putt pendiente (p. ej. segundo putt en green antes de marcar caída). */
export function pendingPutterShotOnHole(
  store: HoleShotsStore,
  hole: number
): HoleShot | null {
  const pending = pendingShotOnHole(store, hole);
  if (pending?.catalogId === "putter") return pending;
  return null;
}

/** Golpes mostrados en el diálogo entró / quedó dada (incluye putt pendiente). */
export function finishPromptStrokeCount(
  store: HoleShotsStore,
  hole: number
): number {
  const completed = completedStrokeCount(store, hole);
  return pendingShotOnHole(store, hole) ? completed + 1 : completed;
}

/** Registra putt concedido: siempre +1 golpe (putt pendiente o tap-in dada). */
export function recordGivenPutt(
  store: HoleShotsStore,
  hole: number,
  pin: LatLon
): { store: HoleShotsStore; totalStrokes: number } {
  if (isGivenPuttRecorded(store, hole)) {
    return { store, totalStrokes: completedStrokeCount(store, hole) };
  }

  const pending = pendingShotOnHole(store, hole);
  if (pending) {
    const next = completeShotArrival(
      store,
      hole,
      pending.id,
      pin,
      Math.max(1, pending.plannedYards),
      "given"
    );
    return { store: next, totalStrokes: completedStrokeCount(next, hole) };
  }

  const from =
    lastBallPosition(store, hole) ?? holeTeeMark(store, hole) ?? pin;
  const next = addFinalGreenPutt(store, hole, from, pin, "given");
  return { store: next, totalStrokes: completedStrokeCount(next, hole) };
}

/** Registra que la bola entró al hoyo. */
export function recordHoledPutt(
  store: HoleShotsStore,
  hole: number,
  pin: LatLon
): { store: HoleShotsStore; totalStrokes: number } {
  const pending = pendingShotOnHole(store, hole);
  if (pending) {
    const next = completeShotArrival(
      store,
      hole,
      pending.id,
      pin,
      Math.max(1, pending.plannedYards),
      "green"
    );
    return { store: next, totalStrokes: completedStrokeCount(next, hole) };
  }
  return { store, totalStrokes: completedStrokeCount(store, hole) };
}

export function shotClubLabel(
  catalogId: string,
  swing: SwingKind,
  isPenalty?: boolean,
  penaltyReason?: PenaltyReason
): string {
  if (isPenalty || catalogId === "penalty") {
    return `${penaltyReasonLabel(penaltyReason)} +1`;
  }
  const cat = CLUB_BY_ID[catalogId];
  const short = cat?.shortLabel ?? catalogId;
  return swing === "three_quarter" ? `${short} 3/4` : `${short} full`;
}

export function addPlannedShot(
  store: HoleShotsStore,
  hole: number,
  from: LatLon,
  catalogId: string,
  swing: SwingKind,
  plannedYards: number,
  options?: { id?: string; source?: HoleShot["source"]; swingMetrics?: WatchSwingMetrics }
): { store: HoleShotsStore; shot: HoleShot } {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = completedStrokeCount(store, hole) + 1;
  const shot: HoleShot = {
    id: options?.id ?? `${hole}-${Date.now()}-${strokeNo}`,
    hole,
    strokeNo,
    catalogId,
    swing,
    plannedYards,
    actualYards: null,
    from: { ...from },
    to: null,
    source: options?.source,
    swingMetrics: options?.swingMetrics,
    plannedAt: Date.now(),
    completedAt: null,
  };
  const next = {
    ...store,
    byHole: { ...store.byHole, [key]: [...prev, shot] },
  };
  return { store: next, shot };
}

export function completeShotArrival(
  store: HoleShotsStore,
  hole: number,
  shotId: string,
  to: LatLon,
  actualYards: number,
  lieKind?: LieKind
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: prev.map((s) =>
        s.id === shotId
          ? {
              ...s,
              to: { ...to },
              actualYards,
              lieKind,
              completedAt: Date.now(),
            }
          : s
      ),
    },
  };
}

export function completedStrokeCount(
  store: HoleShotsStore,
  hole: number
): number {
  return shotsForHole(store, hole).filter((s) => s.completedAt != null).length;
}

/** Total de golpes completados en el hoyo (incluye castigos). */
export const holeStrokeCount = completedStrokeCount;

function lieKindForPenalty(reason: PenaltyReason): LieKind {
  if (reason === "ob") return "ob";
  if (reason === "water" || reason === "hazard") return "water";
  return "rough";
}

function appendPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  at: LatLon,
  penaltyReason: PenaltyReason
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = completedStrokeCount(store, hole) + 1;
  const now = Date.now();
  const penalty: HoleShot = {
    id: `${hole}-${now}-${strokeNo}-penalty-${penaltyReason}`,
    hole,
    strokeNo,
    catalogId: "penalty",
    swing: "full",
    plannedYards: 0,
    actualYards: 0,
    from: { ...at },
    to: { ...at },
    lieKind: lieKindForPenalty(penaltyReason),
    isPenalty: true,
    penaltyReason,
    plannedAt: now,
    completedAt: now,
  };
  return {
    ...store,
    byHole: { ...store.byHole, [key]: [...prev, penalty] },
  };
}

function appendObPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  replayFrom: LatLon
): HoleShotsStore {
  return appendPenaltyStroke(store, hole, replayFrom, "ob");
}

function appendWaterPenaltyAwaitingDrop(
  store: HoleShotsStore,
  hole: number,
  from: LatLon
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = completedStrokeCount(store, hole) + 1;
  const now = Date.now();
  const penalty: HoleShot = {
    id: `${hole}-${now}-${strokeNo}-penalty-water`,
    hole,
    strokeNo,
    catalogId: "penalty",
    swing: "full",
    plannedYards: 0,
    actualYards: 0,
    from: { ...from },
    to: null,
    lieKind: "water",
    isPenalty: true,
    penaltyReason: "water",
    plannedAt: now,
    completedAt: now,
  };
  return {
    ...store,
    byHole: { ...store.byHole, [key]: [...prev, penalty] },
  };
}

/** Castigo de lago pendiente de marcar suelta atrás del agua. */
export function pendingWaterDropOnHole(
  store: HoleShotsStore,
  hole: number
): HoleShot | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (
      s.isPenalty &&
      s.penaltyReason === "water" &&
      s.completedAt != null &&
      s.to == null
    ) {
      return s;
    }
  }
  return null;
}

export function setWaterPenaltyDrop(
  store: HoleShotsStore,
  hole: number,
  penaltyShotId: string,
  drop: LatLon
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: prev.map((s) =>
        s.id === penaltyShotId &&
        s.isPenalty &&
        s.penaltyReason === "water"
          ? { ...s, to: { ...drop } }
          : s
      ),
    },
  };
}

function applyWaterPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  waterShotId: string,
  from: LatLon
): HoleShotsStore | null {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const waterIdx = prev.findIndex((s) => s.id === waterShotId);
  if (waterIdx < 0) return null;
  const waterShot = prev[waterIdx];
  if (waterShot.completedAt == null || waterShot.lieKind !== "water") return null;

  const next = prev[waterIdx + 1];
  if (next?.isPenalty && next.penaltyReason === "water") {
    return store;
  }

  return appendWaterPenaltyAwaitingDrop(store, hole, from);
}

/** Tras marcar caída en lago: +1 y espera toque de suelta atrás del agua. */
export function ensureWaterPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  waterShotId: string,
  from: LatLon
): HoleShotsStore {
  const applied = applyWaterPenaltyStroke(store, hole, waterShotId, from);
  if (applied) return applied;
  return appendWaterPenaltyAwaitingDrop(store, hole, from);
}

/** Anota +1 por clic (BI, zanja o bola perdida) sin mover la bola. */
export function addManualPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  at: LatLon,
  reason: ManualPenaltyReason
): HoleShotsStore {
  return appendPenaltyStroke(store, hole, at, reason);
}

/**
 * Tras marcar OB: registra castigo (+1) y devuelve el punto desde el que se
 * repite (stroke-and-distance = donde estabas antes del golpe que fue a OB).
 */
export function applyObPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  obShotId: string,
  replayFromHint?: LatLon
): { store: HoleShotsStore; replayFrom: LatLon } | null {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const obIdx = prev.findIndex((s) => s.id === obShotId);
  if (obIdx < 0) return null;
  const obShot = prev[obIdx];
  if (obShot.completedAt == null) return null;

  const replayFrom = replayFromHint ?? { ...obShot.from };

  if (prev[obIdx + 1]?.isPenalty) {
    return { store, replayFrom };
  }

  return {
    store: appendObPenaltyStroke(store, hole, replayFrom),
    replayFrom,
  };
}

/** Garantiza el +1 de castigo OB tras confirmar la caída fuera. */
export function ensureObPenaltyStroke(
  store: HoleShotsStore,
  hole: number,
  obShotId: string,
  replayFrom: LatLon
): { store: HoleShotsStore; replayFrom: LatLon } {
  const applied = applyObPenaltyStroke(store, hole, obShotId, replayFrom);
  if (applied) return applied;
  return {
    store: appendObPenaltyStroke(store, hole, replayFrom),
    replayFrom,
  };
}

export function clearHoleShots(
  store: HoleShotsStore,
  hole: number
): HoleShotsStore {
  const key = String(hole);
  const nextByHole = { ...store.byHole };
  delete nextByHole[key];
  const nextTee = { ...store.teeMarkByHole };
  delete nextTee[key];
  return { version: 2, byHole: nextByHole, teeMarkByHole: nextTee };
}

export function removeLastShotOnHole(
  store: HoleShotsStore,
  hole: number
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  if (prev.length === 0) return store;
  const trimmed = prev.slice(0, -1);
  const renumbered = trimmed.map((s, i) => ({ ...s, strokeNo: i + 1 }));
  return {
    ...store,
    byHole: { ...store.byHole, [key]: renumbered },
  };
}

export function hasRemovableShotsOnHole(
  store: HoleShotsStore,
  hole: number
): boolean {
  return shotsForHole(store, hole).length > 0;
}

/** Hoyo con el golpe más reciente (para retomar la vuelta tras corregir). */
export function playHeadHoleFromStore(store: HoleShotsStore): number | null {
  let bestHole: number | null = null;
  let bestTs = 0;
  for (let h = 1; h <= 18; h++) {
    for (const s of shotsForHole(store, h)) {
      const ts = s.completedAt ?? s.plannedAt ?? 0;
      if (ts >= bestTs) {
        bestTs = ts;
        bestHole = h;
      }
    }
  }
  return bestHole;
}

export function cancelPendingShot(
  store: HoleShotsStore,
  hole: number,
  shotId: string
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: prev.filter((s) => s.id !== shotId),
    },
  };
}

/** Reposiciona la bola en el green (clic derecho / arrastre). */
export function relocateBallOnGreen(
  store: HoleShotsStore,
  hole: number,
  position: LatLon,
  lieKind: LieKind
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const pending = pendingShotOnHole(store, hole);

  if (pending && !pending.isPenalty) {
    return {
      ...store,
      byHole: {
        ...store.byHole,
        [key]: prev.map((s) =>
          s.id === pending.id ? { ...s, from: { ...position } } : s
        ),
      },
    };
  }

  const last = lastCompletedShot(store, hole);
  if (!last || last.isPenalty || !last.to) return store;

  const actualYards =
    lieKind === "green"
      ? Math.max(
          1,
          Math.round(
            yardsBetween(
              last.from.lat,
              last.from.lon,
              position.lat,
              position.lon
            )
          )
        )
      : last.actualYards;

  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: prev.map((s) =>
        s.id === last.id
          ? {
              ...s,
              to: { ...position },
              lieKind,
              actualYards: actualYards ?? s.actualYards,
            }
          : s
      ),
    },
  };
}

/** Deshace la caída confirmada y deja el golpe pendiente de marcar en el mapa. */
export function resetShotArrival(
  store: HoleShotsStore,
  hole: number,
  shotId: string
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: prev.map((s) =>
        s.id === shotId
          ? {
              ...s,
              to: null,
              actualYards: null,
              lieKind: undefined,
              completedAt: null,
            }
          : s
      ),
    },
  };
}

export function plannedVsActualDelta(shot: HoleShot): number | null {
  if (shot.actualYards == null) return null;
  return shot.actualYards - shot.plannedYards;
}

export function isHoleFinished(store: HoleShotsStore, hole: number): boolean {
  return (
    isFinalTapInPuttRecorded(store, hole) || isGivenPuttRecorded(store, hole)
  );
}

export function roundHoleOrder(startHole: number): number[] {
  const start = Math.min(18, Math.max(1, Math.floor(startHole)));
  return Array.from({ length: 18 }, (_, i) => ((start - 1 + i) % 18) + 1);
}

export function roundLastHole(startHole: number): number {
  return roundHoleOrder(startHole)[17];
}

export function isRoundFinishingHole(hole: number, startHole: number): boolean {
  return hole === roundLastHole(startHole);
}

export interface RoundStrokeTotals {
  startHole: number;
  firstNineHoles: number[];
  secondNineHoles: number[];
  firstNine: number;
  secondNine: number;
  total: number;
}

export function roundNineLabel(holes: number[]): string {
  if (holes.length === 0) return "—";
  const first = holes[0];
  const last = holes[holes.length - 1];
  return first === last ? `hoyo ${first}` : `hoyos ${first}–${last}`;
}

export function roundStrokeTotals(
  store: HoleShotsStore,
  startHole: number
): RoundStrokeTotals {
  const order = roundHoleOrder(startHole);
  const firstNineHoles = order.slice(0, 9);
  const secondNineHoles = order.slice(9);
  const sumNine = (holes: number[]) =>
    holes.reduce((acc, h) => acc + completedStrokeCount(store, h), 0);
  const firstNine = sumNine(firstNineHoles);
  const secondNine = sumNine(secondNineHoles);
  return {
    startHole,
    firstNineHoles,
    secondNineHoles,
    firstNine,
    secondNine,
    total: firstNine + secondNine,
  };
}

export function inferRoundStartHole(store: HoleShotsStore): number {
  if (
    typeof store.roundStartHole === "number" &&
    store.roundStartHole >= 1 &&
    store.roundStartHole <= 18
  ) {
    return store.roundStartHole;
  }
  const captured: number[] = [];
  for (let h = 1; h <= 18; h++) {
    if (isHoleFinished(store, h)) captured.push(h);
  }
  return resolveGroupStartHole(null, null, captured);
}

export function withRoundStartHole(
  store: HoleShotsStore,
  startHole: number
): HoleShotsStore {
  const hole = Math.min(18, Math.max(1, Math.floor(startHole)));
  return { ...store, roundStartHole: hole };
}

export { carryYards };
