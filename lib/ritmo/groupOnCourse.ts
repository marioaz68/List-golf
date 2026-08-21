import { parseTeeDateTime } from "@/lib/telegram/ritmo/paceCalculator";

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
  if (args.scoreHolesPlayed > 0 || args.lastScoreTs) return true;
  if (args.actualStartAt) return true;

  const now = args.now ?? new Date();
  const tee =
    args.roundDate?.trim() && args.teeTime?.trim()
      ? parseTeeDateTime(args.roundDate.trim(), args.teeTime.trim())
      : null;
  const pastTee = Boolean(tee && now.getTime() >= tee.getTime());

  // GPS en vivo: en cancha. GPS viejo: solo si ya debió haber salido
  // (evita que un ping de prueba a las 6:30 deje el grupo de las 11:24
  // como “en cancha” toda la mañana).
  if (args.gpsState === "live") return true;
  if (args.gpsState === "stale" && pastTee) return true;

  if (tee && now.getTime() >= tee.getTime() - 2 * 60 * 1000) return true;
  return false;
}
