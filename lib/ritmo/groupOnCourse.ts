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
  if (args.gpsState !== "none") return true;
  if (args.actualStartAt) return true;
  const rd = args.roundDate?.trim();
  const tt = args.teeTime?.trim();
  if (rd && tt) {
    const tee = parseTeeDateTime(rd, tt);
    const now = args.now ?? new Date();
    if (tee && now.getTime() >= tee.getTime() - 2 * 60 * 1000) return true;
  }
  return false;
}
