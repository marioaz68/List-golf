import {
  carryYards,
  CLUB_BY_ID,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
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
  plannedAt: number;
  completedAt: number | null;
}

export interface HoleShotsStore {
  version: 1;
  byHole: Record<string, HoleShot[]>;
}

const STORAGE_PREFIX = "listgolf-hole-shots-v1";

export function defaultHoleShotsStore(): HoleShotsStore {
  return { version: 1, byHole: {} };
}

function storageKey(scope?: string): string {
  const s = scope?.trim();
  return s ? `${STORAGE_PREFIX}:${s}` : STORAGE_PREFIX;
}

export function loadHoleShots(scope?: string): HoleShotsStore {
  if (typeof window === "undefined") return defaultHoleShotsStore();
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return defaultHoleShotsStore();
    const parsed = JSON.parse(raw) as HoleShotsStore;
    if (parsed?.version !== 1 || !parsed.byHole) return defaultHoleShotsStore();
    return parsed;
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

export function hasLoggedShotsOnHole(
  store: HoleShotsStore,
  hole: number
): boolean {
  return shotsForHole(store, hole).some((s) => s.completedAt != null);
}

/** Última bola confirmada en el hoyo; si no hay, usa el tee. */
export function lastBallPosition(
  store: HoleShotsStore,
  hole: number,
  tee: LatLon | undefined
): LatLon | null {
  const shots = shotsForHole(store, hole);
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (s.completedAt != null && s.to) return s.to;
  }
  return tee ?? null;
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
    version: 1 as const,
    byHole: { ...store.byHole, [key]: [...prev, shot] },
  };
  return { store: next, shot };
}

export function completeShotArrival(
  store: HoleShotsStore,
  hole: number,
  shotId: string,
  to: LatLon,
  actualYards: number
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    version: 1,
    byHole: {
      ...store.byHole,
      [key]: prev.map((s) =>
        s.id === shotId
          ? {
              ...s,
              to: { ...to },
              actualYards,
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
  if (!store.byHole[key]) return store;
  const { [key]: _, ...rest } = store.byHole;
  return { version: 1, byHole: rest };
}

export function cancelPendingShot(
  store: HoleShotsStore,
  hole: number,
  shotId: string
): HoleShotsStore {
  const key = String(hole);
  const prev = store.byHole[key] ?? [];
  return {
    version: 1,
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
