import { parseTeeDateTime } from "@/lib/telegram/ritmo/paceCalculator";

/** Match cerrado, 18 hoyos o ronda congelada — ya no en ritmo en vivo. */
export function isGroupFinishedForRitmo(args: {
  status?: string | null;
  scoreFinished?: boolean | null;
}): boolean {
  return args.status === "cerrado" || args.scoreFinished === true;
}

/** Grupo que ya salió, captura o comparte GPS (visible en ritmo en vivo). */
export function isGroupOnCourse(args: {
  teeTime: string | null;
  actualStartAt: string | null;
  roundDate: string | null;
  scoreHolesPlayed: number;
  lastScoreTs: string | null;
  gpsState: "live" | "stale" | "none";
  now?: Date;
}): boolean {
  // Hoyos reales capturados → en cancha.
  if (args.scoreHolesPlayed > 0) return true;
  if (args.actualStartAt) return true;

  const now = args.now ?? new Date();
  const tee =
    args.roundDate?.trim() && args.teeTime?.trim()
      ? parseTeeDateTime(args.roundDate.trim(), args.teeTime.trim())
      : null;
  const nearOrPastTee = Boolean(
    tee && now.getTime() >= tee.getTime() - 2 * 60 * 1000
  );

  // GPS en vivo siempre. GPS viejo / bitácora sin hoyos: solo si ya debió salir
  // (evita pings de prueba o audit previo que metan el G11:00 a las 7:00).
  if (args.gpsState === "live") return true;
  if (args.gpsState === "stale" && nearOrPastTee) return true;
  if (args.lastScoreTs && nearOrPastTee) return true;
  if (nearOrPastTee) return true;
  return false;
}

/** En cancha y aún no terminó (ritmo / marshal en vivo). */
export function isGroupActiveInRitmo(
  args: Parameters<typeof isGroupOnCourse>[0] & {
    status?: string | null;
    scoreFinished?: boolean | null;
  }
): boolean {
  if (isGroupFinishedForRitmo(args)) return false;
  return isGroupOnCourse(args);
}
