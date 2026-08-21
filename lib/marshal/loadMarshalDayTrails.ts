import type { SupabaseClient } from "@supabase/supabase-js";
import { profileInitials } from "@/lib/marshal/profileInitials";
import {
  computeMarshalTrailStats,
  type MarshalTrailStats,
  type TrailPoint,
} from "@/lib/marshal/marshalTrailStats";

export type MarshalDayTrail = {
  profileId: string;
  name: string;
  initials: string;
  color: string;
  points: TrailPoint[];
  stats: MarshalTrailStats;
};

const TRAIL_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#fb923c",
  "#2dd4bf",
  "#e879f9",
];

/**
 * Carga pings GPS de marshals en [dayStartISO, dayEndISO) y arma
 * rutas + estadísticas (estático 100 m, GPS apagado).
 */
export async function loadMarshalDayTrails(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    dayStartISO: string;
    dayEndISO: string;
    now?: Date;
    staticMeters?: number;
    gapThresholdMin?: number;
  }
): Promise<MarshalDayTrail[]> {
  const tid = String(args.tournamentId ?? "").trim();
  if (!tid) return [];

  const { data: rows, error } = await admin
    .from("ritmo_positions")
    .select("profile_id, lat, lon, ts")
    .eq("tournament_id", tid)
    .not("profile_id", "is", null)
    .gte("ts", args.dayStartISO)
    .lt("ts", args.dayEndISO)
    .order("ts", { ascending: true })
    .limit(20000);

  if (error) {
    console.error("loadMarshalDayTrails:", error);
    return [];
  }

  const byProfile = new Map<string, TrailPoint[]>();
  for (const row of rows ?? []) {
    const pid = String(row.profile_id ?? "").trim();
    if (!pid) continue;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const list = byProfile.get(pid) ?? [];
    list.push({ lat, lon, ts: String(row.ts) });
    byProfile.set(pid, list);
  }

  if (byProfile.size === 0) return [];

  const profileIds = Array.from(byProfile.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", profileIds);

  const nameById = new Map<string, { first: string | null; last: string | null }>();
  for (const p of profiles ?? []) {
    nameById.set(String(p.id), {
      first: (p.first_name as string | null) ?? null,
      last: (p.last_name as string | null) ?? null,
    });
  }

  const now = args.now ?? new Date();
  const out: MarshalDayTrail[] = [];
  let colorIdx = 0;
  for (const [profileId, points] of byProfile) {
    const names = nameById.get(profileId);
    const name =
      [names?.first, names?.last]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(" ") || "Marshal";
    const color = TRAIL_COLORS[colorIdx % TRAIL_COLORS.length]!;
    colorIdx += 1;
    out.push({
      profileId,
      name,
      initials: profileInitials(names?.first ?? null, names?.last ?? null),
      color,
      points,
      stats: computeMarshalTrailStats(points, {
        now,
        staticMeters: args.staticMeters ?? 100,
        gapThresholdMin: args.gapThresholdMin ?? 3,
      }),
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

/** Inicio/fin del día en México (UTC-6) como ISO UTC para filtrar `ts`. */
export function mexicoDayBoundsISO(ymd: string): {
  dayStartISO: string;
  dayEndISO: string;
} {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) {
    const fallback = new Date().toISOString();
    return { dayStartISO: fallback, dayEndISO: fallback };
  }
  // 00:00 CDMX = 06:00 UTC
  const start = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dayStartISO: start.toISOString(), dayEndISO: end.toISOString() };
}
