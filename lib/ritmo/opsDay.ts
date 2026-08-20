/**
 * Criterio de “en vivo” vs “cerrado” para ritmo / capturas retrasadas
 * (horario México, fechas YYYY-MM-DD).
 *
 * Una ronda deja de acumular retraso cuando:
 *  - su `round_date` es anterior a hoy, o
 *  - el `end_date` del torneo es anterior a hoy
 *    (si no hay end_date, se usa start_date solo si no hay round_date).
 *
 * Una salida (grupo) también se congela al capturar 18 hoyos en secuencia.
 */

export function todayMexicoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isYmd(s: string | null | undefined): s is string {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}/.test(s));
}

/** Solo la parte fecha (por si llega ISO con hora). */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (isYmd(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return todayMexicoDate(d);
}

/**
 * true = ronda/torneo ya no deben medirse para ops en vivo
 * (retraso de ritmo o captura no debe seguir creciendo).
 */
export function isOpsRoundClosed(args: {
  roundDate?: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  today?: string;
}): boolean {
  const today = args.today ?? todayMexicoDate();
  const roundDate = toDateOnly(args.roundDate);
  const endDate = toDateOnly(args.tournamentEndDate);
  const startDate = toDateOnly(args.tournamentStartDate);

  if (roundDate && roundDate < today) return true;
  if (endDate && endDate < today) return true;
  // Torneo sin end_date ni round_date: cerrar el día siguiente al start.
  if (!roundDate && !endDate && startDate && startDate < today) return true;
  return false;
}

/** Grupo (salida) con los 18 hoyos capturados en secuencia → ritmo parado. */
export function isGroupCaptureFinished(
  holesPlayed: number | null | undefined
): boolean {
  const n = Math.trunc(Number(holesPlayed) || 0);
  return n >= 18;
}

/**
 * Congelar ritmo: ronda/torneo por calendario, o el grupo ya capturó 18.
 */
export function shouldFreezePace(args: {
  holesPlayed?: number | null;
  roundDate?: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  today?: string;
}): boolean {
  if (isGroupCaptureFinished(args.holesPlayed)) return true;
  return isOpsRoundClosed(args);
}

/** true si la ronda es de hoy (ops en vivo por calendario). */
export function isOpsRoundLive(args: {
  roundDate?: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  today?: string;
}): boolean {
  return !isOpsRoundClosed(args);
}

/** Inicio/fin del día YYYY-MM-DD (México) como ISO UTC. */
export function mexicoDayUtcBounds(ymd: string): {
  startIso: string;
  endIso: string;
} {
  return {
    startIso: new Date(`${ymd}T00:00:00-06:00`).toISOString(),
    endIso: new Date(`${ymd}T23:59:59.999-06:00`).toISOString(),
  };
}

/**
 * Fecha de calendario para resolver salidas en ops en vivo.
 * Torneos de prueba (o salida adelantada) pueden tener round_date futuro
 * pero capturas hoy: en ese caso usamos hoy para el reloj de retraso.
 */
export function resolveOpsRoundDate(args: {
  roundDate?: string | null;
  today?: string;
  liveCaptureToday?: boolean;
}): string | null {
  const today = args.today ?? todayMexicoDate();
  const roundDate = toDateOnly(args.roundDate);
  if (!roundDate) return today;
  if (roundDate <= today) return roundDate;
  if (args.liveCaptureToday) return today;
  return roundDate;
}

export type OpsRoundRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
  /** Hora de salida de la ronda (HH:MM o HH:MM:SS), opcional. */
  start_time?: string | null;
};

/** Minutos desde medianoche en America/Mexico_City. */
export function mexicoNowMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function parseStartTimeMinutes(
  startTime: string | null | undefined
): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(startTime ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Cuando hay varias rondas el mismo día (Calcuta R1 AM + R2 PM), elige la
 * que ya arrancó según `start_time` (la de mayor round_no entre las
 * iniciadas). Si ninguna ha arrancado, la de salida más temprana.
 */
export function pickLiveRoundSameDay(
  rounds: OpsRoundRow[],
  now = new Date()
): OpsRoundRow | null {
  if (rounds.length === 0) return null;
  if (rounds.length === 1) return rounds[0] ?? null;

  const nowMin = mexicoNowMinutes(now);
  const withStart = rounds.map((r) => ({
    round: r,
    startMin: parseStartTimeMinutes(r.start_time ?? null),
  }));

  const started = withStart.filter(
    (x) => x.startMin != null && x.startMin <= nowMin
  );
  if (started.length > 0) {
    started.sort((a, b) => {
      const rn = (b.round.round_no ?? 0) - (a.round.round_no ?? 0);
      if (rn !== 0) return rn;
      return (b.startMin ?? 0) - (a.startMin ?? 0);
    });
    return started[0]?.round ?? null;
  }

  const upcoming = withStart
    .filter((x) => x.startMin != null)
    .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
  if (upcoming.length > 0) return upcoming[0]?.round ?? null;

  return (
    [...rounds].sort((a, b) => (b.round_no ?? 0) - (a.round_no ?? 0))[0] ?? null
  );
}

/**
 * Ronda en vivo para ritmo / capturas: hoy, captura activa, o la más cercana
 * al calendario. Si hay varias rondas el mismo día, usa hora de salida
 * (no la R1 por defecto).
 */
export function resolveLiveRoundForTournament(args: {
  rounds: OpsRoundRow[];
  queryRoundId?: string | null;
  today?: string;
  now?: Date;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  activityRoundIds?: Set<string>;
}): OpsRoundRow | null {
  const today = args.today ?? todayMexicoDate();
  const now = args.now ?? new Date();
  const rounds = args.rounds;
  if (rounds.length === 0) return null;

  const qid = String(args.queryRoundId ?? "").trim();
  if (qid) {
    const picked = rounds.find((r) => r.id === qid);
    if (picked) return picked;
  }

  const todayRounds = rounds.filter(
    (r) => toDateOnly(r.round_date) === today
  );
  if (todayRounds.length === 1) return todayRounds[0] ?? null;
  if (todayRounds.length > 1) {
    // Calcuta R1 AM + R2 PM: elegir por hora de salida, no la primera R1.
    return pickLiveRoundSameDay(todayRounds, now);
  }

  const activityIds = args.activityRoundIds ?? new Set<string>();
  const byActivity = rounds.find((r) => activityIds.has(r.id));
  if (byActivity) return byActivity;

  const open = rounds.filter(
    (r) =>
      !isOpsRoundClosed({
        roundDate: r.round_date,
        tournamentEndDate: args.tournamentEndDate,
        tournamentStartDate: args.tournamentStartDate,
        today,
      })
  );

  if (open.length > 0) {
    return [...open].sort((a, b) => compareOpenRounds(a, b, today))[0] ?? null;
  }

  return (
    [...rounds]
      .filter((r) => (toDateOnly(r.round_date) ?? "") <= today)
      .sort((a, b) =>
        (toDateOnly(b.round_date) ?? "").localeCompare(
          toDateOnly(a.round_date) ?? ""
        )
      )[0] ??
    rounds[0] ??
    null
  );
}

function compareOpenRounds(a: OpsRoundRow, b: OpsRoundRow, today: string): number {
  const da = toDateOnly(a.round_date) ?? "";
  const db = toDateOnly(b.round_date) ?? "";
  const aToday = da === today;
  const bToday = db === today;
  if (aToday !== bToday) return aToday ? -1 : 1;
  const aFuture = da > today;
  const bFuture = db > today;
  if (aFuture && bFuture) {
    const cmp = da.localeCompare(db);
    if (cmp !== 0) return cmp;
    return (a.round_no ?? 0) - (b.round_no ?? 0);
  }
  if (aFuture !== bFuture) return aFuture ? 1 : -1;
  const past = db.localeCompare(da);
  if (past !== 0) return past;
  return (a.round_no ?? 0) - (b.round_no ?? 0);
}
