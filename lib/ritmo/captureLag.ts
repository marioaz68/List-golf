import {
  expectedMinutesForHolesPlayed,
  resolveTeeDate,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { currentHoleFromHolesPlayed } from "@/lib/ritmo/scoreProgress";
import { isOpsRoundClosed, todayMexicoDate } from "@/lib/ritmo/opsDay";

/** Sin ni un hoyo capturado y ya pasan estos min → cruce crítico (mandar marshal). */
export const SILENCE_ZERO_CRITICAL_MIN = 22;
/** Última captura hace estos min y aún en campo → silencioso. */
export const SILENCE_CAPTURE_ALERT_MIN = 20;
/** Hoyos de retraso en captura vs tiempo esperado. */
export const HOLES_BEHIND_ALERT = 1;
export const HOLES_BEHIND_ATRASADO = 2;
export const HOLES_BEHIND_CRITICO = 3;

export type CaptureLagKind =
  | "critico"
  | "atrasado"
  | "silencioso"
  | "ok"
  | "no_salido"
  | "sin_hora"
  | "terminado"
  | "cerrado";

export type CaptureLagResult = {
  kind: CaptureLagKind;
  /** Hoyos completos que el reloj / ritmo ya permite. */
  expectedHoles: number;
  /** Hoyos capturados en secuencia desde el tee. */
  holesPlayed: number;
  /** max(0, expected − capturados). */
  holesBehind: number;
  /** Minutos desde salida real/programada (negativo = aún no sale). */
  minutesSinceStart: number | null;
  /** Minutos desde la última captura (null = nunca). */
  minutesSinceLastCapture: number | null;
  /** Hoyo "actual" derivado de captura (null si no hay / terminó). */
  captureHole: number | null;
  /** Hoyo en cancha según ritmo del campo y salida (null si no aplica). */
  expectedHole: number | null;
  /** Minutos de retraso vs ritmo del campo (positivo = lento). */
  paceDelayMinutes: number | null;
  /** Texto operativo para el marshal. */
  reason: string;
  /** 0 = peor (ordenado en el board). */
  priority: number;
};

/**
 * Hoyos que deberían ir completos según minutos desde salida y pace del campo.
 * n es el máximo con expectedMinutes(n) ≤ elapsed.
 */
export function expectedHolesCompleted(args: {
  minutesElapsed: number;
  startHole: number;
  perHoleMinutes?: PerHoleMinutes | null;
}): number {
  if (!(args.minutesElapsed > 0)) return 0;
  let n = 0;
  for (let h = 1; h <= 18; h++) {
    const m = expectedMinutesForHolesPlayed(
      h,
      args.startHole,
      args.perHoleMinutes
    );
    if (m <= args.minutesElapsed) n = h;
    else break;
  }
  return n;
}

/** Hoyo en cancha que el ritmo del campo permite a esta hora desde la salida. */
export function paceExpectedHole(
  expectedHoles: number,
  startHole: number
): number | null {
  const tee = startHole >= 1 && startHole <= 18 ? startHole : 1;
  if (expectedHoles >= 18) return null;
  if (expectedHoles <= 0) return tee;
  return currentHoleFromHolesPlayed(expectedHoles, tee);
}

function paceDelayMinutesFrom(args: {
  minutesSinceStart: number | null;
  holesPlayed: number;
  startHole: number;
  perHoleMinutes?: PerHoleMinutes | null;
}): number | null {
  if (args.minutesSinceStart == null || args.minutesSinceStart < 0) return null;
  const expectedMins = expectedMinutesForHolesPlayed(
    args.holesPlayed,
    args.startHole,
    args.perHoleMinutes
  );
  const delta = args.minutesSinceStart - expectedMins;
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return Math.round(delta);
}

function lagResult(
  startHole: number,
  partial: Omit<CaptureLagResult, "expectedHole" | "paceDelayMinutes">,
  perHoleMinutes?: PerHoleMinutes | null
): CaptureLagResult {
  return {
    ...partial,
    expectedHole: paceExpectedHole(partial.expectedHoles, startHole),
    paceDelayMinutes: paceDelayMinutesFrom({
      minutesSinceStart: partial.minutesSinceStart,
      holesPlayed: partial.holesPlayed,
      startHole,
      perHoleMinutes,
    }),
  };
}

export function evaluateCaptureLag(args: {
  holesPlayed: number;
  lastCaptureTs: string | null;
  /** Primera captura: salida inferida (match play R2 sin tee time). */
  firstCaptureTs?: string | null;
  teeTimeISO: string | null;
  actualStartISO?: string | null;
  startHole: number;
  roundDate: string | null;
  tournamentEndDate?: string | null;
  tournamentStartDate?: string | null;
  /** Si true (o se deduce por fechas), no acumula retraso de reloj. */
  opsClosed?: boolean;
  /**
   * Match play ya cerrado en el cuadro (p. ej. 5&4 en H16).
   * No exige 18 hoyos capturados para marcar terminado.
   */
  matchplayCompleted?: boolean;
  /** Texto del resultado del match (H16 · 5 arriba…). */
  matchplayResultText?: string | null;
  perHoleMinutes?: PerHoleMinutes | null;
  now?: Date;
}): CaptureLagResult {
  const now = args.now ?? new Date();
  const perHoleMinutes = args.perHoleMinutes;
  const lag = (
    startHole: number,
    partial: Omit<CaptureLagResult, "expectedHole" | "paceDelayMinutes">
  ) => lagResult(startHole, partial, perHoleMinutes);

  const holesPlayed = Math.max(
    0,
    Math.min(18, Math.trunc(Number(args.holesPlayed) || 0))
  );
  const startHole =
    args.startHole >= 1 && args.startHole <= 18 ? args.startHole : 1;

  const teeDate =
    resolveTeeDate({
      teeTimeISO: args.teeTimeISO,
      actualStartISO: args.actualStartISO,
      roundDate: args.roundDate,
    }) ??
    (args.firstCaptureTs
      ? (() => {
          const d = new Date(args.firstCaptureTs!);
          return Number.isNaN(d.getTime()) ? null : d;
        })()
      : null);

  const captureHole = currentHoleFromHolesPlayed(holesPlayed, startHole);

  let minutesSinceLastCapture: number | null = null;
  if (args.lastCaptureTs) {
    const t = new Date(args.lastCaptureTs).getTime();
    if (Number.isFinite(t)) {
      minutesSinceLastCapture = Math.max(
        0,
        Math.round((now.getTime() - t) / 60000)
      );
    }
  }

  // Match play cerrado en cuadro (aunque falten hoyos por no jugarse).
  if (args.matchplayCompleted) {
    const result =
      String(args.matchplayResultText ?? "").trim() ||
      (holesPlayed > 0 ? `${holesPlayed} hoyos` : "cerrado");
    return lag(startHole, {
      kind: "terminado",
      expectedHoles: holesPlayed > 0 ? holesPlayed : 18,
      holesPlayed,
      holesBehind: 0,
      minutesSinceStart: null,
      minutesSinceLastCapture,
      captureHole: null,
      reason: `Match cerrado · ${result}`,
      priority: 95,
    });
  }

  const today = todayMexicoDate(now);
  const opsClosed =
    args.opsClosed === true ||
    isOpsRoundClosed({
      roundDate: args.roundDate,
      tournamentEndDate: args.tournamentEndDate,
      tournamentStartDate: args.tournamentStartDate,
      today,
    });

  // Ronda/torneo de fecha pasada: congelar reloj — no criticar por retraso acumulado.
  if (opsClosed) {
    if (holesPlayed >= 18) {
      return lag(startHole, {
        kind: "terminado",
        expectedHoles: 18,
        holesPlayed: 18,
        holesBehind: 0,
        minutesSinceStart: null,
        minutesSinceLastCapture,
        captureHole: null,
        reason: "18 hoyos · ronda cerrada",
        priority: 95,
      });
    }
    return lag(startHole, {
      kind: "cerrado",
      expectedHoles: holesPlayed,
      holesPlayed,
      holesBehind: 0,
      minutesSinceStart: null,
      minutesSinceLastCapture,
      captureHole,
      reason: `Ronda cerrada (fecha pasada) · ${holesPlayed}/18 capturados`,
      priority: 92,
    });
  }

  if (holesPlayed >= 18) {
    return lag(startHole, {
      kind: "terminado",
      expectedHoles: 18,
      holesPlayed: 18,
      holesBehind: 0,
      minutesSinceStart: teeDate
        ? Math.round((now.getTime() - teeDate.getTime()) / 60000)
        : null,
      minutesSinceLastCapture,
      captureHole: null,
      reason: "18 hoyos capturados",
      priority: 90,
    });
  }

  if (!teeDate) {
    const base = lag(startHole, {
      kind: "sin_hora",
      expectedHoles: 0,
      holesPlayed,
      holesBehind: 0,
      minutesSinceStart: null,
      minutesSinceLastCapture,
      captureHole,
      reason:
        holesPlayed > 0
          ? `${holesPlayed} hoyos capturados · sin hora de salida`
          : "Sin hora de salida · pendiente de salir al campo",
      priority: holesPlayed > 0 ? 40 : 50,
    });
    return { ...base, expectedHole: null };
  }

  const minutesSinceStart =
    (now.getTime() - teeDate.getTime()) / 60000;

  if (minutesSinceStart < -2) {
    return lag(startHole, {
      kind: "no_salido",
      expectedHoles: 0,
      holesPlayed,
      holesBehind: 0,
      minutesSinceStart: Math.round(minutesSinceStart),
      minutesSinceLastCapture,
      captureHole,
      reason: `Sale en ~${Math.abs(Math.round(minutesSinceStart))} min`,
      priority: 80,
    });
  }

  const expectedHoles = expectedHolesCompleted({
    minutesElapsed: Math.max(0, minutesSinceStart),
    startHole,
    perHoleMinutes: args.perHoleMinutes,
  });
  const holesBehind = Math.max(0, expectedHoles - holesPlayed);
  const minsStart = Math.round(minutesSinceStart);
  const minsSilent = minutesSinceLastCapture;

  // 1) Sin captura alguna y ya le toca estar a mitad del 1er–2º hoyo.
  if (
    holesPlayed === 0 &&
    minutesSinceStart >= SILENCE_ZERO_CRITICAL_MIN
  ) {
    return lag(startHole, {
      kind: "critico",
      expectedHoles,
      holesPlayed: 0,
      holesBehind: Math.max(holesBehind, expectedHoles || 1),
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: null,
      captureHole: null,
      reason: `Sin ningún hoyo capturado · ${minsStart} min en cancha`,
      priority: 0,
    });
  }

  const expectedOnHole = paceExpectedHole(expectedHoles, startHole);
  const progressHint =
    captureHole != null && expectedOnHole != null
      ? `van H${captureHole}, ritmo H${expectedOnHole}`
      : captureHole != null
        ? `van H${captureHole}`
        : expectedOnHole != null
          ? `ritmo H${expectedOnHole}`
          : `${holesPlayed} capt. / ~${expectedHoles} esp.`;

  // 2) Retraso grande en hoyos capturados vs reloj.
  if (holesBehind >= HOLES_BEHIND_CRITICO) {
    return lag(startHole, {
      kind: "critico",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Captura ${holesBehind} hoyos atrasada (${progressHint})`,
      priority: 1,
    });
  }

  if (holesBehind >= HOLES_BEHIND_ATRASADO) {
    return lag(startHole, {
      kind: "atrasado",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Captura ${holesBehind} hoyos atrasada (${progressHint})`,
      priority: 5,
    });
  }

  // 3) Silencio largo en captura (dejaron de anotar).
  if (
    minsSilent != null &&
    minsSilent >= SILENCE_CAPTURE_ALERT_MIN &&
    minutesSinceStart >= SILENCE_CAPTURE_ALERT_MIN
  ) {
    return lag(startHole, {
      kind: "silencioso",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Sin capturas desde hace ${minsSilent} min` +
        (captureHole != null
          ? ` · van en H${captureHole}`
          : holesPlayed > 0
            ? ` · ${holesPlayed} hoyos capt.`
            : ""),
      priority: 10,
    });
  }

  if (holesPlayed === 0 && minutesSinceStart >= 8) {
    return lag(startHole, {
      kind: "silencioso",
      expectedHoles,
      holesPlayed: 0,
      holesBehind: Math.max(0, expectedHoles),
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: null,
      captureHole: null,
      reason: `Aún sin primer hoyo capturado · ${minsStart} min desde salida`,
      priority: 12,
    });
  }

  if (holesBehind >= HOLES_BEHIND_ALERT) {
    return lag(startHole, {
      kind: "atrasado",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `1 hoyo de captura retrasada (${progressHint})`,
      priority: 15,
    });
  }

  return lag(startHole, {
    kind: "ok",
    expectedHoles,
    holesPlayed,
    holesBehind: 0,
    minutesSinceStart: minsStart,
    minutesSinceLastCapture: minsSilent,
    captureHole,
    reason:
      holesPlayed === 0
        ? `En cancha ${minsStart} min · captura al día`
        : `Captura al día · ${holesPlayed}/18` +
          (captureHole ? ` · en hoyo ${captureHole}` : ""),
    priority: 40,
  });
}

export function isCaptureProblem(kind: CaptureLagKind): boolean {
  return (
    kind === "critico" || kind === "atrasado" || kind === "silencioso"
  );
}

/** Origen del retraso operativo (ritmo en cancha vs anotar tarjeta). */
export type DelayCause = "ritmo" | "captura" | "ambas" | "ninguno";

export function classifyDelayCause(args: {
  paceDelayMinutes: number | null | undefined;
  holesBehind: number;
  kind?: CaptureLagKind;
}): DelayCause {
  const paceLate = (args.paceDelayMinutes ?? 0) > 0;
  const captureLate =
    args.holesBehind > 0 || args.kind === "silencioso";
  if (paceLate && captureLate) return "ambas";
  if (paceLate) return "ritmo";
  if (captureLate) return "captura";
  return "ninguno";
}

export function delayCauseLabel(cause: DelayCause): string | null {
  switch (cause) {
    case "ritmo":
      return "Retraso de ritmo de juego";
    case "captura":
      return "Retraso en captura de tarjeta";
    case "ambas":
      return "Ritmo lento + captura atrasada";
    default:
      return null;
  }
}

/** Texto corto de progreso: hoyo en cancha (no “hoyos completados”). */
export function formatCaptureVsPaceLine(args: {
  holesPlayed: number;
  captureHole: number | null;
  expectedHole: number | null;
  expectedHoles: number;
}): string {
  const { holesPlayed, captureHole, expectedHole, expectedHoles } = args;
  if (holesPlayed >= 18) return "18 hoyos · completo";
  const van =
    captureHole != null
      ? `van en H${captureHole}`
      : holesPlayed <= 0
        ? "sin captura"
        : `${holesPlayed} hoyos capt.`;
  if (expectedHole != null) {
    return `${van} · ritmo debería H${expectedHole}`;
  }
  if (expectedHoles > 0) {
    return `${van} · deberían ~${expectedHoles} hoyos capt.`;
  }
  return van;
}
