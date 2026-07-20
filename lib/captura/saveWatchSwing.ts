import type { SupabaseClient } from "@supabase/supabase-js";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import {
  resolveContextFromCaddie,
  resolveContextFromEntry,
} from "@/lib/captura/positionFromActor";
import { mergeWatchSwingYardage } from "@/lib/captura/mergeWatchSwingYardage";
import {
  parseWatchSwingMetrics,
  type WatchSwingMetrics,
} from "@/lib/distances/swingMetrics";

export interface WatchSwingInput {
  entryId?: string | null;
  caddieId?: string | null;
  lat: number;
  lon: number;
  swingNo?: number | null;
  detectedAt?: string | null;
  swingMetrics?: WatchSwingMetrics | null;
}

export type WatchSwingResult =
  | {
      ok: true;
      hoyo: number | null;
      id: string;
      swingMetrics?: WatchSwingMetrics | null;
      yardage?: {
        hole: number;
        shotId: string;
        scopeKey: string;
      };
    }
  | { ok: false; error: string };

export async function saveWatchSwing(
  supabase: SupabaseClient,
  input: WatchSwingInput
): Promise<WatchSwingResult> {
  const { lat, lon, swingNo, detectedAt, swingMetrics } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "lat/lon inválidos." };
  }

  let ctx = null;
  const caddieId = input.caddieId?.trim() || null;
  const entryId = input.entryId?.trim() || null;

  if (caddieId) {
    ctx = await resolveContextFromCaddie(supabase, caddieId);
  }
  if (!ctx && entryId) {
    ctx = await resolveContextFromEntry(supabase, entryId);
  }
  if (!ctx) {
    return { ok: false, error: "Actor no vinculado a torneo/ronda activa." };
  }

  const holes = getCourseHoles(ctx.courseName);
  const hoyo = holes ? detectHole({ lat, lon }, holes) : null;

  const row = {
    tournament_id: ctx.tournamentId,
    round_id: ctx.roundId,
    group_id: ctx.groupId,
    entry_id: entryId,
    caddie_id: caddieId,
    player_id: ctx.playerId,
    lat,
    lon,
    hoyo_detectado: hoyo,
    swing_no:
      typeof swingNo === "number" && Number.isFinite(swingNo) ? swingNo : null,
    detected_at: detectedAt?.trim() || new Date().toISOString(),
    source: "watch",
    backswing_velocity_dps: swingMetrics?.backswingVelocityDps ?? null,
    forwardswing_velocity_dps: swingMetrics?.forwardSwingVelocityDps ?? null,
    backswing_club_deg: swingMetrics?.backswingClubDeg ?? null,
    forward_club_deg: swingMetrics?.forwardClubDeg ?? null,
  };

  const { data, error } = await supabase
    .from("watch_swing_events")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  const eventId = String(data.id);

  const yardageMerge = await mergeWatchSwingYardage(supabase, {
    watchEventId: eventId,
    entryId,
    caddieId,
    playerId: ctx.playerId,
    groupId: ctx.groupId,
    roundId: ctx.roundId,
    tournamentId: ctx.tournamentId,
    lat,
    lon,
    hoyoDetected: hoyo,
    swingMetrics,
  });

  return {
    ok: true,
    hoyo: yardageMerge.ok ? yardageMerge.hole : hoyo,
    id: eventId,
    swingMetrics: swingMetrics ?? null,
    yardage: yardageMerge.ok
      ? {
          hole: yardageMerge.hole,
          shotId: yardageMerge.shotId,
          scopeKey: yardageMerge.scopeKey,
        }
      : undefined,
  };
}

export { parseWatchSwingMetrics };
