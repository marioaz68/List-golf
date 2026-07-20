import {
  CCQ_HOLE_POINTS,
  greenDistancesForHole,
  yardsBetween,
  type HoleGreenPoints,
} from "@/lib/distances/ccqHolePoints";
import { bearingDegrees } from "@/lib/distances/ccqGreens";
import { computeAllHoleDistances } from "@/lib/distances/ccqGreens";
import type { LieKind } from "@/lib/distances/detectLie";
import {
  addPlannedShot,
  completeShotArrival,
  defaultHoleShotsStore,
  lastBallPosition,
  pendingShotOnHole,
  shotsForHole,
  type HoleShotsStore,
  type HoleShot,
} from "@/lib/distances/holeShots";
import { yardsToGreenCenter } from "@/lib/distances/holeComplete";
import type { PlayerBagClub } from "@/lib/distances/playerBag";
import { pickBestClubAndCarry } from "@/lib/distances/suggestClub";
import { pointAtBearingYards } from "@/lib/distances/shotTrajectory";
import type { LatLon } from "@/lib/distances/holeBoundary";
import type { SupabaseClient } from "@supabase/supabase-js";
import { smoothedHoleForGroup } from "@/lib/telegram/ritmo/paceCalculator";
import type { PlayerBag } from "@/lib/distances/playerBag";
import { defaultPlayerBag } from "@/lib/distances/playerBag";
import { resolveShotsScopeKey } from "@/lib/distances/shotsScopeKey";
import type { WatchSwingMetrics } from "@/lib/distances/swingMetrics";

function attachSwingMetrics(
  store: HoleShotsStore,
  hole: number,
  shotId: string,
  metrics?: WatchSwingMetrics | null
): HoleShotsStore {
  if (!metrics) return store;
  const key = String(hole);
  return {
    ...store,
    byHole: {
      ...store.byHole,
      [key]: (store.byHole[key] ?? []).map((s) =>
        s.id === shotId ? { ...s, swingMetrics: metrics } : s
      ),
    },
  };
}

/** Lie aproximado en servidor (sin polígonos calibrados en caliente). */
export function detectLieSimpleForHole(
  hole: number,
  lat: number,
  lon: number
): LieKind {
  const hp = CCQ_HOLE_POINTS[hole];
  if (!hp) return "fairway";
  const toCenter = yardsBetween(lat, lon, hp.center.lat, hp.center.lon);
  if (toCenter <= 22) return "green";
  return "fairway";
}

export interface ApplyWatchSwingInput {
  hole: number;
  watchEventId: string;
  strikePoint: LatLon;
  enabledClubs: PlayerBagClub[];
  holePoints: HoleGreenPoints;
  swingMetrics?: WatchSwingMetrics | null;
}

/** Inserta un golpe de yardas a partir de un swing del Watch (idempotente). */
export function applyWatchSwingStroke(
  store: HoleShotsStore,
  input: ApplyWatchSwingInput
): { store: HoleShotsStore; shot: HoleShot } | null {
  const shotId = `watch-${input.watchEventId}`;
  if (shotsForHole(store, input.hole).some((s) => s.id === shotId)) {
    return null;
  }

  const from =
    lastBallPosition(store, input.hole, input.holePoints.tee) ??
    input.holePoints.tee;

  const lieAtFrom = detectLieSimpleForHole(
    input.hole,
    from.lat,
    from.lon
  );
  const onGreen = lieAtFrom === "green";
  const yardsToGreen = yardsToGreenCenter(from, input.holePoints.center);
  const greenDist = greenDistancesForHole(
    from.lat,
    from.lon,
    input.holePoints
  );

  const pending = pendingShotOnHole(store, input.hole);
  if (pending && !pending.id.startsWith("watch-")) {
    const bearing = bearingDegrees(
      pending.from.lat,
      pending.from.lon,
      input.holePoints.center.lat,
      input.holePoints.center.lon
    );
    const landing = pointAtBearingYards(
      pending.from.lat,
      pending.from.lon,
      bearing,
      pending.plannedYards
    );
    const lieLanding = detectLieSimpleForHole(
      input.hole,
      landing.lat,
      landing.lon
    );
    let next = completeShotArrival(
      store,
      input.hole,
      pending.id,
      landing,
      pending.plannedYards,
      lieLanding
    );
    next = attachSwingMetrics(next, input.hole, pending.id, input.swingMetrics);
    const shot = shotsForHole(next, input.hole).find((s) => s.id === pending.id);
    return shot ? { store: next, shot } : null;
  }

  const pick = pickBestClubAndCarry(
    input.enabledClubs,
    yardsToGreen,
    greenDist,
    onGreen,
    false,
    lieAtFrom
  );
  if (!pick) return null;

  let { store: next } = addPlannedShot(
    store,
    input.hole,
    from,
    pick.catalogId,
    pick.swing,
    pick.carryYards,
    { id: shotId, source: "watch", swingMetrics: input.swingMetrics ?? undefined }
  );

  const bearing = bearingDegrees(
    from.lat,
    from.lon,
    input.holePoints.center.lat,
    input.holePoints.center.lon
  );
  const landing = pointAtBearingYards(
    from.lat,
    from.lon,
    bearing,
    pick.carryYards
  );
  const lieLanding = detectLieSimpleForHole(
    input.hole,
    landing.lat,
    landing.lon
  );
  next = completeShotArrival(
    next,
    input.hole,
    shotId,
    landing,
    pick.carryYards,
    lieLanding
  );

  const finalShot = shotsForHole(next, input.hole).find((s) => s.id === shotId);
  if (!finalShot) return null;
  return { store: { ...next, updatedAt: Date.now() }, shot: finalShot };
}

async function resolvePlayerBagKey(
  supabase: SupabaseClient,
  entryId: string | null,
  playerId: string | null
): Promise<string | null> {
  if (playerId) return `player:${playerId}`;
  if (entryId) {
    const { data } = await supabase
      .from("tournament_entries")
      .select("player_id")
      .eq("id", entryId)
      .maybeSingle();
    const pid = (data as { player_id?: string | null } | null)?.player_id;
    if (pid) return `player:${pid}`;
  }
  return null;
}

async function loadBag(
  supabase: SupabaseClient,
  bagKey: string | null,
  scopeKey: string
): Promise<PlayerBag> {
  for (const key of [bagKey, scopeKey].filter(Boolean) as string[]) {
    const { data } = await supabase
      .from("yardage_player_bags")
      .select("payload")
      .eq("scope_key", key)
      .maybeSingle();
    const payload = (data as { payload?: PlayerBag | null } | null)?.payload;
    if (payload?.version === 1 && Array.isArray(payload.clubs)) {
      return payload;
    }
  }
  return defaultPlayerBag();
}

export async function resolveWatchSwingHole(
  supabase: SupabaseClient,
  args: {
    lat: number;
    lon: number;
    hoyoDetected: number | null;
    groupId: string | null;
  }
): Promise<number | null> {
  let hoyo = args.hoyoDetected;
  if (hoyo == null || hoyo < 1 || hoyo > 18) {
    const nearest = computeAllHoleDistances(args.lat, args.lon)[0];
    if (!nearest || nearest.distanceYards > 550) return null;
    hoyo = nearest.holeNo;
  }

  if (args.groupId) {
    const stable = await smoothedHoleForGroup(supabase, args.groupId);
    if (stable != null) {
      const next = (stable % 18) + 1;
      if (hoyo !== stable && hoyo !== next) {
        return stable;
      }
    }
  }

  return hoyo;
}

export async function mergeWatchSwingYardage(
  supabase: SupabaseClient,
  input: {
    watchEventId: string;
    entryId: string | null;
    caddieId: string | null;
    playerId: string | null;
    groupId: string | null;
    roundId: string | null;
    tournamentId: string | null;
    lat: number;
    lon: number;
    hoyoDetected: number | null;
    swingMetrics?: WatchSwingMetrics | null;
  }
): Promise<
  | { ok: true; hole: number; shotId: string; scopeKey: string }
  | { ok: false; error: string }
> {
  const scopeKey = resolveShotsScopeKey({
    entryId: input.entryId,
    caddieId: input.caddieId,
  });
  if (!scopeKey) {
    return { ok: false, error: "Sin scope_key para yardas." };
  }

  const hole = await resolveWatchSwingHole(supabase, {
    lat: input.lat,
    lon: input.lon,
    hoyoDetected: input.hoyoDetected,
    groupId: input.groupId,
  });
  if (hole == null) {
    return { ok: false, error: "No se pudo determinar el hoyo activo." };
  }

  const holePoints = CCQ_HOLE_POINTS[hole];
  if (!holePoints) {
    return { ok: false, error: "Hoyo sin puntos de referencia." };
  }

  const { data: shotsRow } = await supabase
    .from("yardage_shot_logs")
    .select("payload")
    .eq("scope_key", scopeKey)
    .maybeSingle();

  let store: HoleShotsStore = defaultHoleShotsStore();
  const rawPayload = (shotsRow as { payload?: HoleShotsStore | null } | null)
    ?.payload;
  if (rawPayload?.byHole) {
    store = rawPayload;
  }

  const bagKey = await resolvePlayerBagKey(
    supabase,
    input.entryId,
    input.playerId
  );
  const bag = await loadBag(supabase, bagKey, scopeKey);
  const enabledClubs = bag.clubs.filter((c) => c.enabled);

  const applied = applyWatchSwingStroke(store, {
    hole,
    watchEventId: input.watchEventId,
    strikePoint: { lat: input.lat, lon: input.lon },
    enabledClubs,
    holePoints,
    swingMetrics: input.swingMetrics,
  });

  if (!applied) {
    return { ok: false, error: "Golpe ya fusionado o sin bolsa válida." };
  }

  const row = {
    scope_key: scopeKey,
    entry_id: input.entryId,
    caddie_id: input.caddieId,
    round_id: input.roundId,
    course_id: null,
    payload: applied.store,
    payload_version: 2,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("yardage_shot_logs")
    .upsert(row, { onConflict: "scope_key" });

  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }

  await supabase
    .from("watch_swing_events")
    .update({
      yardage_shot_id: applied.shot.id,
      yardage_merged_at: new Date().toISOString(),
      hoyo_detectado: hole,
    })
    .eq("id", input.watchEventId);

  return {
    ok: true,
    hole,
    shotId: applied.shot.id,
    scopeKey,
  };
}
