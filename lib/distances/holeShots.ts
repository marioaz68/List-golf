import {
  carryYards,
  CLUB_BY_ID,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import type { LieKind } from "@/lib/distances/detectLie";
import type { LatLon } from "@/lib/distances/holeBoundary";

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
  plannedAt: number;
  completedAt: number | null;
}

export interface HoleShotsStore {
  version: 2;
  byHole: Record<string, HoleShot[]>;
  /** Salida marcada por el jugador al iniciar cada hoyo. */
  teeMarkByHole: Record<string, LatLon>;
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
  };
  if (o.version === 2 && o.byHole) {
    return {
      version: 2,
      byHole: o.byHole,
      teeMarkByHole: o.teeMarkByHole ?? {},
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
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(store));
  } catch {
    /* quota / privado */
  }
}

export function shotsForHole(store: HoleShotsStore, hole: number): HoleShot[] {
  return store.byHole[String(hole)] ?? [];
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

/** Ancla del hoyo: última bola confirmada, o salida del jugador, o tee del catálogo. */
export function lastBallPosition(
  store: HoleShotsStore,
  hole: number,
  catalogTee?: LatLon
): LatLon | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (s.completedAt != null && s.to) return s.to;
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
    last.lieKind === "green"
  );
}

/** Registra el putt final (<1 yd) al cerrar el hoyo (entró o quedó dada). */
export function addFinalGreenPutt(
  store: HoleShotsStore,
  hole: number,
  from: LatLon,
  pin: LatLon
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = prev.filter((s) => s.completedAt != null).length + 1;
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
    lieKind: "green",
    plannedAt: now,
    completedAt: now,
  };
  return {
    ...store,
    byHole: { ...store.byHole, [key]: [...prev, shot] },
  };
}

export function shotClubLabel(catalogId: string, swing: SwingKind): string {
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
  plannedYards: number
): { store: HoleShotsStore; shot: HoleShot } {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  const strokeNo = prev.filter((s) => s.completedAt != null).length + 1;
  const shot: HoleShot = {
    id: `${hole}-${Date.now()}-${strokeNo}`,
    hole,
    strokeNo,
    catalogId,
    swing,
    plannedYards,
    actualYards: null,
    from: { ...from },
    to: null,
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

export function plannedVsActualDelta(shot: HoleShot): number | null {
  if (shot.actualYards == null) return null;
  return shot.actualYards - shot.plannedYards;
}

export { carryYards };
