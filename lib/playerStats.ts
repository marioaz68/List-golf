// Acceso a la estadística personal del jugador.
//
// La tabla yardage_shot_logs es PRIVADA (solo service_role). Por eso NO se
// consulta con el cliente anon del navegador, sino a través de la ruta de
// servidor /api/mobile/stats, que usa el service role y filtra por jugador.
//
// Nota: las columnas `numeric` de Postgres llegan como string, por eso se
// normalizan con `num()`.

export type ClubDistance = {
  player_id: string;
  club: string;
  /** Tipo de swing: "full" o "three_quarter" (3/4). Cada uno es un renglón. */
  swing: "full" | "three_quarter";
  shots: number;
  /** Promedio de yardas REALES medidas por GPS (de salida a donde quedó la bola). */
  avg_yards: number | null;
  /** Promedio de yardas PLANEADAS (lo que el jugador seleccionó antes de pegar). */
  avg_planned: number | null;
  /** Promedio real÷planeado (%). 100 = clavado; >100 te pasas; <100 corto. */
  avg_vs_plan: number | null;
  /** Cuántos tiros tenían distancia planeada para comparar. */
  vs_plan_shots: number;
};

export type SwingStats = {
  player_id: string;
  swings_measured: number;
  /** Velocidad angular del backswing (°/s). */
  avg_backswing_velocity_dps: number | null;
  /** Grados de elevación del backswing. */
  avg_backswing_club_deg: number | null;
  /** Velocidad angular del follow-through / bajada (°/s). */
  avg_forwardswing_velocity_dps: number | null;
  /** Grados de elevación del follow-through. */
  avg_forward_club_deg: number | null;
};

/** Rango de fechas opcional para filtrar las estadísticas (ISO, p. ej. "2026-01-01"). */
export type DateRange = { from?: string; to?: string };

export type Shot = {
  shot_log_id: string;
  hole: number;
  stroke_no: number;
  club: string | null;
  actual_yards: number | null;
  tempo_ratio: number | null;
  peak_downswing_deg_s: number | null;
  completed_at: string | null;
};

export type PlayerStatsResult = {
  clubDistances: ClubDistance[];
  swingStats: SwingStats | null;
  recentShots: Shot[];
  totalShots: number;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Trae la estadística personal del jugador desde la ruta de servidor segura.
 * El jugador se identifica con el `initData` firmado de Telegram (la ruta lo
 * valida y deriva el jugador; no se envía el id directamente).
 * @param initData window.Telegram.WebApp.initData
 * @param opts.recent incluye los últimos tiros (historial) si es true.
 * @param opts.range filtra por rango de fechas ({from,to} ISO).
 */
export async function getPlayerStats(
  initData: string,
  opts: { recent?: boolean; range?: DateRange; last?: boolean } = {}
): Promise<PlayerStatsResult> {
  const res = await fetch("/api/mobile/stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initData,
      recent: opts.recent ?? false,
      last: opts.last ?? false,
      from: opts.range?.from,
      to: opts.range?.to,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudieron cargar las estadísticas");
  }
  const data = await res.json();

  const clubDistances: ClubDistance[] = (data.clubDistances ?? [])
    .map((r: Record<string, unknown>) => ({
      ...r,
      shots: num(r.shots) ?? 0,
      avg_yards: num(r.avg_yards),
      avg_planned: num(r.avg_planned),
      avg_vs_plan: num(r.avg_vs_plan),
      vs_plan_shots: num(r.vs_plan_shots) ?? 0,
    }));

  const s = data.swingStats as Record<string, unknown> | null;
  const swingStats: SwingStats | null = s
    ? {
        ...(s as unknown as SwingStats),
        swings_measured: num(s.swings_measured) ?? 0,
        avg_backswing_velocity_dps: num(s.avg_backswing_velocity_dps),
        avg_backswing_club_deg: num(s.avg_backswing_club_deg),
        avg_forwardswing_velocity_dps: num(s.avg_forwardswing_velocity_dps),
        avg_forward_club_deg: num(s.avg_forward_club_deg),
      }
    : null;

  const recentShots: Shot[] = (data.recentShots ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    hole: num(r.hole) ?? 0,
    stroke_no: num(r.stroke_no) ?? 0,
    actual_yards: num(r.actual_yards),
    tempo_ratio: num(r.tempo_ratio),
    peak_downswing_deg_s: num(r.peak_downswing_deg_s),
  })) as Shot[];

  const totalShots = num(data.totalShots) ?? 0;
  return { clubDistances, swingStats, recentShots, totalShots };
}

/** Un tiro individual de un bastón (para el drill-down con exclusión). */
export type ClubShot = {
  shot_id: string;
  hole: number;
  stroke_no: number;
  actual_yards: number | null;
  planned_yards: number | null;
  completed_at: string | null;
  excluded: boolean;
};

/** Todos los tiros de un bastón + tipo de swing, con su estado de exclusión. */
export async function getClubShots(
  initData: string,
  club: string,
  swing: "full" | "three_quarter"
): Promise<ClubShot[]> {
  const res = await fetch("/api/mobile/stats/shots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, club, swing }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudieron cargar los tiros");
  }
  const data = await res.json();
  return (data.shots ?? []).map((r: Record<string, unknown>) => ({
    shot_id: String(r.shot_id ?? ""),
    hole: num(r.hole) ?? 0,
    stroke_no: num(r.stroke_no) ?? 0,
    actual_yards: num(r.actual_yards),
    planned_yards: num(r.planned_yards),
    completed_at: (r.completed_at as string | null) ?? null,
    excluded: Boolean(r.excluded),
  })) as ClubShot[];
}

// ---------- Módulo Hoyos ----------
export type HoleRow = { hole: number; par: number | null; avg_score: number | null; rounds: number };
export type HoleStats = {
  rounds: number;
  avg_putts: number | null;
  avg_gir: number | null;
  avg_fairways: number | null;
  avg_penalties: number | null;
  holes: HoleRow[];
};

/** Una jugada (ronda) de un hoyo, para el drill-down. */
export type HolePlay = {
  round_key: string;
  date: string | null;
  par: number | null;
  strokes: number;
  putts: number;
  penalties: number;
  fairway: boolean | null;
  gir: boolean | null;
  excluded: boolean;
};

export async function getHoleStats(
  initData: string,
  opts: { range?: DateRange; last?: boolean } = {}
): Promise<HoleStats> {
  const res = await fetch("/api/mobile/stats/holes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudieron cargar los hoyos");
  }
  const d = await res.json();
  return {
    rounds: num(d.rounds) ?? 0,
    avg_putts: num(d.avg_putts),
    avg_gir: num(d.avg_gir),
    avg_fairways: num(d.avg_fairways),
    avg_penalties: num(d.avg_penalties),
    holes: (d.holes ?? []).map((h: Record<string, unknown>) => ({
      hole: num(h.hole) ?? 0,
      par: num(h.par),
      avg_score: num(h.avg_score),
      rounds: num(h.rounds) ?? 0,
    })) as HoleRow[],
  };
}

export type HoleDetailResult = {
  par: number | null;
  suggested: { stroke: number; club: string }[];
  plays: HolePlay[];
};

/** Detalle de un hoyo: jugadas (rondas) con golpes/fairway/GIR/putts, sugerencia de bastones y exclusión. */
export async function getHoleDetail(
  initData: string,
  hole: number,
  opts: { range?: DateRange; last?: boolean } = {}
): Promise<HoleDetailResult> {
  const res = await fetch("/api/mobile/stats/hole", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, hole, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudo cargar el hoyo");
  }
  const d = await res.json();
  const plays = (d.plays ?? []).map((p: Record<string, unknown>) => ({
    round_key: String(p.round_key ?? ""),
    date: (p.date as string | null) ?? null,
    par: num(p.par),
    strokes: num(p.strokes) ?? 0,
    putts: num(p.putts) ?? 0,
    penalties: num(p.penalties) ?? 0,
    fairway: p.fairway === null || p.fairway === undefined ? null : Boolean(p.fairway),
    gir: p.gir === null || p.gir === undefined ? null : Boolean(p.gir),
    excluded: Boolean(p.excluded),
  })) as HolePlay[];
  const suggested = (d.suggested ?? []).map((s: Record<string, unknown>) => ({
    stroke: num(s.stroke) ?? 0,
    club: String(s.club ?? ""),
  }));
  return { par: num(d.par), suggested, plays };
}

// ---------- Módulo Putts ----------
export type PuttBucket = {
  key: string;
  attempts: number;
  made: number;
  made_pct: number | null;
  three_putt_holes: number;
  three_putt_pct: number | null;
};
export type PuttRow = { shot_id: string; hole: number; distance: number; made: boolean; date: string | null; excluded: boolean };

export async function getPuttStats(initData: string, opts: { range?: DateRange; last?: boolean } = {}): Promise<PuttBucket[]> {
  const res = await fetch("/api/mobile/stats/putts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? "No se pudieron cargar los putts"); }
  const d = await res.json();
  return (d.buckets ?? []).map((r: Record<string, unknown>) => ({
    key: String(r.key ?? ""),
    attempts: num(r.attempts) ?? 0,
    made: num(r.made) ?? 0,
    made_pct: num(r.made_pct),
    three_putt_holes: num(r.three_putt_holes) ?? 0,
    three_putt_pct: num(r.three_putt_pct),
  })) as PuttBucket[];
}

export async function getPuttList(
  initData: string, min: number, max: number | null, opts: { range?: DateRange; last?: boolean } = {}
): Promise<PuttRow[]> {
  const res = await fetch("/api/mobile/stats/putt-list", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, min, max, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? "No se pudieron cargar los putts"); }
  const d = await res.json();
  return (d.putts ?? []).map((r: Record<string, unknown>) => ({
    shot_id: String(r.shot_id ?? ""),
    hole: num(r.hole) ?? 0,
    distance: num(r.distance) ?? 0,
    made: Boolean(r.made),
    date: (r.date as string | null) ?? null,
    excluded: Boolean(r.excluded),
  })) as PuttRow[];
}

// ---------- Mapa del green (posiciones de approach) ----------
export type GreenPoint = { lat: number; lon: number };
export type GreenBall = { lat: number; lon: number; date: string | null; gir: boolean };
export type GreenMapData = {
  par: number | null;
  green: { center?: GreenPoint; front?: GreenPoint; back?: GreenPoint };
  balls: GreenBall[];
};

export async function getGreenMap(initData: string, hole: number, opts: { range?: DateRange; last?: boolean } = {}): Promise<GreenMapData> {
  const res = await fetch("/api/mobile/stats/green-map", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, hole, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? "No se pudo cargar el green"); }
  const d = await res.json();
  return {
    par: num(d.par),
    green: d.green ?? {},
    balls: (d.balls ?? []).map((r: Record<string, unknown>) => ({
      lat: num(r.lat) ?? 0, lon: num(r.lon) ?? 0, date: (r.date as string | null) ?? null, gir: Boolean(r.gir),
    })),
  };
}

// ---------- Módulo Tiros (líneas sobre el mapa) ----------
export type ShotLine = {
  shot_id: string;
  from_lat: number | null;
  from_lon: number | null;
  to_lat: number | null;
  to_lon: number | null;
  actual_yards: number | null;
  club: string | null;
  /** Calidad del tiro para el estilo de línea: "solid" | "dashed" | "dotted". */
  style: "solid" | "dashed" | "dotted";
  excluded: boolean;
};

export type ShotLinesResult = { shots: ShotLine[]; suggestedClub: string | null };

export type HolePlanStep = { stroke: number; club: string; yards: number };
export type HolePlan = {
  par: number | null;
  distance: number | null;      // yardas al objetivo
  targetType: "flag" | "green";
  planTotal: number;
  plan: HolePlanStep[];
};

/** Plan de bastones para el hoyo: distancia al green/bandera + secuencia con yardas. */
export async function getHolePlan(
  initData: string,
  hole: number,
  opts: { range?: DateRange; last?: boolean } = {}
): Promise<HolePlan> {
  const res = await fetch("/api/mobile/stats/hole-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, hole, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudo cargar el plan");
  }
  const d = await res.json();
  return {
    par: num(d.par),
    distance: num(d.distance),
    targetType: d.targetType === "flag" ? "flag" : "green",
    planTotal: num(d.planTotal) ?? 0,
    plan: (d.plan ?? []).map((p: Record<string, unknown>) => ({
      stroke: num(p.stroke) ?? 0,
      club: String(p.club ?? ""),
      yards: num(p.yards) ?? 0,
    })),
  };
}

/** Tiros (con coordenadas) de un hoyo + número de golpe, para dibujarlos en el mapa. */
export async function getShotLines(
  initData: string,
  hole: number,
  stroke: number,
  opts: { range?: DateRange; last?: boolean } = {}
): Promise<ShotLinesResult> {
  const res = await fetch("/api/mobile/stats/shot-lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, hole, stroke, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudieron cargar los tiros");
  }
  const d = await res.json();
  const shots = (d.shots ?? []).map((s: Record<string, unknown>) => ({
    shot_id: String(s.shot_id ?? ""),
    from_lat: num(s.from_lat), from_lon: num(s.from_lon),
    to_lat: num(s.to_lat), to_lon: num(s.to_lon),
    actual_yards: num(s.actual_yards),
    club: (s.club as string | null) ?? null,
    style: (s.style === "solid" || s.style === "dashed" || s.style === "dotted" ? s.style : "dotted"),
    excluded: Boolean(s.excluded),
  })) as ShotLine[];
  return { shots, suggestedClub: (d.suggestedClub as string | null) ?? null };
}

/** Excluye/incluye una jugada de hoyo de los promedios (reversible). */
export async function setHoleExcluded(
  initData: string, roundKey: string, hole: number, excluded: boolean
): Promise<void> {
  const res = await fetch("/api/mobile/stats/exclude-hole", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, roundKey, hole, excluded }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudo actualizar");
  }
}

/** Marca/desmarca un tiro como excluido del promedio (reversible). */
export async function setShotExcluded(initData: string, shotId: string, excluded: boolean): Promise<void> {
  const res = await fetch("/api/mobile/stats/exclude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, shotId, excluded }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error ?? "No se pudo actualizar");
  }
}


// ---------- Módulo Approach (<60 yds planeadas) ----------
export type ApproachBucket = {
  key: string;
  shots: number;
  avg_yards: number | null;
  avg_vs_plan: number | null;
};
export type ApproachRow = {
  shot_id: string;
  hole: number;
  club: string | null;
  planned: number;
  actual: number | null;
  vs_plan: number | null;
  date: string | null;
  excluded: boolean;
};

export async function getApproachStats(
  initData: string, opts: { range?: DateRange; last?: boolean } = {}
): Promise<ApproachBucket[]> {
  const res = await fetch("/api/mobile/stats/approach", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? "No se pudieron cargar los approaches"); }
  const d = await res.json();
  return (d.buckets ?? []).map((r: Record<string, unknown>) => ({
    key: String(r.key ?? ""),
    shots: num(r.shots) ?? 0,
    avg_yards: num(r.avg_yards),
    avg_vs_plan: num(r.avg_vs_plan),
  })) as ApproachBucket[];
}

export async function getApproachList(
  initData: string, min: number, max: number | null, opts: { range?: DateRange; last?: boolean } = {}
): Promise<ApproachRow[]> {
  const res = await fetch("/api/mobile/stats/approach-list", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, min, max, last: opts.last ?? false, from: opts.range?.from, to: opts.range?.to }),
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error ?? "No se pudieron cargar los approaches"); }
  const d = await res.json();
  return (d.shots ?? []).map((r: Record<string, unknown>) => ({
    shot_id: String(r.shot_id ?? ""),
    hole: num(r.hole) ?? 0,
    club: (r.club as string | null) ?? null,
    planned: num(r.planned) ?? 0,
    actual: num(r.actual),
    vs_plan: num(r.vs_plan),
    date: (r.date as string | null) ?? null,
    excluded: Boolean(r.excluded),
  })) as ApproachRow[];
}
