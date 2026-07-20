export interface WatchSwingMetrics {
  backswingVelocityDps: number;
  forwardSwingVelocityDps: number;
  backswingClubDeg: number;
  forwardClubDeg: number;
}

export function parseWatchSwingMetrics(
  raw: Record<string, unknown> | null | undefined
): WatchSwingMetrics | null {
  if (!raw) return null;
  const num = (k: string) => {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return null;
  };
  const backswingVelocityDps = num("backswing_velocity_dps");
  const forwardSwingVelocityDps = num("forwardswing_velocity_dps");
  const backswingClubDeg = num("backswing_club_deg");
  const forwardClubDeg = num("forward_club_deg");
  if (
    backswingVelocityDps == null ||
    forwardSwingVelocityDps == null ||
    backswingClubDeg == null ||
    forwardClubDeg == null
  ) {
    return null;
  }
  return {
    backswingVelocityDps,
    forwardSwingVelocityDps,
    backswingClubDeg,
    forwardClubDeg,
  };
}

export function formatWatchSwingMetrics(m: WatchSwingMetrics): string {
  return `Back ${Math.round(m.backswingClubDeg)}° @ ${Math.round(m.backswingVelocityDps)}°/s · Fwd ${Math.round(m.forwardClubDeg)}° @ ${Math.round(m.forwardSwingVelocityDps)}°/s`;
}

export function formatWatchSwingMetricsShort(m: WatchSwingMetrics): string {
  return `B ${Math.round(m.backswingClubDeg)}°/${Math.round(m.backswingVelocityDps)} · F ${Math.round(m.forwardClubDeg)}°/${Math.round(m.forwardSwingVelocityDps)}`;
}
