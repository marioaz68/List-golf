import type { LocalPoint } from "@/lib/distances/fairway3DMath";
import { pointAlongCenterline } from "@/lib/distances/fairway3DMath";

export type SeededRng = () => number;

export function seededRng(seed: number): SeededRng {
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function tangentAt(locals: LocalPoint[], t: number): { dx: number; dz: number } {
  const a = pointAlongCenterline(locals, Math.max(0, t - 0.015));
  const b = pointAlongCenterline(locals, Math.min(1, t + 0.015));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len };
}

export function lateralAt(
  locals: LocalPoint[],
  t: number
): { nx: number; nz: number; tx: number; tz: number } {
  const { dx, dz } = tangentAt(locals, t);
  return { nx: -dz, nz: dx, tx: dx, tz: dz };
}

export type TreeSpec = {
  x: number;
  z: number;
  scale: number;
  kind: "pine" | "broad";
  rotY: number;
};

export type BunkerSpec = {
  x: number;
  z: number;
  rotY: number;
  rx: number;
  rz: number;
};

export type SceneryLayout = {
  trees: TreeSpec[];
  bunkers: BunkerSpec[];
  fairwayRadius: number;
  treeDensity: number;
};

/** Árboles y bunkers procedurales alrededor de la centerline. */
export function buildSceneryLayout(
  locals: LocalPoint[],
  holeNo: number
): SceneryLayout {
  const rng = seededRng(holeNo * 7919 + locals.length * 13);
  const trees: TreeSpec[] = [];
  const bunkers: BunkerSpec[] = [];

  const fairwayRadius = holeNo === 1 ? 16 : 14;
  const treeDensity = holeNo === 1 ? 1.15 : 1;

  const step = holeNo === 1 ? 0.028 : 0.038;
  for (let t = 0.04; t < 0.9; t += step + rng() * 0.012) {
    const p = pointAlongCenterline(locals, t);
    const { nx, nz } = lateralAt(locals, t);

    for (const side of [-1, 1] as const) {
      if (rng() > 0.82 * treeDensity) continue;

      const nearOffset = fairwayRadius + 6 + rng() * 14;
      const farOffset = fairwayRadius + 22 + rng() * 48;
      const useNear = rng() < 0.55;
      const offset = useNear ? nearOffset : farOffset;

      trees.push({
        x: p.x + nx * offset * side + (rng() - 0.5) * 5,
        z: p.z + nz * offset * side + (rng() - 0.5) * 5,
        scale: 0.65 + rng() * 1.05,
        kind: rng() < 0.62 ? "pine" : "broad",
        rotY: rng() * Math.PI * 2,
      });
    }

    // Línea de fondo más densa (bosque).
    if (rng() < 0.35 * treeDensity) {
      for (const side of [-1, 1] as const) {
        if (rng() > 0.45) continue;
        const offset = fairwayRadius + 55 + rng() * 70;
        trees.push({
          x: p.x + nx * offset * side,
          z: p.z + nz * offset * side,
          scale: 1.1 + rng() * 1.4,
          kind: "pine",
          rotY: rng() * Math.PI * 2,
        });
      }
    }
  }

  // Hoyo 1: bunkers típicos antes del green (lados del fairway).
  if (holeNo === 1) {
    const bunkerTs = [
      { t: 0.72, side: -1, rx: 11, rz: 7 },
      { t: 0.8, side: 1, rx: 9, rz: 6 },
      { t: 0.86, side: -1, rx: 7, rz: 5 },
    ];
    for (const b of bunkerTs) {
      const p = pointAlongCenterline(locals, b.t);
      const { nx, nz, tx, tz } = lateralAt(locals, b.t);
      bunkers.push({
        x: p.x + nx * (fairwayRadius + 4) * b.side,
        z: p.z + nz * (fairwayRadius + 4) * b.side,
        rotY: Math.atan2(tz, tx),
        rx: b.rx,
        rz: b.rz,
      });
    }
  }

  return { trees, bunkers, fairwayRadius, treeDensity };
}
