import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCaddieContext,
  buildPlayerContext,
  type ResolvedContext,
} from "@/lib/telegram/ritmo/handleLocationUpdate";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";

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

  return await buildPlayerContext(supabase, {
    id: player.id,
    first_name: player.first_name ?? null,
  });
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
  const hoyo = holes ? detectHole({ lat, lon }, holes) : null;

  // group_id: el del contexto activo, o el hint del URL si el contexto
  // no lo trajo (caso raro: el jugador abrió un link de un grupo distinto).
  const groupId = ctx.groupId ?? (groupIdHint && groupIdHint.trim()
    ? groupIdHint.trim()
    : null);

  // Nota: la tabla `ritmo_positions` solo tiene las columnas que ya usa el
  // pipeline de Telegram. No incluimos `accuracy` ni `source` para evitar
  // tocar el schema; si se necesitan, se agregan en migración aparte.
  void accuracy;
  const { error: insertErr } = await supabase.from("ritmo_positions").insert({
    tournament_id: ctx.tournamentId,
    round_id: ctx.roundId,
    group_id: groupId,
    player_id: ctx.playerId,
    telegram_user_id: null,
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
