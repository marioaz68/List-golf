import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveContextFromEntry,
  resolveContextFromCaddie,
} from "@/lib/captura/positionFromActor";
import { resolveRitmoContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import type { ResolvedContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import {
  computePace,
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
    };
  }

  // Hoyo: usa el que detectó el cliente; si no, la moda del grupo.
  let hoyo = input.hole ?? null;
  if (hoyo == null || hoyo < 1 || hoyo > 18) {
    hoyo = await smoothedHoleForGroup(supabase, ctx.groupId);
  }

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

  return {
    ok: true,
    status: pace.kind,
    color: paceColorFromDelta(deltaMinutes),
    deltaMinutes,
    hoyo: pace.kind === "sin_datos" ? null : pace.hoyo,
    message: pace.msg,
  };
}
