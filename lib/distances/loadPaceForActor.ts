import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveContextFromEntry,
  resolveContextFromCaddie,
} from "@/lib/captura/positionFromActor";
import { resolveRitmoContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import type { ResolvedContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import {
  currentHoleFromHolesPlayed,
  loadGroupScoreProgress,
} from "@/lib/ritmo/scoreProgress";
import {
  computePace,
  holeScheduleWindow,
  loadPerHoleMinutes,
  smoothedHoleForGroup,
} from "@/lib/telegram/ritmo/paceCalculator";

/** Color del semáforo de ritmo según minutos de atraso (positivo = atrasado). */
export type PaceColor = "red" | "yellow" | "green" | "blue" | "none";

export interface PaceForActorResult {
  ok: boolean;
  /** "atrasado" | "en_ritmo" | "adelantado" | "sin_datos" | "no_context" */
  status: string;
  color: PaceColor;
  deltaMinutes: number | null;
  hoyo: number | null;
  message: string;
  /** Horario "ideal" en que el grupo debería jugar el hoyo actual (hora de
   *  México, h:mm:ss). Null si no hay hora de salida o no se resolvió el hoyo. */
  windowStart: string | null;
  windowEnd: string | null;
}

/**
 * Color según los umbrales del usuario:
 *   - atraso >= 10 min  → rojo
 *   - atraso 5–10 min   → amarillo
 *   - -5..5 min (en ritmo) → verde
 *   - más rápido que el ritmo (< -5) → azul
 */
export function paceColorFromDelta(delta: number | null): PaceColor {
  if (delta == null) return "none";
  if (delta >= 10) return "red";
  if (delta >= 5) return "yellow";
  if (delta < -5) return "blue";
  return "green";
}

interface LoadPaceInput {
  entryId?: string | null;
  caddieId?: string | null;
  telegramUserId?: string | null;
  /** Hoyo actual que el cliente detectó por GPS (preferido). */
  hole?: number | null;
}

async function resolveContext(
  supabase: SupabaseClient,
  input: LoadPaceInput
): Promise<ResolvedContext | null> {
  if (input.caddieId) {
    const ctx = await resolveContextFromCaddie(supabase, input.caddieId);
    if (ctx) return ctx;
  }
  if (input.entryId) {
    const ctx = await resolveContextFromEntry(supabase, input.entryId);
    if (ctx) return ctx;
  }
  if (input.telegramUserId) {
    const res = await resolveRitmoContext(supabase, input.telegramUserId);
    if (res.status === "ok") return res.ctx;
  }
  return null;
}

/** Hoyo actual para ritmo: escores capturados > GPS del cliente > moda del grupo. */
async function resolvePaceHole(
  supabase: SupabaseClient,
  ctx: ResolvedContext,
  clientHole: number | null
): Promise<number | null> {
  if (ctx.roundId && ctx.groupId) {
    const { data: mems } = await supabase
      .from("pairing_group_members")
      .select("entry_id")
      .eq("group_id", ctx.groupId);
    const entryIds = (mems ?? [])
      .map((m) => m.entry_id)
      .filter((id): id is string => Boolean(id));
    if (entryIds.length > 0) {
      const byGroup = new Map([[ctx.groupId, entryIds]]);
      const meta = new Map([
        [ctx.groupId, { starting_hole: ctx.groupStartHole }],
      ]);
      const progress = await loadGroupScoreProgress(
        supabase,
        ctx.roundId,
        byGroup,
        meta
      );
      const p = progress.get(ctx.groupId);
      if (p && p.holesPlayed > 0) {
        const fromScores = currentHoleFromHolesPlayed(
          p.holesPlayed,
          p.startHole
        );
        if (fromScores != null) return fromScores;
      }
    }
  }

  if (clientHole != null && clientHole >= 1 && clientHole <= 18) {
    return clientHole;
  }
  if (!ctx.groupId) return null;
  return smoothedHoleForGroup(supabase, ctx.groupId);
}

export async function loadPaceForActor(
  supabase: SupabaseClient,
  input: LoadPaceInput
): Promise<PaceForActorResult> {
  const ctx = await resolveContext(supabase, input);
  if (!ctx || !ctx.groupId) {
    return {
      ok: false,
      status: "no_context",
      color: "none",
      deltaMinutes: null,
      hoyo: null,
      message: "Sin grupo/ronda activa.",
      windowStart: null,
      windowEnd: null,
    };
  }

  // Hoyo: escores del grupo > el que mandó el cliente > moda GPS del grupo.
  const hoyo = await resolvePaceHole(supabase, ctx, input.hole ?? null);

  const perHoleMinutes = await loadPerHoleMinutes(supabase, ctx.courseId);
  const pace = computePace({
    hoyoActual: hoyo,
    teeTimeISO: ctx.groupTeeTime,
    actualStartISO: ctx.groupActualStart,
    teeStartHole: ctx.groupStartHole,
    roundDate: ctx.roundDate,
    perHoleMinutes,
  });

  const deltaMinutes =
    pace.kind === "atrasado" ||
    pace.kind === "adelantado" ||
    pace.kind === "en_ritmo"
      ? pace.deltaMinutes
      : null;

  // Ventana de horario ideal del hoyo actual (independiente del color/delta).
  const win =
    hoyo != null
      ? holeScheduleWindow({
          hole: hoyo,
          teeTimeISO: ctx.groupTeeTime,
          actualStartISO: ctx.groupActualStart,
          teeStartHole: ctx.groupStartHole,
          roundDate: ctx.roundDate,
          perHoleMinutes,
        })
      : null;

  return {
    ok: true,
    status: pace.kind,
    color: paceColorFromDelta(deltaMinutes),
    deltaMinutes,
    hoyo: pace.kind === "sin_datos" ? null : pace.hoyo,
    message: pace.msg,
    windowStart: win?.startLabel ?? null,
    windowEnd: win?.endLabel ?? null,
  };
}
