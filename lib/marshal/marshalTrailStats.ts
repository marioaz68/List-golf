/** Distancia haversine en metros. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export type TrailPoint = {
  lat: number;
  lon: number;
  ts: string;
};

export type DwellSegment = {
  startTs: string;
  endTs: string;
  durationMin: number;
  lat: number;
  lon: number;
  pointCount: number;
};

export type GpsGapSegment = {
  startTs: string;
  endTs: string;
  durationMin: number;
};

export type MarshalTrailStats = {
  pointCount: number;
  firstTs: string | null;
  lastTs: string | null;
  /** Minutos cubiertos desde el primer ping hasta el último (o ahora). */
  spanMin: number;
  /** Distancia acumulada entre pings consecutivos (m). */
  distanceM: number;
  /** Tiempo en el que se quedó dentro de `staticMeters` del ancla. */
  staticMin: number;
  /** Tiempo en movimiento (span − static − gaps grandes no cuentan igual). */
  movingMin: number;
  /** Huecos sin ping mayores a `gapThresholdMin`. */
  gpsOffMin: number;
  dwells: DwellSegment[];
  gaps: GpsGapSegment[];
};

const DEFAULT_STATIC_M = 100;
/** Sin ping por más de esto = GPS “apagado” / sin datos. */
const DEFAULT_GAP_MIN = 3;

/**
 * Estadísticas de ruta de un marshal a partir de pings GPS del día.
 * - Estático: permanece dentro de `staticMeters` del ancla de la estancia.
 * - GPS off: huecos entre pings (o hasta `now`) mayores a `gapThresholdMin`.
 */
export function computeMarshalTrailStats(
  pointsAsc: TrailPoint[],
  opts?: {
    staticMeters?: number;
    gapThresholdMin?: number;
    now?: Date;
  }
): MarshalTrailStats {
  const staticMeters = opts?.staticMeters ?? DEFAULT_STATIC_M;
  const gapThresholdMin = opts?.gapThresholdMin ?? DEFAULT_GAP_MIN;
  const now = opts?.now ?? new Date();

  if (pointsAsc.length === 0) {
    return {
      pointCount: 0,
      firstTs: null,
      lastTs: null,
      spanMin: 0,
      distanceM: 0,
      staticMin: 0,
      movingMin: 0,
      gpsOffMin: 0,
      dwells: [],
      gaps: [],
    };
  }

  const pts = pointsAsc
    .map((p) => ({
      ...p,
      t: new Date(p.ts).getTime(),
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) {
    return {
      pointCount: 0,
      firstTs: null,
      lastTs: null,
      spanMin: 0,
      distanceM: 0,
      staticMin: 0,
      movingMin: 0,
      gpsOffMin: 0,
      dwells: [],
      gaps: [],
    };
  }

  const firstTs = pts[0]!.ts;
  const lastTs = pts[pts.length - 1]!.ts;
  const endMs = Math.max(pts[pts.length - 1]!.t, now.getTime());
  const spanMin = Math.max(0, (endMs - pts[0]!.t) / 60000);

  let distanceM = 0;
  for (let i = 1; i < pts.length; i++) {
    distanceM += haversineMeters(pts[i - 1]!, pts[i]!);
  }

  // —— Estancias (≤ staticMeters del ancla) ——
  const dwells: DwellSegment[] = [];
  let anchor = pts[0]!;
  let dwellStart = pts[0]!;
  let dwellPoints = 1;
  let sumLat = pts[0]!.lat;
  let sumLon = pts[0]!.lon;

  const flushDwell = (endPt: (typeof pts)[0]) => {
    const durationMin = Math.max(0, (endPt.t - dwellStart.t) / 60000);
    if (durationMin < 0.5 && dwellPoints < 2) return;
    dwells.push({
      startTs: dwellStart.ts,
      endTs: endPt.ts,
      durationMin: Math.round(durationMin * 10) / 10,
      lat: sumLat / dwellPoints,
      lon: sumLon / dwellPoints,
      pointCount: dwellPoints,
    });
  };

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    const d = haversineMeters(anchor, p);
    if (d <= staticMeters) {
      dwellPoints += 1;
      sumLat += p.lat;
      sumLon += p.lon;
    } else {
      flushDwell(pts[i - 1]!);
      anchor = p;
      dwellStart = p;
      dwellPoints = 1;
      sumLat = p.lat;
      sumLon = p.lon;
    }
  }
  flushDwell(pts[pts.length - 1]!);

  // Solo cuentan como “estático” estancias ≥ 2 min (ruido GPS).
  const significantDwells = dwells.filter((d) => d.durationMin >= 2);
  const staticMin =
    Math.round(
      significantDwells.reduce((s, d) => s + d.durationMin, 0) * 10
    ) / 10;

  // —— Huecos GPS (apagado / sin datos) ——
  const gaps: GpsGapSegment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const gapMin = (pts[i]!.t - pts[i - 1]!.t) / 60000;
    if (gapMin >= gapThresholdMin) {
      gaps.push({
        startTs: pts[i - 1]!.ts,
        endTs: pts[i]!.ts,
        durationMin: Math.round(gapMin * 10) / 10,
      });
    }
  }
  // Hueco desde el último ping hasta ahora
  const tailGapMin = (now.getTime() - pts[pts.length - 1]!.t) / 60000;
  if (tailGapMin >= gapThresholdMin) {
    gaps.push({
      startTs: pts[pts.length - 1]!.ts,
      endTs: now.toISOString(),
      durationMin: Math.round(tailGapMin * 10) / 10,
    });
  }

  const gpsOffMin =
    Math.round(gaps.reduce((s, g) => s + g.durationMin, 0) * 10) / 10;

  const movingMin = Math.max(
    0,
    Math.round((spanMin - staticMin - gpsOffMin) * 10) / 10
  );

  return {
    pointCount: pts.length,
    firstTs,
    lastTs,
    spanMin: Math.round(spanMin * 10) / 10,
    distanceM: Math.round(distanceM),
    staticMin,
    movingMin,
    gpsOffMin,
    dwells: significantDwells,
    gaps,
  };
}
