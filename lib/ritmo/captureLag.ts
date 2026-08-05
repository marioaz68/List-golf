import {
  expectedMinutesForHolesPlayed,
  resolveTeeDate,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { currentHoleFromHolesPlayed } from "@/lib/ritmo/scoreProgress";

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
  | "terminado";

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

export function evaluateCaptureLag(args: {
  holesPlayed: number;
  lastCaptureTs: string | null;
  teeTimeISO: string | null;
  actualStartISO?: string | null;
  startHole: number;
  roundDate: string | null;
  perHoleMinutes?: PerHoleMinutes | null;
  now?: Date;
}): CaptureLagResult {
  const now = args.now ?? new Date();
  const holesPlayed = Math.max(
    0,
    Math.min(18, Math.trunc(Number(args.holesPlayed) || 0))
  );
  const startHole =
    args.startHole >= 1 && args.startHole <= 18 ? args.startHole : 1;

  const teeDate = resolveTeeDate({
    teeTimeISO: args.teeTimeISO,
    actualStartISO: args.actualStartISO,
    roundDate: args.roundDate,
  });

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

  if (holesPlayed >= 18) {
    return {
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
    };
  }

  if (!teeDate) {
    return {
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
          : "Sin hora de salida (programada ni real)",
      priority: holesPlayed > 0 ? 40 : 50,
    };
  }

  const minutesSinceStart =
    (now.getTime() - teeDate.getTime()) / 60000;

  if (minutesSinceStart < -2) {
    return {
      kind: "no_salido",
      expectedHoles: 0,
      holesPlayed,
      holesBehind: 0,
      minutesSinceStart: Math.round(minutesSinceStart),
      minutesSinceLastCapture,
      captureHole,
      reason: `Sale en ~${Math.abs(Math.round(minutesSinceStart))} min`,
      priority: 80,
    };
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
    return {
      kind: "critico",
      expectedHoles,
      holesPlayed: 0,
      holesBehind: Math.max(holesBehind, expectedHoles || 1),
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: null,
      captureHole: null,
      reason: `Sin ningún hoyo capturado · ${minsStart} min en cancha`,
      priority: 0,
    };
  }

  // 2) Retraso grande en hoyos capturados vs reloj.
  if (holesBehind >= HOLES_BEHIND_CRITICO) {
    return {
      kind: "critico",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Captura ${holesBehind} hoyos atrasada (va ${holesPlayed}, debería ~${expectedHoles})`,
      priority: 1,
    };
  }

  if (holesBehind >= HOLES_BEHIND_ATRASADO) {
    return {
      kind: "atrasado",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Captura ${holesBehind} hoyos atrasada (va ${holesPlayed}, debería ~${expectedHoles})`,
      priority: 5,
    };
  }

  // 3) Silencio largo en captura (dejaron de anotar).
  if (
    minsSilent != null &&
    minsSilent >= SILENCE_CAPTURE_ALERT_MIN &&
    minutesSinceStart >= SILENCE_CAPTURE_ALERT_MIN
  ) {
    return {
      kind: "silencioso",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `Sin capturas desde hace ${minsSilent} min (último hoyo seq. ${holesPlayed})`,
      priority: 10,
    };
  }

  if (holesPlayed === 0 && minutesSinceStart >= 8) {
    return {
      kind: "silencioso",
      expectedHoles,
      holesPlayed: 0,
      holesBehind: Math.max(0, expectedHoles),
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: null,
      captureHole: null,
      reason: `Aún sin primer hoyo capturado · ${minsStart} min desde salida`,
      priority: 12,
    };
  }

  if (holesBehind >= HOLES_BEHIND_ALERT) {
    return {
      kind: "atrasado",
      expectedHoles,
      holesPlayed,
      holesBehind,
      minutesSinceStart: minsStart,
      minutesSinceLastCapture: minsSilent,
      captureHole,
      reason: `1 hoyo de captura retrasada (va ${holesPlayed}, debería ~${expectedHoles})`,
      priority: 15,
    };
  }

  return {
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
  };
}

export function isCaptureProblem(kind: CaptureLagKind): boolean {
  return (
    kind === "critico" || kind === "atrasado" || kind === "silencioso"
  );
}
