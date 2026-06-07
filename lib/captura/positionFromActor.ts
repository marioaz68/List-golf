import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCaddieContext,
  buildPlayerContext,
  type ResolvedContext,
} from "@/lib/telegram/ritmo/handleLocationUpdate";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import { smoothedHoleForGroup } from "@/lib/telegram/ritmo/paceCalculator";

const MAX_ACCURACY_M = 30;
const MAX_HOLE_JUMP = 2;

/** Args para guardar una posición GPS desde la Mini App de captura.
 *  La Mini App pasa `entryId` (jugador) o `caddieId` directamente — no hay
 *  telegram_user_id porque el ping viene del navegador, no de Telegram. */
export interface CapturaPositionInput {
  entryId?: string | null;
  caddieId?: string | null;
  lat: number;
  lon: number;
  accuracy?: number | null;
  /** Hint: si la Mini App ya conoce el group_id del URL, lo pasa de respaldo
   *  por si el actor no tiene contexto activo (entry sin asignación, etc.). */
  groupIdHint?: string | null;
}

export type CapturaPositionResult =
  | { ok: true; hoyo: number | null; groupId: string | null; tournamentId: string }
  | { ok: false; error: string };

async function resolveTelegramUserId(
  supabase: SupabaseClient,
  input: { playerId?: string | null; caddieId?: string | null }
): Promise<string | null> {
  if (input.playerId) {
    const { data } = await supabase
      .from("players")
      .select("telegram_user_id")
      .eq("id", input.playerId)
      .maybeSingle();
    const tg = String((data as { telegram_user_id?: string | null } | null)?.telegram_user_id ?? "").trim();
    return tg || null;
  }
  if (input.caddieId) {
    const { data } = await supabase
      .from("caddies")
      .select("telegram")
      .eq("id", input.caddieId)
      .maybeSingle();
    const tg = String((data as { telegram?: string | null } | null)?.telegram ?? "").trim();
    return /^\d+$/.test(tg) ? tg : null;
  }
  return null;
}

async function resolveContextFromEntry(
  supabase: SupabaseClient,
  entryId: string
): Promise<ResolvedContext | null> {
  const { data } = await supabase
    .from("tournament_entries")
    .select("id, player_id, players ( id, first_name )")
    .eq("id", entryId)
    .maybeSingle();

  if (!data?.player_id) return null;
  const p = data.players as
    | { id: string; first_name: string | null }
    | { id: string; first_name: string | null }[]
    | null;
  const player = Array.isArray(p) ? p[0] : p;
  if (!player) return null;

  return await buildPlayerContext(
    supabase,
    {
      id: player.id,
      first_name: player.first_name ?? null,
    },
    entryId
  );
}

async function resolveContextFromCaddie(
  supabase: SupabaseClient,
  caddieId: string
): Promise<ResolvedContext | null> {
  const { data } = await supabase
    .from("caddies")
    .select("id, first_name")
    .eq("id", caddieId)
    .maybeSingle();

  if (!data) return null;
  return await buildCaddieContext(supabase, {
    id: data.id as string,
    first_name: (data.first_name as string | null) ?? null,
  });
}

/** Pipeline: resuelve el actor → su contexto de ritmo → detecta hoyo →
 *  guarda en ritmo_positions. Pensado para pings periódicos de la Mini App
 *  (Browser geolocation), no para Live Location de Telegram. */
export async function saveCapturaPosition(
  supabase: SupabaseClient,
  input: CapturaPositionInput
): Promise<CapturaPositionResult> {
  const { lat, lon, accuracy, groupIdHint } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "lat/lon inválidos." };
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: "lat/lon fuera de rango." };
  }

  let ctx: ResolvedContext | null = null;
  if (input.caddieId) {
    ctx = await resolveContextFromCaddie(supabase, input.caddieId);
  }
  if (!ctx && input.entryId) {
    ctx = await resolveContextFromEntry(supabase, input.entryId);
  }
  if (!ctx) {
    return { ok: false, error: "Actor no vinculado a torneo/ronda activa." };
  }

  // Polígonos del campo: si no hay, igual guardamos la posición pero sin
  // detectar hoyo. El dashboard puede mostrar el pin sin saber el hoyo.
  const holes = getCourseHoles(ctx.courseName);
  const hoyoCrudo = holes ? detectHole({ lat, lon }, holes) : null;

  // Filtros silenciosos (mismos que el pipeline de Telegram):
  //  - accuracy > 30 m  -> no contar para detección de hoyo
  //  - salto > 2 hoyos respecto al hoyo estable del grupo -> outlier
  const noisy =
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy > MAX_ACCURACY_M;

  let stableHole: number | null = null;
  if (ctx.groupId && hoyoCrudo != null && !noisy) {
    stableHole = await smoothedHoleForGroup(supabase, ctx.groupId);
  }
  const tooFar =
    stableHole != null &&
    hoyoCrudo != null &&
    Math.abs(hoyoCrudo - stableHole) > MAX_HOLE_JUMP &&
    Math.abs(18 - Math.abs(hoyoCrudo - stableHole)) > MAX_HOLE_JUMP;

  const hoyo = noisy || tooFar ? null : hoyoCrudo;

  // group_id: el del contexto activo, o el hint del URL si el contexto
  // no lo trajo (caso raro: el jugador abrió un link de un grupo distinto).
  const groupId = ctx.groupId ?? (groupIdHint && groupIdHint.trim()
    ? groupIdHint.trim()
    : null);

  const telegramUserId = await resolveTelegramUserId(supabase, {
    playerId: ctx.playerId,
    caddieId: input.caddieId,
  });

  // Nota: la tabla `ritmo_positions` solo tiene las columnas que ya usa el
  // pipeline de Telegram. accuracy se usa solo para filtrar pings ruidosos
  // (definir si el hoyo cuenta o no); el valor en sí no se guarda en BD.
  const { error: insertErr } = await supabase.from("ritmo_positions").insert({
    tournament_id: ctx.tournamentId,
    round_id: ctx.roundId,
    group_id: groupId,
    player_id: ctx.playerId,
    telegram_user_id: telegramUserId,
    telegram_message_id: null,
    lat,
    lon,
    hoyo_detectado: hoyo,
    is_live_update: true,
  });

  if (insertErr) {
    console.error("CAPTURA POSITION INSERT:", insertErr);
    return { ok: false, error: "No pude guardar la posición." };
  }

  return {
    ok: true,
    hoyo,
    groupId,
    tournamentId: ctx.tournamentId,
  };
}
