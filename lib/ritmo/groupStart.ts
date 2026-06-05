import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTeeDateTime } from "@/lib/telegram/ritmo/paceCalculator";

/** Instante de referencia para ritmo: salida real > tee programado. */
export function resolveGroupStartDate(args: {
  actualStartAt: string | null | undefined;
  teeTime: string | null | undefined;
  roundDate: string | null | undefined;
}): Date | null {
  if (args.actualStartAt) {
    const d = new Date(args.actualStartAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (args.roundDate && args.teeTime) {
    return parseTeeDateTime(args.roundDate, args.teeTime);
  }
  return null;
}

export function formatStartTimeMexico(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

export type MarkGroupStartResult = {
  ok: boolean;
  actualStartAt: string | null;
  alreadySet: boolean;
  error?: string;
};

/** Marca la hora de arranque real del grupo (idempotente si ya existe). */
export async function markGroupStarted(
  admin: SupabaseClient,
  groupId: string,
  opts?: { startedAt?: Date; force?: boolean }
): Promise<MarkGroupStartResult> {
  const { data: group, error: loadErr } = await admin
    .from("pairing_groups")
    .select("id, actual_start_at")
    .eq("id", groupId)
    .maybeSingle();

  if (loadErr || !group?.id) {
    return {
      ok: false,
      actualStartAt: null,
      alreadySet: false,
      error: loadErr?.message ?? "Grupo no encontrado.",
    };
  }

  const existing = group.actual_start_at
    ? String(group.actual_start_at)
    : null;
  if (existing && !opts?.force) {
    return { ok: true, actualStartAt: existing, alreadySet: true };
  }

  const at = (opts?.startedAt ?? new Date()).toISOString();
  const { error: updErr } = await admin
    .from("pairing_groups")
    .update({ actual_start_at: at })
    .eq("id", groupId);

  if (updErr) {
    return {
      ok: false,
      actualStartAt: null,
      alreadySet: false,
      error: updErr.message,
    };
  }

  return { ok: true, actualStartAt: at, alreadySet: false };
}

/** Limpia la hora de arranque (comité). */
export async function clearGroupStart(
  admin: SupabaseClient,
  groupId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from("pairing_groups")
    .update({ actual_start_at: null })
    .eq("id", groupId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
