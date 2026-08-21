import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarshalDot } from "@/app/ritmo/demo/RitmoMap";
import { profileInitials } from "@/lib/marshal/profileInitials";

/** Ventana amplia: el panel desktop puede quedar abierto sin GPS cada minuto. */
const FRESH_MINUTES = 90;

type PositionRow = {
  profile_id: string;
  lat: number;
  lon: number;
  hoyo_detectado: number | null;
  ts: string;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

/** Última posición GPS reciente de cada marshal en el torneo. */
export async function loadMarshalPositions(
  admin: SupabaseClient,
  tournamentId: string
): Promise<MarshalDot[]> {
  const tid = String(tournamentId ?? "").trim();
  if (!tid) return [];

  const cutoff = new Date(Date.now() - FRESH_MINUTES * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("ritmo_positions")
    .select("profile_id, lat, lon, hoyo_detectado, ts")
    .eq("tournament_id", tid)
    .not("profile_id", "is", null)
    .gte("ts", cutoff)
    .order("ts", { ascending: false });

  if (error) {
    console.error("LOAD MARSHAL POSITIONS:", error);
    return [];
  }

  const latestByProfile = new Map<string, PositionRow>();
  for (const row of (rows ?? []) as PositionRow[]) {
    const pid = String(row.profile_id ?? "").trim();
    if (!pid || latestByProfile.has(pid)) continue;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    latestByProfile.set(pid, { ...row, lat, lon });
  }

  if (latestByProfile.size === 0) return [];

  const profileIds = Array.from(latestByProfile.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", profileIds);

  const profileById = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) {
    profileById.set(p.id, p);
  }

  const out: MarshalDot[] = [];
  for (const [profileId, pos] of latestByProfile) {
    const profile = profileById.get(profileId);
    const name =
      [profile?.first_name, profile?.last_name]
        .map((p) => String(p ?? "").trim())
        .filter(Boolean)
        .join(" ") || "Marshal";
    out.push({
      id: profileId,
      lat: pos.lat,
      lon: pos.lon,
      initials: profileInitials(
        profile?.first_name ?? null,
        profile?.last_name ?? null
      ),
      name,
      hoyo: pos.hoyo_detectado,
      updatedAt: pos.ts,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}
